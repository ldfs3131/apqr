/**
 * Área da professora (e monitores). Tudo roda no contexto do ambiente (RLS).
 * Monitores só enxergam alunos atribuídos e não alteram editais, equipe ou regras.
 */
import { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db/index.js';
import { requireRole, isTeacher } from '../security/auth.js';
import { audit, assertStudent, studentScope } from '../security/access.js';
import { ah, addDays, forbidden, notFound, nowIso, parseId, today } from '../lib/util.js';
import { parse } from './auth.js';
import { maskCpf, formatCpf } from '../lib/cpf.js';
import { changeCadastro, editableFields } from '../domain/cadastro.js';
import * as P from '../domain/people.js';
import * as ACC from '../domain/acessos.js';
import * as TERMS from '../domain/termos.js';
import { pactoOverview } from '../domain/pacto.js';
import * as E from '../domain/editais.js';
import { getSettings, updateSettings, listSettingsVersions, SETTINGS_SCHEMA, publicSettings } from '../domain/settings.js';
import * as I from '../domain/indicators.js';
import { getRoutine } from '../domain/routine.js';
import * as AI from '../domain/ai/report.js';
import { aiStatus } from '../domain/ai/provider.js';
import { assertEnrollment } from '../security/access.js';
import * as C from '../domain/contents.js';
import * as Turmas from '../domain/turmas.js';
import * as Cons from '../domain/consultoria.js';
import * as Fila from '../domain/fila.js';
import * as R from '../domain/roster.js';
import { SYSTEM } from '../db/index.js';
import * as AG from '../domain/agenda.js';

const r = Router();
r.use(requireRole('teacher', 'coordinator', 'mentor'));
// Monitor: somente editais e materiais/arquivos (nenhum dado de aluno).
r.use((req, _res, next) => {
  if (req.ctx.role === 'mentor' && !/^\/(editais|contents|cohorts)(\/|$)/.test(req.path)) return next(forbidden('O perfil de monitor acessa apenas editais e materiais.'));
  next();
});

const teacherOnly = (req) => {
  if (!isTeacher(req.ctx)) throw forbidden('Somente a professora pode fazer isso.');
};
const uuidList = z.array(z.string().uuid()).max(500);

// ───────────── Central da professora ─────────────

const optionalId = (v, label) => (v ? parseId(v, label) : null);

/** Visão acionável da turma: quem estuda, quem parou, quem precisa de atenção, quem evolui. */
r.get('/central', ah(async (req, res) => {
  const editalId = optionalId(req.query.edital_id, 'edital');
  const t = today(req.ctx.tz);
  const out = await tx(req.ctx, async (d) => {
    const settings = await getSettings(d, req.ctx.tenantId);
    const { rows, raw } = await I.classIndicators(d, req.ctx, { editalId, today: t, settings, withRaw: true });
    // Pulso: alunos distintos com registro por dia (a partir das matrículas já carregadas).
    const ids = rows.map((x) => x.enrollment_id);
    const pulse = ids.length ? await d.all(
      `SELECT date, count(DISTINCT student_id) AS students FROM (
          SELECT student_id, date FROM study_sessions WHERE enrollment_id = ANY(?::uuid[]) AND voided_at IS NULL AND date >= ? AND date <= ?
          UNION ALL SELECT student_id, date FROM question_logs WHERE enrollment_id = ANY(?::uuid[]) AND voided_at IS NULL AND date >= ? AND date <= ?
          UNION ALL SELECT student_id, date FROM production_logs WHERE enrollment_id = ANY(?::uuid[]) AND voided_at IS NULL AND date >= ? AND date <= ?
        ) x GROUP BY date ORDER BY date`,
      [ids, addDays(t, -13), t, ids, addDays(t, -13), t, ids, addDays(t, -13), t]
    ) : [];
    return { settings, rows, raw, pulse };
  });
  /*
   * Semântica (docs/METRICAS.md §6):
   *  - "Todos os editais": UMA linha por ALUNO; atividade soma todos os editais; APQR por edital (lista `editais`).
   *  - Um edital selecionado: UMA linha por matrícula naquele edital; tudo calculado só com aquele edital.
   */
  const students = editalId ? out.rows.map(I.enrollmentAsOverview) : I.studentOverview(out.raw, out.rows, out.settings, t);
  const inact = out.settings.inactivity_days;
  const pulseMap = new Map(out.pulse.map((p) => [p.date, p.students]));
  res.json({
    today: t,
    scope: editalId ? 'edital' : 'student',
    settings: publicSettings(out.settings),
    inactivity_days: inact,
    kpis: {
      students: students.length,
      studied_today: students.filter((x) => x.last_activity === t).length,
      studied_7d: students.filter((x) => x.days_since_activity != null && x.days_since_activity < 7).length,
      inactive: students.filter((x) => x.diagnostics.some((g) => g.code === 'inactive' || g.code === 'never_started')).length,
      attention: students.filter((x) => x.severity === 'critical' || x.severity === 'serious').length,
      improving: students.filter((x) => x.diagnostics.some((g) => g.code === 'improving')).length,
      hours_7d: students.reduce((a, x) => a + x.study_seconds_7, 0),
      questions_28d: students.reduce((a, x) => a + x.questions_28, 0),
    },
    pulse: Array.from({ length: 14 }, (_, i) => { const day = addDays(t, i - 13); return { date: day, students: pulseMap.get(day) || 0 }; }),
    students,
  });
}));

/** Ranking da turma por edital (somente professora/equipe/ONE UP). Três indicadores, sem nota composta. */
r.get('/ranking', ah(async (req, res) => {
  const editalId = parseId(req.query.edital_id, 'edital');
  const metric = I.RANK_METRICS[req.query.metric] ? req.query.metric : 'consolidation';
  const t = today(req.ctx.tz);
  const out = await tx(req.ctx, async (d) => {
    const edital = await E.getEdital(d, editalId);
    const settings = await getSettings(d, req.ctx.tenantId);
    const rows = await I.classIndicators(d, req.ctx, { editalId, today: t, settings });
    return { edital, rows };
  });
  const { ranked, unranked } = I.rank(out.rows.map(({ weeks, hours_by_subject_28, diagnostics, ...x }) => x), metric);
  res.json({
    today: t, metric, edital: { id: out.edital.id, name: out.edital.name },
    ranked, unranked,
    method: {
      window_days: I.WINDOW_DAYS, max_days_per_week: I.MAX_DAYS_PER_WEEK, new_student_days: I.NEW_STUDENT_DAYS,
      consolidation: 'Conteúdos consolidados ÷ conteúdos ativos do edital × 100.',
      constancy: `Soma, nas últimas ${I.WEEKS} semanas, de min(dias ativos na semana, ${I.MAX_DAYS_PER_WEEK}) ÷ (${I.MAX_DAYS_PER_WEEK} × semanas) × 100. Dia ativo = qualquer registro de estudo, questões, revisão, material ou mudança de etapa.`,
      hours: `Horas de estudo registradas nos últimos ${I.WINDOW_DAYS} dias. Mostra dedicação, não domínio.`,
      questions: `Questões resolvidas (revisões, treino por tema ou matéria e simulados) nos últimos ${I.WINDOW_DAYS} dias.`,
      accuracy: `% de acertos nos últimos ${I.WINDOW_DAYS} dias, só com ${I.ACCURACY_MIN_QUESTIONS} questões ou mais (abaixo disso a amostra é pequena e o aluno fica sem posição de desempenho).`,
      evolution: `Consolidação de hoje − consolidação de ${I.WINDOW_DAYS} dias atrás, em pontos percentuais.`,
    },
  });
}));

/** Raio-X do aluno: indicadores e diagnósticos por edital + perfil. */
r.get('/students/:id/xray', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const t = today(req.ctx.tz);
  const out = await tx(req.ctx, async (d) => {
    const st = await assertStudent(d, req.ctx, id);
    const settings = await getSettings(d, req.ctx.tenantId);
    const rows = await I.classIndicators(d, req.ctx, { studentId: id, today: t, settings });
    const enrollments = await d.all(
      `SELECT e.id, e.edital_id, e.status, e.created_at, ed.name AS edital_name FROM enrollments e JOIN editais ed ON ed.id = e.edital_id
        WHERE e.student_id = ? ORDER BY e.status, e.created_at`, [id]);
    const notes = (await d.one('SELECT count(*) AS n FROM teacher_notes WHERE student_id = ? AND deleted_at IS NULL', [id])).n;
    await audit(d, req.ctx, 'student.view_xray', { targetType: 'student', targetId: id });
    return { st, rows, enrollments, notes, settings };
  });
  const { st } = out;
  res.json({
    today: t,
    settings: publicSettings(out.settings),
    student: {
      id: st.id, user_id: st.user_id, photo_file_id: st.photo_file_id || null, name: st.name, email: st.email, status: st.user_status, phone: st.phone, birth_date: st.birth_date instanceof Date ? st.birth_date.toISOString().slice(0, 10) : st.birth_date, cpf: maskCpf(st.cpf),
      city: st.city, state: st.state, goal: st.goal, access_until: st.access_until, extra_reviews_allowed: st.extra_reviews_allowed,
      last_login_at: st.last_login_at, created_at: st.user_created_at, profile_complete: !!st.cpf && !!st.terms_accepted_at,
      plan_status: st.plan_status, plan: st.plan_status === 'ended' || (st.access_until && st.access_until < t) ? 'ended' : 'active',
      cohort: st.cohort, legacy_class: st.legacy_class, legacy_last_login: st.legacy_last_login, imported: st.origin === 'plataforma_anterior',
    },
    enrollments: out.enrollments,
    indicators: out.rows,
    notes_count: out.notes,
  });
}));

