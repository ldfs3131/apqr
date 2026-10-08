/**
 * Base de alunos da mentoria: plano (ativo/encerrado e vencimento), turma, último acesso e engajamento.
 * Serve para monitorar quem está estudando, quem está para vencer e para recuperação de vendas.
 *
 *  - Engajamento pelo último acesso (mais recente entre: login aqui, registro de estudo e último login na
 *    plataforma anterior): até 7 dias = Ativo · 8 a 30 = Atenção · mais de 30 = Inativo · nunca acessou.
 *  - Plano: encerrado se plan_status = 'ended' ou se a validade (access_until) já passou.
 *  - Importação (CSV) é idempotente: o e-mail identifica o aluno; reimportar atualiza turma, plano e acesso.
 */
import { SYSTEM, tx } from '../db/index.js';
import { audit, studentScope } from '../security/access.js';
import { badRequest, daysBetween, isValidDate, localDate, nowIso } from '../lib/util.js';
import { isValidCpf, onlyDigits } from '../lib/cpf.js';

export const ORIGIN_IMPORT = 'plataforma_anterior';
export const ENGAGEMENT = {
  active: { label: 'Ativo', max: 7 },
  attention: { label: 'Atenção', max: 30 },
  inactive: { label: 'Inativo' },
  never: { label: 'Nunca acessou' },
};
export const MAX_IMPORT_ROWS = 10000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ───────────── CSV ─────────────

/** Lê CSV (separador ; ou , detectado no cabeçalho; aspas duplas; BOM). Retorna linhas como arrays. */
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const firstLine = s.split(/\r?\n/, 1)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"' && cell === '') q = true; // aspas só abrem no início da célula
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (h) => String(h || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const HEADERS = {
  name: ['nome', 'name', 'aluno', 'nome_completo'],
  email: ['email', 'e_mail'],
  phone: ['celular', 'telefone', 'phone', 'whatsapp'],
  cpf: ['cpf'],
  cohort: ['turma', 'concurso', 'concurso_foco', 'turma_concurso_foco', 'cohort'],
  legacy_class: ['turma_original', 'turma_na_plataforma', 'turma_plataforma', 'nome_da_turma'],
  legacy_last_login: ['ultimo_login', 'ultimo_acesso', 'last_login'],
  access_until: ['fim_do_plano', 'fim_plano', 'validade', 'vencimento', 'access_until'],
  plan_status: ['situacao', 'situacao_do_plano', 'plano', 'status_plano'],
};

/** 'dd/mm/aaaa' ou 'aaaa-mm-dd' → 'aaaa-mm-dd'; vazio/traço → null; inválido → undefined. */
export function parseDate(v) {
  const s = String(v ?? '').trim();
  if (!s || s === '—' || s === '-') return null;
  let iso = s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidDate(iso) ? iso : undefined;
}

function parsePlanStatus(v) {
  const s = norm(v);
  if (!s) return null;
  if (['ativo', 'active', 'em_vigor', 'vigente'].includes(s)) return 'active';
  if (['encerrado', 'ended', 'inativo', 'expirado', 'vencido', 'cancelado'].includes(s)) return 'ended';
  return undefined;
}

/** Converte o CSV em registros normalizados + erros por linha (número da linha no arquivo). */
export function readRosterCsv(text, t) {
  const rows = parseCsv(text);
  if (!rows.length) throw badRequest('O arquivo está vazio.');
  const head = rows[0].map(norm);
  const col = {};
  for (const [key, aliases] of Object.entries(HEADERS)) {
    const i = head.findIndex((h) => aliases.includes(h));
    if (i >= 0) col[key] = i;
  }
  if (col.name === undefined || col.email === undefined) {
    throw badRequest('O arquivo precisa ter as colunas "nome" e "email". Use o modelo de importação.', 'invalid_csv');
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw badRequest(`Máximo de ${MAX_IMPORT_ROWS} alunos por importação.`);
  const out = [];
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());
    const line = i + 1;
    const rec = {
      line,
      name: get('name').replace(/\s+/g, ' ').slice(0, 120),
      email: get('email').toLowerCase(),
      phone: onlyDigits(get('phone')) || null,
      cpf: onlyDigits(get('cpf')) || null,
      cohort: get('cohort').slice(0, 120) || null,
      legacy_class: get('legacy_class').slice(0, 200) || null,
      legacy_last_login: parseDate(get('legacy_last_login')),
      access_until: parseDate(get('access_until')),
      plan_status: parsePlanStatus(get('plan_status')),
      warnings: [],
    };
    const errs = [];
    if (rec.name.length < 2) errs.push('nome ausente');
    if (!EMAIL_RE.test(rec.email)) errs.push('e-mail inválido');
    if (rec.legacy_last_login === undefined) errs.push('data de último login inválida');
    if (rec.access_until === undefined) errs.push('data de fim do plano inválida');
    if (rec.plan_status === undefined) errs.push('situação inválida (use "ativo" ou "encerrado")');
    if (errs.length) { errors.push({ line, email: rec.email || null, reason: errs.join('; ') }); continue; }
    if (rec.phone && (rec.phone.length < 10 || rec.phone.length > 11)) { rec.warnings.push('telefone ignorado (formato inválido)'); rec.phone = null; }
    if (rec.cpf && !isValidCpf(rec.cpf)) { rec.warnings.push('CPF ignorado (inválido)'); rec.cpf = null; }
    // Sem a coluna situação: plano ativo se a validade não passou (ou não foi informada).
    if (!rec.plan_status) rec.plan_status = rec.access_until && rec.access_until < t ? 'ended' : 'active';
    out.push(rec);
  }
  return { records: out, errors };
}