// ───────────── Estudar com IA (conteúdos) ─────────────

r.get('/contents', ah(async (req, res) => {
  res.json({ items: await tx(req.ctx, (d) => C.listContents(d, { includeArchived: req.query.archived === '1' })) });
}));
r.post('/contents', ah(async (req, res) => {
  res.status(201).json({ item: await tx(req.ctx, (d) => C.createContent(d, req.ctx, req.body || {})) });
}));
r.patch('/contents/:cid', ah(async (req, res) => {
  res.json({ item: await tx(req.ctx, (d) => C.updateContent(d, req.ctx, parseId(req.params.cid, 'conteúdo'), req.body || {})) });
}));
r.post('/contents/reorder', ah(async (req, res) => {
  const { ids } = parse(z.object({ ids: uuidList }), req.body);
  await tx(req.ctx, (d) => C.reorderContents(d, req.ctx, ids));
  res.json({ ok: true });
}));

// ───────────── Configurações privadas (Ajuste de Rota, bônus, credibilidade) ─────────────
r.get('/config', ah(async (req, res) => {
  const cfg = await tx(req.ctx, (d) => Cons.getConfig(d, req.ctx.tenantId));
  res.json({ config: req.ctx.role === 'coordinator' ? { ...cfg, bonus: undefined } : cfg });
}));
r.put('/config', ah(async (req, res) => {
  const body = parse(z.object({
    route_adjust_enabled: z.boolean().optional(), faco_questao_url: z.string().max(300).nullable().optional(),
    bonus: z.object({
      constancy_weeks: z.number().optional(), questions_goal: z.number().optional(), questions_daily_cap: z.number().optional(), plan_pct: z.number().optional(),
      pacto_min_minutes: z.number().optional(), valid_days: z.number().optional(), values_cents: z.object({ bronze: z.number().optional(), prata: z.number().optional(), ouro: z.number().optional() }).optional(),
    }).optional(),
    credibility: z.object({ subject_accuracy_min: z.number().optional() }).optional(),
  }).strict(), req.body || {});
  res.json({ config: await tx(SYSTEM, (d) => Cons.saveConfig(d, req.ctx, body)) });
}));

// ───────────── Consultoria: jornada, diagnóstico, plano, relatório, bônus ─────────────
r.get('/students/:id/consultoria', ah(async (req, res) => {
  res.json({ consultoria: await tx(req.ctx, (d) => Cons.consultoriaForStaff(d, req.ctx, parseId(req.params.id, 'aluno'))) });
}));
r.patch('/students/:id/consultoria', ah(async (req, res) => {
  const body = parse(z.object({
    paid_on: z.string().nullable().optional(), scheduled_on: z.string().nullable().optional(), done_on: z.string().nullable().optional(),
    session_link: z.string().max(500).nullable().optional(), note: z.string().max(600).nullable().optional(), continued: z.boolean().nullable().optional(),
  }), req.body);
  res.json({ journey: await tx(req.ctx, (d) => Cons.saveJourney(d, req.ctx, parseId(req.params.id, 'aluno'), body)) });
}));
r.put('/students/:id/consultoria/plan', ah(async (req, res) => {
  const body = parse(z.object({ title: z.string().max(160).optional(), items: z.array(z.object({ text: z.string().max(240), due_on: z.string().nullable().optional() })).max(40), publish: z.boolean().optional() }), req.body);
  res.json({ plan: await tx(req.ctx, (d) => Cons.savePlan(d, req.ctx, parseId(req.params.id, 'aluno'), body)) });
}));
r.post('/students/:id/consultoria/report', ah(async (req, res) => {
  const body = parse(z.object({ body: z.string().max(8000).optional() }), req.body || {});
  res.status(201).json({ report: await tx(req.ctx, (d) => Cons.prepareReport(d, req.ctx, parseId(req.params.id, 'aluno'), body)) });
}));
r.patch('/consult-reports/:rid', ah(async (req, res) => {
  const body = parse(z.object({ body: z.string().max(8000) }), req.body);
  res.json({ report: await tx(req.ctx, (d) => Cons.updateReportBody(d, req.ctx, parseId(req.params.rid, 'relatório'), body.body)) });
}));
r.post('/consult-reports/:rid/approve', ah(async (req, res) => {
  res.json(await tx(req.ctx, (d) => Cons.approveReport(d, req.ctx, parseId(req.params.rid, 'relatório'))));
}));
r.post('/bonuses/:bid/apply', ah(async (req, res) => {
  const body = parse(z.object({ note: z.string().max(300).optional().nullable() }), req.body || {});
  res.json({ bonus: await tx(req.ctx, (d) => Cons.applyBonus(d, req.ctx, parseId(req.params.bid, 'bônus'), body.note)) });
}));

// ───────────── Fila da Coordenação ─────────────
r.get('/fila', ah(async (req, res) => res.json(await tx(req.ctx, (d) => Fila.fila(d, req.ctx, { includeDone: req.query.done === '1' })))));
r.post('/fila/done', ah(async (req, res) => {
  const body = parse(z.object({ student_id: z.string().uuid(), kind: z.string().max(40), ref: z.string().max(80).optional(), note: z.string().max(300).optional().nullable(), undo: z.boolean().optional() }), req.body);
  res.json(await tx(req.ctx, (d) => Fila.markDone(d, req.ctx, body)));
}));

// ───────────── Turmas (links do WhatsApp) ─────────────
r.get('/cohorts', ah(async (req, res) => res.json({ cohorts: await tx(req.ctx, (d) => Turmas.listCohorts(d)) })));
r.put('/cohorts', ah(async (req, res) => {
  if (req.ctx.role === 'mentor') throw forbidden('O monitor não altera turmas.');
  const body = parse(z.object({ name: z.string().min(2).max(120), whatsapp_notices_url: z.string().max(300).nullable().optional(), whatsapp_students_url: z.string().max(300).nullable().optional() }), req.body);
  res.json({ cohort: await tx(req.ctx, (d) => Turmas.saveCohort(d, req.ctx, body)) });
}));

// ───────────── Identidade visual do ambiente ─────────────

r.get('/branding', ah(async (req, res) => {
  const t = await tx(req.ctx, (d) => d.one('SELECT slug, name, brand FROM tenants WHERE id = ?', [req.ctx.tenantId]));
  res.json({ branding: { slug: t.slug, name: t.name, ...t.brand, logo_url: t.brand?.logo_file_id ? `/api/public/logo/${t.slug}` : null } });
}));