// ───────────── Importação ─────────────

/**
 * Importa a base. Cria o aluno com cadastro pendente (sem senha; o convite é gerado quando a professora quiser)
 * ou atualiza o aluno do mesmo e-mail neste ambiente. Nunca altera senha, nome ou dados de estudo de quem já existe.
 */
export async function importRoster(ctx, csvText, { dryRun = false, today: t }) {
  const { records, errors } = readRosterCsv(csvText, t);
  const seen = new Set();
  const unique = [];
  for (const r of records) {
    if (seen.has(r.email)) { errors.push({ line: r.line, email: r.email, reason: 'e-mail repetido no arquivo (mantida a primeira linha)' }); continue; }
    seen.add(r.email);
    unique.push(r);
  }
  // E-mail é único na plataforma: consulta em contexto de sistema para identificar contas de outros ambientes.
  const owners = await tx(SYSTEM, (d) =>
    unique.length ? d.all('SELECT lower(email) AS email, tenant_id, role FROM users WHERE lower(email) = ANY(?::text[])', [unique.map((r) => r.email)]) : []
  );
  const ownerBy = new Map(owners.map((o) => [o.email, o]));
  return tx(ctx, async (d) => {
    const existing = unique.length ? await d.all(
      `SELECT lower(u.email) AS email, st.id AS student_id, st.cpf, st.phone, st.legacy_last_login
         FROM users u JOIN students st ON st.user_id = u.id WHERE lower(u.email) = ANY(?::text[])`, [unique.map((r) => r.email)]) : [];
    const exBy = new Map(existing.map((e) => [e.email, e]));
    const cpfRows = await d.all('SELECT cpf, id FROM students WHERE cpf IS NOT NULL');
    const cpfOwner = new Map(cpfRows.map((c) => [c.cpf, c.id]));
    const summary = { created: 0, updated: 0, skipped: 0, active: 0, ended: 0, cohorts: new Set() };
    const warnings = [];
    const ts = nowIso();
    for (const r of unique) {
      const owner = ownerBy.get(r.email);
      const ex = exBy.get(r.email);
      if (owner && !ex) {
        errors.push({ line: r.line, email: r.email, reason: owner.tenant_id === ctx.tenantId ? 'e-mail pertence a alguém da equipe' : 'e-mail já usado em outro ambiente da plataforma' });
        continue;
      }
      // CPF: único por ambiente. Se já pertence a outro aluno (ou repete no arquivo), fica sem CPF e avisa.
      let cpf = r.cpf;
      if (cpf) {
        const holder = cpfOwner.get(cpf);
        if (holder && holder !== ex?.student_id) { cpf = null; r.warnings.push('CPF ignorado (já cadastrado para outro aluno)'); }
      }
      if (r.warnings.length) warnings.push({ line: r.line, email: r.email, reason: r.warnings.join('; ') });
      summary[r.plan_status === 'ended' ? 'ended' : 'active']++;
      if (r.cohort) summary.cohorts.add(r.cohort);
      if (ex) {
        summary.updated++;
        if (dryRun) continue;
        const lastLogin = [ex.legacy_last_login, r.legacy_last_login].filter(Boolean).sort().pop() || null;
        await d.run(
          `UPDATE students SET cohort = COALESCE(?, cohort), legacy_class = COALESCE(?, legacy_class), legacy_last_login = ?,
                  access_until = COALESCE(?, access_until), plan_status = ?, phone = COALESCE(phone, ?), cpf = COALESCE(cpf, ?),
                  updated_at = ? WHERE id = ?`,
          [r.cohort, r.legacy_class, lastLogin, r.access_until, r.plan_status, r.phone, ex.cpf ? null : cpf, ts, ex.student_id]
        );
        if (!ex.cpf && cpf) cpfOwner.set(cpf, ex.student_id);
      } else {
        summary.created++;
        if (dryRun) { if (cpf) cpfOwner.set(cpf, `novo:${r.email}`); continue; }
        const u = await d.one(
          `INSERT INTO users (tenant_id, email, name, role, status, created_at, updated_at) VALUES (?,?,?,'student','invited',?,?) RETURNING id`,
          [ctx.tenantId, r.email, r.name, ts, ts]
        );
        const st = await d.one(
          `INSERT INTO students (tenant_id, user_id, cpf, phone, cohort, legacy_class, legacy_last_login, access_until, plan_status, origin, imported_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
          [ctx.tenantId, u.id, cpf, r.phone, r.cohort, r.legacy_class, r.legacy_last_login, r.access_until, r.plan_status, ORIGIN_IMPORT, ts, ts, ts]
        );
        if (cpf) cpfOwner.set(cpf, st.id);
      }
    }
    summary.skipped = errors.length;
    const result = {
      dry_run: dryRun,
      total_lines: records.length + errors.filter((e) => !records.some((r) => r.line === e.line)).length,
      created: summary.created, updated: summary.updated, skipped: summary.skipped,
      active: summary.active, ended: summary.ended, cohorts: summary.cohorts.size,
      errors: errors.sort((a, b) => a.line - b.line).slice(0, 200),
      warnings: warnings.slice(0, 200),
      warnings_total: warnings.length,
    };
    if (!dryRun) {
      await audit(d, ctx, 'roster.import', { payload: { created: result.created, updated: result.updated, skipped: result.skipped } });
    }
    return result;
  });
}

// ───────────── Relatório ─────────────

export function engagementOf(daysSince) {
  if (daysSince == null) return 'never';
  if (daysSince <= ENGAGEMENT.active.max) return 'active';
  if (daysSince <= ENGAGEMENT.attention.max) return 'attention';
  return 'inactive';
}

/** Todos os alunos visíveis com plano, vencimento, último acesso e engajamento calculados para `t`. */
export async function rosterRows(d, ctx, t, tz) {
  const sc = studentScope(ctx);
  const rows = await d.all(
    `WITH last AS (
        SELECT student_id, max(d) AS last_activity FROM (
          SELECT student_id, max(date) AS d FROM study_sessions WHERE voided_at IS NULL GROUP BY student_id
          UNION ALL SELECT student_id, max(date) FROM question_logs WHERE voided_at IS NULL GROUP BY student_id
          UNION ALL SELECT student_id, max(date) FROM production_logs WHERE voided_at IS NULL GROUP BY student_id
        ) x GROUP BY student_id
      ), enr AS (
        SELECT e.student_id, string_agg(ed.name, ', ' ORDER BY e.created_at) AS editais
          FROM enrollments e JOIN editais ed ON ed.id = e.edital_id WHERE e.status = 'active' GROUP BY e.student_id
      )
     SELECT st.id, u.name, u.email, u.status AS user_status, u.last_login_at, st.phone, st.cohort, st.legacy_class,
            st.plan_status, st.access_until, st.legacy_last_login, st.origin, st.created_at, last.last_activity, enr.editais
       FROM students st JOIN users u ON u.id = st.user_id
       LEFT JOIN last ON last.student_id = st.id LEFT JOIN enr ON enr.student_id = st.id
      WHERE true${sc.sql}
      ORDER BY u.name`,
    sc.params
  );
  return rows.map((r) => {
    const login = r.last_login_at ? localDate(new Date(r.last_login_at), tz) : null;
    const last = [login, r.legacy_last_login, r.last_activity].filter(Boolean).sort().pop() || null;
    const days = last ? Math.max(0, daysBetween(last, t)) : null;
    const ended = r.plan_status === 'ended' || (r.access_until && r.access_until < t);
    return {
      id: r.id, name: r.name, email: r.email, phone: r.phone, user_status: r.user_status,
      cohort: r.cohort || 'Sem turma', legacy_class: r.legacy_class, editais: r.editais || null,
      plan: ended ? 'ended' : 'active',
      plan_end: r.access_until,
      days_to_end: r.access_until ? daysBetween(t, r.access_until) : null,
      last_access: last, days_since_access: days, engagement: engagementOf(days),
      imported: r.origin === ORIGIN_IMPORT, created_at: r.created_at,
    };
  });
}

const monthKey = (iso) => iso.slice(0, 7);

/** Indicadores, distribuição e gráficos da base (sempre sobre a base inteira visível, sem filtros). */
export function summarizeRoster(rows, t) {
  const active = rows.filter((r) => r.plan === 'active');
  const ended = rows.filter((r) => r.plan === 'ended');
  const eng = (list, k) => list.filter((r) => r.engagement === k).length;
  const exp = (n) => active.filter((r) => r.days_to_end != null && r.days_to_end >= 0 && r.days_to_end <= n).length;
  const cohorts = new Map();
  for (const r of rows) {
    const c = cohorts.get(r.cohort) || { cohort: r.cohort, total: 0, active: 0, engaged: 0, attention: 0, inactive: 0, never: 0, ended: 0 };
    c.total++;
    if (r.plan === 'ended') c.ended++;
    else { c.active++; c[r.engagement === 'active' ? 'engaged' : r.engagement]++; }
    cohorts.set(r.cohort, c);
  }
  // Vencimentos dos próximos 6 meses (planos ativos) e encerramentos por ano (histórico da base).
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(`${t.slice(0, 7)}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + i);
    months.push(d.toISOString().slice(0, 7));
  }
  const expByMonth = months.map((m) => ({ month: m, students: active.filter((r) => r.plan_end && monthKey(r.plan_end) === m && r.plan_end >= t).length }));
  const years = new Map();
  for (const r of ended) {
    const y = r.plan_end ? r.plan_end.slice(0, 4) : 'Sem data';
    years.set(y, (years.get(y) || 0) + 1);
  }
  return {
    today: t,
    kpis: {
      total: rows.length,
      active: active.length,
      ended: ended.length,
      engaged: eng(active, 'active'),
      attention: eng(active, 'attention'),
      inactive: eng(active, 'inactive'),
      never: eng(active, 'never'),
      expiring_7: exp(7), expiring_15: exp(15), expiring_30: exp(30),
      ended_90: ended.filter((r) => r.plan_end && r.plan_end < t && daysBetween(r.plan_end, t) <= 90).length,
    },
    cohorts: [...cohorts.values()].sort((a, b) => b.active - a.active || b.total - a.total || a.cohort.localeCompare(b.cohort)),
    expirations: expByMonth,
    ended_by_year: [...years.entries()].map(([year, students]) => ({ year, students })).sort((a, b) => a.year.localeCompare(b.year)),
  };
}

/** Filtros da lista (mesmos na tela e no download). */
export function filterRoster(rows, f = {}) {
  const q = f.q ? norm(f.q) : '';
  return rows.filter((r) => {
    if (f.plan && f.plan !== 'all' && r.plan !== f.plan) return false;
    if (f.cohort && r.cohort !== f.cohort) return false;
    if (f.engagement && f.engagement !== 'all' && r.engagement !== f.engagement) return false;
    if (f.no_access_over) {
      const n = Number(f.no_access_over);
      if (!(r.days_since_access == null || r.days_since_access > n)) return false;
    }
    if (f.expiring_within) {
      const n = Number(f.expiring_within);
      if (!(r.plan === 'active' && r.days_to_end != null && r.days_to_end >= 0 && r.days_to_end <= n)) return false;
    }
    if (f.ended_within) {
      const n = Number(f.ended_within);
      if (!(r.plan === 'ended' && r.days_to_end != null && r.days_to_end < 0 && -r.days_to_end <= n)) return false;
    }
    if (q && !norm(`${r.name} ${r.email} ${r.phone || ''}`).includes(q)) return false;
    return true;
  });
}

const PLAN_LABEL = { active: 'Ativo', ended: 'Encerrado' };
const br = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fmtPhone = (p) => (!p ? '' : p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p.length === 10 ? `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}` : p);

/** CSV para Excel em português: separador ";", BOM UTF-8, datas dd/mm/aaaa. Sem CPF (minimização de dados). */
export function rosterCsv(rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    // Evita que o Excel interprete conteúdo como fórmula.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ['Nome', 'E-mail', 'Celular', 'Turma', 'Situação do plano', 'Fim do plano', 'Dias para vencer', 'Último acesso', 'Dias sem acesso', 'Engajamento', 'Editais', 'Turma original'];
  const lines = [head.join(';')];
  for (const r of rows) {
    lines.push([
      r.name, r.email, fmtPhone(r.phone), r.cohort, PLAN_LABEL[r.plan], br(r.plan_end),
      r.plan === 'active' && r.days_to_end != null ? r.days_to_end : '',
      br(r.last_access), r.days_since_access ?? '', r.plan === 'ended' ? 'Encerrado' : ENGAGEMENT[r.engagement].label,
      r.editais || '', r.legacy_class || '',
    ].map(cell).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