/** A tabela de ambientes só é gravável no contexto de sistema: a rota limita a gravação ao PRÓPRIO ambiente. */
r.put('/branding', ah(async (req, res) => {
  teacherOnly(req);
  const body = parse(z.object({
    display_name: z.string().trim().min(2).max(80).optional(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida (use #RRGGBB).').nullable().optional(),
    logo_file_id: z.string().uuid().nullable().optional(),
    renew_url: z.string().trim().url('Link inválido.').max(300).refine((u) => /^https:\/\//i.test(u), 'Use um link https://').nullable().optional(),
    coordinator_whatsapp: z.string().trim().max(20).nullable().optional(),
  }), req.body);
  const tenantId = req.ctx.tenantId;
  if (body.logo_file_id) {
    const f = await tx(req.ctx, (d) => d.one("SELECT id FROM files WHERE id = ? AND purpose = 'logo' AND deleted_at IS NULL", [body.logo_file_id]));
    if (!f) throw notFound('Logotipo não encontrado.');
  }
  const brand = await tx(SYSTEM, async (d) => {
    const t = await d.one('SELECT brand FROM tenants WHERE id = ? FOR UPDATE', [tenantId]);
    const next = { ...(t.brand || {}), ...body };
    await d.run('UPDATE tenants SET brand = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), nowIso(), tenantId]);
    await audit(d, req.ctx, 'tenant.branding', { targetType: 'tenant', targetId: tenantId, tenantId, payload: { fields: Object.keys(body) } });
    return next;
  });
  res.json({ branding: brand });
}));

// ───────────── Relatório com IA ─────────────

r.get('/ai/status', ah(async (req, res) => {
  const startDay = new Date(); startDay.setUTCHours(0, 0, 0, 0);
  const used = await tx(req.ctx, (d) => d.one(`SELECT count(*) AS n, COALESCE(sum(cost_usd), 0) AS cost FROM ai_reports WHERE provider IS NOT NULL AND provider <> 'none' AND created_at >= ?`, [startDay.toISOString()]));
  res.json({ ...aiStatus(), used_today: used.n, cost_today_usd: Number(used.cost), daily_limit: AI.dailyLimit(), cache_hours: AI.CACHE_HOURS });
}));

r.get('/enrollments/:eid/ai-reports', ah(async (req, res) => {
  const eid = parseId(req.params.eid, 'matrícula');
  const rows = await tx(req.ctx, async (d) => {
    const e = await assertEnrollment(d, req.ctx, eid);
    return d.all('SELECT * FROM ai_reports WHERE enrollment_id = ? ORDER BY created_at DESC LIMIT 10', [e.id]);
  });
  res.json({ reports: rows.map(AI.publicReport) });
}));

/** Gera (ou devolve do cache) o relatório. A chamada à IA acontece fora da transação. */
r.post('/enrollments/:eid/ai-report', ah(async (req, res) => {
  const eid = parseId(req.params.eid, 'matrícula');
  const force = req.body?.force === true;
  const prep = await tx(req.ctx, async (d) => {
    const e = await assertEnrollment(d, req.ctx, eid);
    return { e, ...(await AI.prepareReport(d, req.ctx, e, { force })) };
  });
  if (prep.cached) return res.json({ report: AI.publicReport(prep.cached), cached: true });
  const result = await AI.runModel(prep.facts, { useAi: prep.useAi });
  const row = await tx(req.ctx, (d) => AI.saveReport(d, req.ctx, prep.e, prep, result));
  res.status(201).json({ report: AI.publicReport(row), cached: false, limit_reached: !!prep.limitReached });
}));

// ───────────── Alunos ─────────────

r.get('/students', ah(async (req, res) => {
  const sc = studentScope(req.ctx);
  const rows = await tx(req.ctx, (d) =>
    d.all(
      `WITH last AS (
          SELECT student_id, max(d) AS last_activity FROM (
            SELECT student_id, max(date) AS d FROM study_sessions WHERE voided_at IS NULL GROUP BY student_id
            UNION ALL SELECT student_id, max(date) FROM question_logs WHERE voided_at IS NULL GROUP BY student_id
            UNION ALL SELECT student_id, max(date) FROM production_logs WHERE voided_at IS NULL GROUP BY student_id
          ) x GROUP BY student_id
        ), enr AS (
          SELECT e.student_id, json_agg(json_build_object('enrollment_id', e.id, 'edital_id', ed.id, 'edital_name', ed.name) ORDER BY e.created_at) AS enrollments
            FROM enrollments e JOIN editais ed ON ed.id = e.edital_id WHERE e.status = 'active' GROUP BY e.student_id
        )
       SELECT st.id, st.cpf, st.phone, st.city, st.state, st.goal, st.access_until, st.extra_reviews_allowed, st.created_at,
              st.plan_status, st.cohort, st.origin, st.photo_file_id,
              u.id AS user_id, u.name, u.email, u.status, u.last_login_at, enr.enrollments, last.last_activity
         FROM students st JOIN users u ON u.id = st.user_id
         LEFT JOIN enr ON enr.student_id = st.id LEFT JOIN last ON last.student_id = st.id
        WHERE true${sc.sql}
        ORDER BY u.name`,
      sc.params
    )
  );
  const t = today(req.ctx.tz);
  res.json({ today: t, students: rows.map((s) => ({
    ...s, cpf: maskCpf(s.cpf), enrollments: s.enrollments || [],
    plan: s.plan_status === 'ended' || (s.access_until && s.access_until < t) ? 'ended' : 'active',
  })) });
}));

r.post('/students', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string(), email: z.string(), edital_ids: uuidList.optional(), goal: z.string().max(300).optional() }), req.body);
  const out = await tx(req.ctx, (d) => P.createStudent(d, req.ctx, body, req));
  res.status(201).json(out);
}));

r.get('/students/:id/profile', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const st = await tx(req.ctx, async (d) => {
    const row = await assertStudent(d, req.ctx, id);
    await audit(d, req.ctx, 'student.view_profile', { targetType: 'student', targetId: id });
    return row;
  });
  const { cpf, ...rest } = st;
  res.json({ student: { ...rest, birth_date: rest.birth_date instanceof Date ? rest.birth_date.toISOString().slice(0, 10) : rest.birth_date, cpf: formatCpf(cpf) }, editable: editableFields(req.ctx) });
}));

r.patch('/students/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const body = parse(z.object({
    name: z.string().optional(), cohort: z.string().max(120).nullable().optional(), active: z.boolean().optional(), extra_reviews_allowed: z.boolean().optional(),
    access_until: z.string().nullable().optional(), goal: z.string().nullable().optional(),
    plan_status: z.enum(['active', 'ended']).optional(),
  }), req.body);
  res.json({ changes: await tx(req.ctx, (d) => P.updateStudent(d, req.ctx, id, body)) });
}));

r.patch('/students/:id/cadastro', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const body = parse(z.object({ fields: z.record(z.string(), z.any()), dry_run: z.boolean().optional() }), req.body);
  res.json(await tx(req.ctx, (d) => changeCadastro(d, req.ctx, id, body.fields, { dryRun: !!body.dry_run })));
}));

// ───────────── Termos de uso ─────────────
r.get('/terms', ah(async (req, res) => {
  teacherOnly(req);
  const out = await tx(req.ctx, async (d) => ({ current: await TERMS.currentTerms(d, req.ctx.tenantId), ...(await TERMS.listTerms(d, req.ctx.tenantId)) }));
  res.json(out);
}));
r.post('/terms', ah(async (req, res) => {
  const body = parse(z.object({ title: z.string().max(160).optional(), body: z.string().max(60000), drive_url: z.string().url().max(400).refine((u) => /^https:\/\//i.test(u), 'Use um link https://').nullable().optional() }), req.body);
  res.status(201).json({ terms: await tx(req.ctx, (d) => TERMS.publishTerms(d, req.ctx, body)) });
}));
r.get('/terms/:id/pdf', ah(async (req, res) => {
  teacherOnly(req);
  const { t, name } = await tx(req.ctx, async (d) => ({ t: await d.one('SELECT * FROM terms_documents WHERE id = ?', [parseId(req.params.id, 'termos')]), name: (await d.one('SELECT name FROM tenants WHERE id = ?', [req.ctx.tenantId]))?.name }));
  if (!t) throw notFound('Termos não encontrados.');
  const buf = await TERMS.termsPdf(t, name);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="termos-v${t.version}.pdf"`);
  res.end(buf);
}));

r.get('/students/:id/pacto', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const out = await tx(req.ctx, async (d) => { await assertStudent(d, req.ctx, id); return pactoOverview(d, req.ctx, id, { month: /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : undefined }); });
  res.json({ pacto: out });
}));

// ───────────── Acessos (vigências) ─────────────
r.get('/students/:id/accesses', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  res.json({ accesses: await tx(req.ctx, (d) => ACC.listAccesses(d, req.ctx, id)), kinds: ACC.KINDS, long_days: ACC.LONG_ACCESS_DAYS });
}));
r.post('/students/:id/accesses', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const body = parse(z.object({ kind: z.enum(['turma', 'consultoria', 'plataforma']), label: z.string().max(120).optional().nullable(), starts_on: z.string().optional(), ends_on: z.string().optional().nullable(), days: z.number().int().min(1).max(3650).optional() }), req.body);
  res.status(201).json({ access: await tx(req.ctx, (d) => ACC.grantAccess(d, req.ctx, id, body)) });
}));
r.patch('/accesses/:id', ah(async (req, res) => {
  const body = parse(z.object({ ends_on: z.string().nullable().optional(), starts_on: z.string().optional(), label: z.string().max(120).nullable().optional() }), req.body);
  res.json({ access: await tx(req.ctx, (d) => ACC.updateAccess(d, req.ctx, parseId(req.params.id, 'acesso'), body)) });
}));
r.post('/accesses/:id/meeting', ah(async (req, res) => {
  const { date } = parse(z.object({ date: z.string() }), req.body);
  res.json(await tx(req.ctx, (d) => ACC.registerMeeting(d, req.ctx, parseId(req.params.id, 'acesso'), date)));
}));
r.post('/accesses/:id/pause', ah(async (req, res) => { await tx(req.ctx, (d) => ACC.pauseAccess(d, req.ctx, parseId(req.params.id, 'acesso'))); res.json({ ok: true }); }));
r.post('/accesses/:id/resume', ah(async (req, res) => res.json(await tx(req.ctx, (d) => ACC.resumeAccess(d, req.ctx, parseId(req.params.id, 'acesso'))))));
r.post('/accesses/:id/extra-pause', ah(async (req, res) => {
  const { allowed } = parse(z.object({ allowed: z.boolean().optional() }), req.body || {});
  await tx(req.ctx, (d) => ACC.allowExtraPause(d, req.ctx, parseId(req.params.id, 'acesso'), allowed ?? true));
  res.json({ ok: true });
}));
r.post('/accesses/:id/cancel', ah(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(3).max(300) }), req.body);
  await tx(req.ctx, (d) => ACC.cancelAccess(d, req.ctx, parseId(req.params.id, 'acesso'), reason));
  res.json({ ok: true });
}));

r.post('/students/:id/invite', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  res.json({ invite: await tx(req.ctx, (d) => P.regenerateInvite(d, req.ctx, id, req)) });
}));

r.post('/students/:id/reset-link', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const url = await tx(req.ctx, async (d) => {
    const st = await assertStudent(d, req.ctx, id);
    if (st.user_status !== 'active') throw forbidden('O aluno precisa ter concluído o cadastro e estar ativo.');
    const token = await P.createResetToken(d, st.user_id, st.tenant_id);
    await audit(d, req.ctx, 'student.reset_link', { targetType: 'student', targetId: id });
    return P.resetUrl(req, token);
  });
  res.json({ url, expires_in_minutes: 60 });
}));

r.post('/students/:id/enrollments', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const { edital_id } = parse(z.object({ edital_id: z.string().uuid() }), req.body);
  const eid = await tx(req.ctx, async (d) => {
    await assertStudent(d, req.ctx, id);
    return P.enrollStudent(d, req.ctx, id, edital_id);
  });
  res.status(201).json({ enrollment_id: eid });
}));

r.delete('/students/:id/enrollments/:eid', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const eid = parseId(req.params.eid, 'matrícula');
  await tx(req.ctx, async (d) => {
    await assertStudent(d, req.ctx, id);
    await P.archiveEnrollment(d, req.ctx, id, eid);
  });
  res.json({ ok: true });
}));

r.get('/students/:id/routine', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const routine = await tx(req.ctx, async (d) => { await assertStudent(d, req.ctx, id); return getRoutine(d, id); });
  res.json({ routine });
}));

// ───────────── Anotações da professora ─────────────

r.get('/students/:id/notes', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const notes = await tx(req.ctx, async (d) => {
    await assertStudent(d, req.ctx, id);
    return d.all('SELECT n.id, n.body, n.created_at, u.name AS author_name, n.author_id FROM teacher_notes n JOIN users u ON u.id = n.author_id WHERE n.student_id = ? AND n.deleted_at IS NULL ORDER BY n.created_at DESC', [id]);
  });
  res.json({ notes });
}));

r.post('/students/:id/notes', ah(async (req, res) => {
  const id = parseId(req.params.id, 'aluno');
  const { body } = parse(z.object({ body: z.string().trim().min(1, 'Escreva a anotação.').max(4000) }), req.body);
  const note = await tx(req.ctx, async (d) => {
    await assertStudent(d, req.ctx, id);
    return d.one('INSERT INTO teacher_notes (tenant_id, student_id, author_id, body, created_at) VALUES (?,?,?,?,?) RETURNING id, body, created_at', [req.ctx.tenantId, id, req.ctx.userId, body, nowIso()]);
  });
  res.status(201).json({ note });
}));

r.delete('/notes/:noteId', ah(async (req, res) => {
  const nid = parseId(req.params.noteId, 'anotação');
  await tx(req.ctx, async (d) => {
    const n = await d.one('SELECT * FROM teacher_notes WHERE id = ? AND deleted_at IS NULL', [nid]);
    if (!n) throw notFound('Anotação não encontrada.');
    if (n.author_id !== req.ctx.userId && !isTeacher(req.ctx)) throw forbidden();
    await assertStudent(d, req.ctx, n.student_id);
    await d.run('UPDATE teacher_notes SET deleted_at = ? WHERE id = ?', [nowIso(), nid]);
  });
  res.json({ ok: true });
}));

// ───────────── Editais (somente professora altera) ─────────────

r.get('/editais', ah(async (req, res) => {
  res.json({ editais: await tx(req.ctx, (d) => E.listEditais(d, { includeArchived: req.query.archived === '1' })) });
}));

r.post('/editais', ah(async (req, res) => {
  res.status(201).json({ edital: await tx(req.ctx, (d) => E.createEdital(d, req.ctx, req.body || {})) });
}));

r.get('/editais/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'edital');
  const out = await tx(req.ctx, async (d) => ({
    edital: await E.getEdital(d, id),
    subjects: await E.structure(d, id, { includeArchived: req.query.archived === '1' }),
    plan: await E.getPlan(d, id),
    enrollments: await d.all(
      `SELECT e.id, e.student_id, e.status, e.created_at, u.name, u.email, u.status AS user_status
         FROM enrollments e JOIN students st ON st.id = e.student_id JOIN users u ON u.id = st.user_id
        WHERE e.edital_id = ?${studentScope(req.ctx).sql} ORDER BY u.name`,
      [id, ...studentScope(req.ctx).params]
    ),
  }));
  res.json(out);
}));

r.patch('/editais/:id', ah(async (req, res) => {
  res.json({ edital: await tx(req.ctx, (d) => E.updateEdital(d, req.ctx, parseId(req.params.id, 'edital'), req.body || {})) });
}));

r.post('/editais/:id/archive', ah(async (req, res) => {
  const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
  res.json({ edital: await tx(req.ctx, (d) => E.archiveEdital(d, req.ctx, parseId(req.params.id, 'edital'), archived)) });
}));

r.post('/editais/:id/duplicate', ah(async (req, res) => {
  res.status(201).json({ edital: await tx(req.ctx, (d) => E.duplicateEdital(d, req.ctx, parseId(req.params.id, 'edital'))) });
}));

r.post('/editais/:id/subjects', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string(), topics: z.array(z.string()).max(500).optional() }), req.body);
  res.status(201).json({ subject: await tx(req.ctx, (d) => E.createSubject(d, req.ctx, parseId(req.params.id, 'edital'), body)) });
}));

r.patch('/editais/:id/subjects/:sid', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().optional(), archived: z.boolean().optional() }), req.body);
  res.json({ subject: await tx(req.ctx, (d) => E.updateSubject(d, req.ctx, parseId(req.params.id, 'edital'), parseId(req.params.sid, 'matéria'), body)) });
}));

r.post('/editais/:id/topics', ah(async (req, res) => {
  const body = parse(z.object({ subject_id: z.string().uuid(), names: z.array(z.string()).min(1).max(500) }), req.body);
  res.status(201).json({ topics: await tx(req.ctx, (d) => E.createTopics(d, req.ctx, parseId(req.params.id, 'edital'), body.subject_id, body.names)) });
}));

r.patch('/editais/:id/topics/:tid', ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().optional(), subject_id: z.string().uuid().optional(), archived: z.boolean().optional() }), req.body);
  res.json({ topic: await tx(req.ctx, (d) => E.updateTopic(d, req.ctx, parseId(req.params.id, 'edital'), parseId(req.params.tid, 'conteúdo'), body)) });
}));

r.post('/editais/:id/reorder', ah(async (req, res) => {
  const body = parse(z.object({ subject_ids: uuidList.optional(), topic_ids: uuidList.optional(), subject_id: z.string().uuid().optional() }), req.body);
  await tx(req.ctx, (d) => E.reorder(d, req.ctx, parseId(req.params.id, 'edital'), body));
  res.json({ ok: true });
}));

r.put('/editais/:id/plan', ah(async (req, res) => {
  const body = parse(z.object({ notes: z.string().nullable().optional(), items: z.array(z.object({ subject_id: z.string().uuid(), relevance: z.enum(['alta', 'media', 'baixa']).optional(), note: z.string().nullable().optional() })) }), req.body);
  res.json({ plan: await tx(req.ctx, (d) => E.savePlan(d, req.ctx, parseId(req.params.id, 'edital'), body)) });
}));

/** Vincular vários alunos a um edital de uma vez. */
r.post('/editais/:id/enrollments', ah(async (req, res) => {
  const id = parseId(req.params.id, 'edital');
  const { student_ids } = parse(z.object({ student_ids: uuidList.min(1) }), req.body);
  const ids = await tx(req.ctx, async (d) => {
    const out = [];
    for (const sid of student_ids) {
      await assertStudent(d, req.ctx, sid);
      out.push(await P.enrollStudent(d, req.ctx, sid, id));
    }
    return out;
  });
  res.status(201).json({ enrollment_ids: ids });
}));

// ───────────── Equipe (monitores) ─────────────

// ───────────── Base de alunos (plano, vencimento, engajamento) ─────────────

const ROSTER_FILTER = z.object({
  plan: z.enum(['all', 'active', 'ended']).optional(),
  cohort: z.string().max(120).optional(),
  engagement: z.enum(['all', 'active', 'attention', 'inactive', 'never']).optional(),
  no_access_over: z.coerce.number().int().min(0).max(3650).optional(),
  expiring_within: z.coerce.number().int().min(0).max(3650).optional(),
  ended_within: z.coerce.number().int().min(0).max(3650).optional(),
  q: z.string().max(120).optional(),
  name: z.string().max(80).optional(),
});

r.get('/roster', ah(async (req, res) => {
  const t = today(req.ctx.tz);
  const rows = await tx(req.ctx, (d) => R.rosterRows(d, req.ctx, t, req.ctx.tz));
  res.json({ ...R.summarizeRoster(rows, t), engagement: R.ENGAGEMENT, students: rows });
}));

/** Download da lista filtrada (CSV para Excel). Exportar dado pessoal fica registrado na auditoria. */
r.get('/roster/export.csv', ah(async (req, res) => {
  const f = parse(ROSTER_FILTER, req.query);
  const t = today(req.ctx.tz);
  const list = await tx(req.ctx, async (d) => {
    const all = await R.rosterRows(d, req.ctx, t, req.ctx.tz);
    const out = R.filterRoster(all, f);
    const { name, ...filters } = f;
    await audit(d, req.ctx, 'roster.export', { payload: { filters, rows: out.length } });
    return out;
  });
  const slug = String(f.name || 'alunos').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'alunos';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-${t}.csv"`);
  res.send(R.rosterCsv(list));
}));

r.get('/roster/template.csv', ah(async (req, res) => {
  teacherOnly(req);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-alunos.csv"');
  res.send('\uFEFFnome;email;celular;cpf;turma;turma_original;ultimo_login;fim_do_plano;situacao\r\n' +
    'Maria da Silva;maria@exemplo.com;(61) 99999-0000;;ANVISA;Base ANVISA 2026;15/09/2026;17/11/2026;ativo\r\n');
}));

/** Importa (ou simula, com dry_run) a base de alunos a partir de um CSV. Só a professora. */
r.post('/roster/import', ah(async (req, res) => {
  teacherOnly(req);
  const body = parse(z.object({ csv: z.string().min(1, 'Envie o arquivo.').max(5_000_000, 'Arquivo grande demais (máx. 5 MB).'), dry_run: z.boolean().optional() }), req.body);
  res.json(await R.importRoster(req.ctx, body.csv, { dryRun: !!body.dry_run, today: today(req.ctx.tz) }));
}));

r.get('/team', ah(async (req, res) => {
  teacherOnly(req);
  const rows = await tx(req.ctx, (d) =>
    d.all(`SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at,
                  (SELECT count(*) FROM staff_assignments sa WHERE sa.staff_id = u.id) AS students_count,
                  (SELECT json_agg(sa.student_id) FROM staff_assignments sa WHERE sa.staff_id = u.id) AS student_ids
             FROM users u WHERE u.role IN ('teacher','coordinator','mentor') ORDER BY CASE u.role WHEN 'teacher' THEN 0 WHEN 'coordinator' THEN 1 ELSE 2 END, u.name`)
  );
  res.json({ team: rows.map((x) => ({ ...x, student_ids: x.student_ids || [] })) });
}));

r.post('/team', ah(async (req, res) => {
  teacherOnly(req);
  const body = parse(z.object({ name: z.string(), email: z.string(), role: z.enum(['mentor', 'coordinator', 'teacher']).optional() }), req.body);
  res.status(201).json(await tx(req.ctx, (d) => P.createMentor(d, req.ctx, body, req)));
}));

r.put('/team/:id/students', ah(async (req, res) => {
  teacherOnly(req);
  const { student_ids } = parse(z.object({ student_ids: uuidList }), req.body);
  await tx(req.ctx, (d) => P.setMentorStudents(d, req.ctx, parseId(req.params.id, 'monitor'), student_ids));
  res.json({ ok: true });
}));

// ───────────── Regras do método (versionadas) ─────────────

r.get('/settings', ah(async (req, res) => {
  const out = await tx(req.ctx, async (d) => ({
    settings: await getSettings(d, req.ctx.tenantId),
    versions: await listSettingsVersions(d, req.ctx.tenantId),
  }));
  res.json({ ...out, schema: Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, v]) => [k, { default: v.default, label: v.label, hint: v.hint }])) });
}));

r.put('/settings', ah(async (req, res) => {
  teacherOnly(req);
  const body = parse(z.object({
    settings: z.record(z.string(), z.any()),
    reason: z.string().trim().min(3, 'Informe o motivo da alteração.').max(300),
    confirm: z.literal(true, { message: 'Confirme a alteração das regras do método.' }),
  }), req.body);
  res.json({ settings: await tx(req.ctx, (d) => updateSettings(d, req.ctx, req.ctx.tenantId, body.settings, body.reason)) });
}));

// ───────────── Auditoria do ambiente ─────────────

r.get('/audit', ah(async (req, res) => {
  teacherOnly(req);
  const rows = await tx(req.ctx, (d) =>
    d.all(`SELECT a.id, a.action, a.target_type, a.target_id, a.payload, a.created_at, u.name AS actor_name, u.role AS actor_role
             FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 300`)
  );
  res.json({ audit: rows, today: today(req.ctx.tz) });
}));

// ───────────── Agenda (conteúdo da professora para os alunos) ─────────────

const AGENDA = z.object({
  kind: z.enum(['aula', 'reuniao', 'plantao', 'prova', 'lembrete', 'outro']), title: z.string().max(200), description: z.string().max(3000).optional().nullable(),
  date: z.string(), start_time: z.string().optional().nullable(), end_time: z.string().optional().nullable(), end_date: z.string().optional().nullable(), all_day: z.boolean().optional(),
  link: z.string().max(500).optional().nullable(), audience: z.enum(['all', 'cohort', 'edital', 'student']).optional(),
  cohort: z.string().max(120).optional().nullable(), edital_id: z.string().uuid().optional().nullable(), student_id: z.string().uuid().optional().nullable(),
});
r.get('/agenda', ah(async (req, res) => {
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
  res.json(await tx(req.ctx, async (d) => ({
    events: await AG.listForStaff(d, q), kinds: AG.KINDS,
    editais: await d.all('SELECT id, name FROM editais WHERE archived_at IS NULL ORDER BY name'),
    cohorts: (await d.all("SELECT DISTINCT cohort FROM students WHERE cohort IS NOT NULL ORDER BY cohort")).map((x) => x.cohort),
    students: await d.all('SELECT st.id, u.name FROM students st JOIN users u ON u.id = st.user_id ORDER BY u.name LIMIT 2000'),
  })));
}));
r.post('/agenda', ah(async (req, res) => {
  teacherOnly(req);
  res.status(201).json(await tx(req.ctx, (d) => AG.saveEvent(d, req.ctx, null, parse(AGENDA, req.body))));
}));
r.put('/agenda/:id', ah(async (req, res) => {
  teacherOnly(req);
  res.json(await tx(req.ctx, (d) => AG.saveEvent(d, req.ctx, parseId(req.params.id, 'compromisso'), parse(AGENDA, req.body))));
}));
r.delete('/agenda/:id', ah(async (req, res) => {
  teacherOnly(req);
  await tx(req.ctx, (d) => AG.deleteEvent(d, req.ctx, parseId(req.params.id, 'compromisso')));
  res.json({ ok: true });
}));

export default r;
