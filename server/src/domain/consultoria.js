/**
 * Consultoria: quadro da jornada, diagnóstico nativo (com consentimento), plano de ação, relatório de 30 dias e
 * Bônus de Execução (medição automática; aplicação do desconto é manual). Configurações privadas em tenants.config.
 *
 * Regras de credibilidade: nenhum número entra no relatório sem amostra mínima (ver CREDIBILITY).
 * Proteção do bônus: questões só contam se lançadas no mesmo dia, até 150 por dia; tempo manual é marcado.
 */
import { badRequest, conflict, forbidden, notFound, nowIso, addDays, today as todayFn, round1, isValidDate } from '../lib/util.js';
import { audit, assertStudent } from '../security/access.js';
import { registerMeeting } from './acessos.js';
import { loadInputs, evaluatePacto, weekStartOf } from './pacto.js';

const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v || null);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isValidDate(v);
const isTeacher = (ctx) => ctx.role === 'teacher' || !!ctx.actingAsPlatform;
const canManage = (ctx) => isTeacher(ctx) || ctx.role === 'coordinator';

// ───────────── Configuração privada do ambiente ─────────────
export const DEFAULT_CONFIG = {
  route_adjust_enabled: true,            // chave liga/desliga do Ajuste de Rota (administrador)
  faco_questao_url: 'https://www.questaodefarmacia.com.br/',
  bonus: {
    constancy_weeks: 3,                  // semanas válidas (de 4) para cumprir a meta de constância
    questions_goal: 300,
    questions_daily_cap: 150,
    plan_pct: 70,
    pacto_min_minutes: 300,              // pacto mínimo (5 h/semana) para a semana valer na meta de constância
    valid_days: 15,
    values_cents: { bronze: 2500, prata: 7500, ouro: 20000 },   // a professora valida estas réguas
  },
  credibility: { subject_accuracy_min: 30, route_min_days: 3, route_min_hours: 3 },
};

function merge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? merge(base[k], v) : v;
  return out;
}

export async function getConfig(d, tenantId) {
  const row = await d.one('SELECT config FROM tenants WHERE id = ?', [tenantId]);
  return merge(DEFAULT_CONFIG, row?.config || {});
}

const int = (v, min, max, label) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw badRequest(`${label}: informe um número inteiro entre ${min} e ${max}.`);
  return n;
};

export async function saveConfig(d, ctx, patch) {
  if (!isTeacher(ctx)) throw forbidden('Somente a professora/administrador altera estas configurações.');
  const cur = await getConfig(d, ctx.tenantId);
  const next = { ...cur, bonus: { ...cur.bonus, values_cents: { ...cur.bonus.values_cents } }, credibility: { ...cur.credibility } };
  if (patch.route_adjust_enabled !== undefined) next.route_adjust_enabled = !!patch.route_adjust_enabled;
  if (patch.faco_questao_url !== undefined) {
    const v = String(patch.faco_questao_url || '').trim();
    if (v) { let u; try { u = new URL(v); } catch { throw badRequest('Link da plataforma de questões inválido.'); } if (u.protocol !== 'https:') throw badRequest('Use um link https://'); next.faco_questao_url = u.toString(); } else next.faco_questao_url = '';
  }
  const b = patch.bonus || {};
  if (b.constancy_weeks !== undefined) next.bonus.constancy_weeks = int(b.constancy_weeks, 1, 4, 'Semanas de constância');
  if (b.questions_goal !== undefined) next.bonus.questions_goal = int(b.questions_goal, 10, 5000, 'Meta de questões');
  if (b.questions_daily_cap !== undefined) next.bonus.questions_daily_cap = int(b.questions_daily_cap, 10, 500, 'Limite diário de questões');
  if (b.pacto_min_minutes !== undefined) next.bonus.pacto_min_minutes = int(b.pacto_min_minutes, 30, 3000, 'Pacto mínimo');
  if (b.plan_pct !== undefined) next.bonus.plan_pct = int(b.plan_pct, 10, 100, 'Percentual do plano');
  if (b.valid_days !== undefined) next.bonus.valid_days = int(b.valid_days, 1, 90, 'Validade do bônus');
  for (const m of ['bronze', 'prata', 'ouro']) if (b.values_cents?.[m] !== undefined) next.bonus.values_cents[m] = int(b.values_cents[m], 0, 1000000, `Valor ${m}`);
  const c = patch.credibility || {};
  if (c.subject_accuracy_min !== undefined) next.credibility.subject_accuracy_min = int(c.subject_accuracy_min, 5, 500, 'Mínimo de questões por matéria');
  await d.run('UPDATE tenants SET config = ?, updated_at = ? WHERE id = ?', [JSON.stringify(next), nowIso(), ctx.tenantId]);
  await audit(d, ctx, 'config.update', { targetType: 'tenant', targetId: ctx.tenantId, payload: { campos: Object.keys(patch) } });
  return next;
}

/** Parte da configuração que o aluno pode ver (links e chaves, sem valores do bônus). */
export function publicConfig(cfg) {
  return { route_adjust_enabled: !!cfg.route_adjust_enabled, faco_questao_url: cfg.faco_questao_url || null };
}

// ───────────── Jornada ─────────────
export const STAGES = ['paid', 'diagnostic', 'scheduled', 'done', 'plan', 'report', 'continued'];
export const STAGE_LABEL = { paid: 'Pagamento confirmado', diagnostic: 'Diagnóstico enviado', scheduled: 'Sessão agendada', done: 'Sessão realizada', plan: 'Plano de ação', report: 'Relatório', continued: 'Continuidade' };

async function lastConsultoria(d, studentId) {
  return d.one("SELECT * FROM accesses WHERE student_id = ? AND kind = 'consultoria' ORDER BY starts_on DESC, created_at DESC LIMIT 1", [studentId]);
}

/** Jornada do aluno (criada na primeira consulta quando existe acesso de consultoria). */
export async function journeyFor(d, ctx, studentId, { create = true } = {}) {
  const acc = await lastConsultoria(d, studentId);
  if (!acc) return null;
  let j = await d.one('SELECT * FROM consult_journeys WHERE access_id = ?', [acc.id]);
  if (!j && create) {
    const st = await d.one('SELECT tenant_id FROM students WHERE id = ?', [studentId]);
    const ts = nowIso();
    j = await d.one(
      `INSERT INTO consult_journeys (tenant_id, student_id, access_id, paid_on, done_on, report_due_on, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT (access_id) DO NOTHING RETURNING *`,
      [st.tenant_id, studentId, acc.id, dstr(acc.starts_on), dstr(acc.meeting_on), acc.meeting_on ? addDays(dstr(acc.meeting_on), 30) : null, ts, ts]);
    if (!j) j = await d.one('SELECT * FROM consult_journeys WHERE access_id = ?', [acc.id]);
  }
  return j ? { ...j, access: acc } : null;
}

export async function journeyView(d, ctx, studentId) {
  const j = await journeyFor(d, ctx, studentId);
  if (!j) return null;
  const diag = await d.one('SELECT id, created_at FROM diagnostics WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', [studentId]);
  const plan = await d.one('SELECT * FROM action_plans WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', [studentId]);
  const report = await d.one('SELECT id, status, approved_at FROM consult_reports WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', [studentId]);
  const doneOn = dstr(j.done_on) || dstr(j.access.meeting_on);
  const reached = {
    paid: true,
    diagnostic: !!diag,
    scheduled: !!(j.scheduled_on || doneOn),
    done: !!doneOn,
    plan: !!plan?.published_at,
    report: report?.status === 'approved',
    continued: j.continued != null,
  };
  const current = STAGES.find((s) => !reached[s]) || 'continued';
  return {
    id: j.id, access_id: j.access_id, paid_on: dstr(j.paid_on), scheduled_on: dstr(j.scheduled_on), session_link: j.session_link, done_on: doneOn,
    report_due_on: doneOn ? addDays(doneOn, 30) : null, continued: j.continued, note: j.note, ends_on: dstr(j.access.ends_on),
    steps: STAGES.map((key) => ({ key, label: STAGE_LABEL[key], state: reached[key] ? 'done' : key === current ? 'current' : 'pending', ...(key === 'diagnostic' && diag ? { at: diag.created_at } : {}) })),
    has_diagnostic: !!diag, report_status: report?.status || null,
  };
}

export async function saveJourney(d, ctx, studentId, patch) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora atualizam a jornada.');
  await assertStudent(d, ctx, studentId);
  const j = await journeyFor(d, ctx, studentId);
  if (!j) throw badRequest('Este aluno não tem acesso de consultoria.');
  const sets = []; const vals = [];
  const date = (k, label) => { if (patch[k] !== undefined) { if (patch[k] && !isDate(patch[k])) throw badRequest(`${label} inválida.`); sets.push(`${k} = ?`); vals.push(patch[k] || null); } };
  date('paid_on', 'Data do pagamento'); date('scheduled_on', 'Data agendada');
  if (patch.session_link !== undefined) {
    const v = String(patch.session_link || '').trim();
    if (v) { let u; try { u = new URL(v); } catch { throw badRequest('Link da sessão inválido.'); } if (u.protocol !== 'https:') throw badRequest('Use um link https://'); }
    sets.push('session_link = ?'); vals.push(v || null);
  }
  if (patch.note !== undefined) { sets.push('note = ?'); vals.push(patch.note ? String(patch.note).slice(0, 600) : null); }
  if (patch.continued !== undefined) { sets.push('continued = ?'); vals.push(patch.continued === null ? null : !!patch.continued); }
  if (patch.done_on) {
    if (!isDate(patch.done_on)) throw badRequest('Data do encontro inválida.');
    await registerMeeting(d, ctx, j.access_id, patch.done_on);          // 30 dias de plataforma a partir daqui
    sets.push('done_on = ?', 'report_due_on = ?'); vals.push(patch.done_on, addDays(patch.done_on, 30));
  }
  if (sets.length) await d.run(`UPDATE consult_journeys SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...vals, nowIso(), j.id]);
  await audit(d, ctx, 'consult.journey', { targetType: 'student', targetId: studentId, payload: { campos: Object.keys(patch) } });
  return journeyView(d, ctx, studentId);
}

// ───────────── Diagnóstico nativo ─────────────
export const DIAG_QUESTIONS = [
  { key: 'goal', label: 'Qual concurso (ou concursos) você quer passar?', type: 'text', required: true },
  { key: 'exam_date', label: 'Data prevista da prova, se já souber', type: 'text' },
  { key: 'hours_week', label: 'Quantas horas por semana consegue estudar de verdade?', type: 'number', required: true },
  { key: 'study_days', label: 'Em quais dias da semana costuma estudar?', type: 'text' },
  { key: 'time_studying', label: 'Há quanto tempo estuda para concursos?', type: 'choice', options: ['Estou começando', 'Menos de 6 meses', 'De 6 meses a 1 ano', 'Mais de 1 ano'], required: true },
  { key: 'strong_subjects', label: 'Em quais matérias você se sente mais seguro(a)?', type: 'text' },
  { key: 'weak_subjects', label: 'Em quais matérias você tem mais dificuldade?', type: 'text', required: true },
  { key: 'how_study', label: 'Como você estuda hoje? (aulas, PDFs, questões, resumos...)', type: 'text', required: true },
  { key: 'questions_week', label: 'Quantas questões resolve por semana, em média?', type: 'number' },
  { key: 'main_difficulty', label: 'Qual é a sua maior dificuldade hoje?', type: 'choice', options: ['Organização do tempo', 'Constância', 'Entender o conteúdo', 'Fixar o que estudei', 'Resolver questões', 'Ansiedade na prova', 'Outra'], required: true },
  { key: 'expectation', label: 'O que você espera da consultoria?', type: 'text', required: true },
];

export function validateDiagnostic(answers) {
  const out = {};
  for (const q of DIAG_QUESTIONS) {
    let v = answers?.[q.key];
    if (v == null || String(v).trim() === '') { if (q.required) throw badRequest(`Responda: ${q.label}`); continue; }
    v = String(v).trim().slice(0, 1000);
    if (q.type === 'number' && !/^\d{1,4}$/.test(v)) throw badRequest(`Informe só números em: ${q.label}`);
    if (q.type === 'choice' && !q.options.includes(v)) throw badRequest(`Escolha uma opção em: ${q.label}`);
    out[q.key] = v;
  }
  return out;
}

export async function submitDiagnostic(d, ctx, studentId, { answers, consent }, { ip, termsVersion } = {}) {
  if (consent !== true) throw badRequest('Para enviar, marque a autorização do uso das respostas.', 'consent_required');
  const clean = validateDiagnostic(answers);
  const st = await d.one('SELECT tenant_id FROM students WHERE id = ?', [studentId]);
  const j = await journeyFor(d, ctx, studentId);
  const ts = nowIso();
  const row = await d.one(
    `INSERT INTO diagnostics (tenant_id, student_id, journey_id, answers, consent, consent_at, terms_version, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id, created_at`,
    [st.tenant_id, studentId, j?.id || null, JSON.stringify(clean), true, ts, termsVersion || null, ip || null, ts]);
  await audit(d, ctx, 'consult.diagnostic', { targetType: 'student', targetId: studentId, payload: { id: row.id, consent: true, terms_version: termsVersion || null } });
  return row;
}

export async function getDiagnostic(d, ctx, studentId) {
  const row = await d.one('SELECT id, answers, consent_at, terms_version, created_at FROM diagnostics WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', [studentId]);
  return row ? { ...row, questions: DIAG_QUESTIONS } : null;
}

// ───────────── Plano de ação ─────────────
export async function savePlan(d, ctx, studentId, { title, items, publish }) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora montam o plano.');
  const st = await assertStudent(d, ctx, studentId);
  const list = (items || []).map((x) => ({ text: String(x?.text ?? x ?? '').trim().slice(0, 240), due_on: x?.due_on && isDate(x.due_on) ? x.due_on : null })).filter((x) => x.text);
  if (!list.length) throw badRequest('Inclua pelo menos uma ação.');
  if (list.length > 40) throw badRequest('Use até 40 ações por plano.');
  const j = await journeyFor(d, ctx, studentId);
  const ts = nowIso();
  let plan = await d.one('SELECT * FROM action_plans WHERE student_id = ? AND journey_id IS NOT DISTINCT FROM ? ORDER BY created_at DESC LIMIT 1', [studentId, j?.id || null]);
  if (!plan) plan = await d.one('INSERT INTO action_plans (tenant_id, student_id, journey_id, title, created_by, created_at) VALUES (?,?,?,?,?,?) RETURNING *', [st.tenant_id, studentId, j?.id || null, String(title || 'Plano de ação').slice(0, 160), ctx.userId, ts]);
  else await d.run('UPDATE action_plans SET title = ? WHERE id = ?', [String(title || plan.title).slice(0, 160), plan.id]);
  // Mantém as ações já feitas (mesmo texto) ao reeditar.
  const done = new Map((await d.all('SELECT text, done_at FROM action_items WHERE plan_id = ?', [plan.id])).map((r) => [r.text, r.done_at]));
  await d.run('DELETE FROM action_items WHERE plan_id = ?', [plan.id]);
  for (const [i, it] of list.entries()) await d.run('INSERT INTO action_items (tenant_id, plan_id, student_id, text, due_on, position, done_at) VALUES (?,?,?,?,?,?,?)', [st.tenant_id, plan.id, studentId, it.text, it.due_on, i, done.get(it.text) || null]);
  if (publish && !plan.published_at) await d.run('UPDATE action_plans SET published_at = ? WHERE id = ?', [ts, plan.id]);
  await audit(d, ctx, 'consult.plan', { targetType: 'student', targetId: studentId, payload: { items: list.length, publish: !!publish } });
  return getPlan(d, ctx, studentId, { staff: true });
}

export async function getPlan(d, ctx, studentId, { staff = false } = {}) {
  // O plano pertence à jornada atual: numa renovação, o plano e as marcações da consultoria anterior não valem.
  const j = await journeyFor(d, ctx, studentId, { create: false });
  const plan = await d.one('SELECT * FROM action_plans WHERE student_id = ? AND journey_id IS NOT DISTINCT FROM ? ORDER BY created_at DESC LIMIT 1', [studentId, j?.id || null]);
  if (!plan || (!staff && !plan.published_at)) return null;
  const items = (await d.all('SELECT id, text, due_on, position, done_at FROM action_items WHERE plan_id = ? ORDER BY position', [plan.id])).map((i) => ({ ...i, due_on: dstr(i.due_on), done: !!i.done_at }));
  const done = items.filter((i) => i.done).length;
  return { id: plan.id, title: plan.title, published_at: plan.published_at, items, done, total: items.length, pct: items.length ? Math.round((done / items.length) * 100) : 0 };
}

export async function toggleItem(d, ctx, studentId, itemId, done) {
  const j = await journeyFor(d, ctx, studentId, { create: false });
  const it = await d.one('SELECT i.id FROM action_items i JOIN action_plans p ON p.id = i.plan_id WHERE i.id = ? AND i.student_id = ? AND p.published_at IS NOT NULL AND p.journey_id IS NOT DISTINCT FROM ?', [itemId, studentId, j?.id || null]);
  if (!it) throw notFound('Ação não encontrada.');
  await d.run('UPDATE action_items SET done_at = ? WHERE id = ?', [done ? nowIso() : null, itemId]);
  return getPlan(d, ctx, studentId);
}

// ───────────── Medição do bônus ─────────────
async function studentTz(d, studentId) {
  return (await d.one('SELECT u.timezone FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [studentId]))?.timezone || null;
}
export const MEDAL = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro' };

/** Mede as 3 metas na janela [encontro, encontro + 30 dias]. Função de leitura: nada é gravado. */
export async function measureBonus(d, ctx, studentId, { cfg, tz } = {}) {
  const j = await journeyFor(d, ctx, studentId, { create: false });
  const conf = cfg || await getConfig(d, ctx.tenantId);
  const b = conf.bonus;
  tz = tz || (await studentTz(d, studentId)) || ctx.tz;            // sempre o fuso do aluno, não de quem consulta
  const t = todayFn(tz);
  const doneOn = j ? (dstr(j.done_on) || dstr(j.access.meeting_on)) : null;
  const base = { eligible: !!j, started: !!doneOn, goals: {}, goals_met: 0, medal: null, discount_cents: 0 };
  if (!j) return base;
  if (!doneOn) return { ...base, goals: emptyGoals(b) };
  const to = addDays(doneOn, 30) < t ? addDays(doneOn, 30) : t;
  // Constância: semanas válidas (≥ 50% do pacto) entre as 4 primeiras semanas da janela.
  // Anti-manipulação: dentro da janela, só conta estudo de cronômetro ou lançado manualmente NO PRÓPRIO DIA, e o pacto
  // da semana precisa ter o mínimo configurado (um pacto de 30 min não gera "semana verde").
  const input = await loadInputs(d, studentId, tz);
  const w0 = weekStartOf(doneOn);
  const rows = await d.all(
    `SELECT date, SUM(duration_seconds)::int AS total FROM study_sessions WHERE student_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?
        AND (source = 'timer' OR (created_at AT TIME ZONE ?)::date = date) GROUP BY date`, [studentId, w0, to, tz]);
  const minutes = new Map(input.minutes);
  for (let w = w0; w <= to; w = addDays(w, 7)) minutes.set(w, { total: 0, manual: 0 });
  for (const r of rows) { const w = weekStartOf(dstr(r.date)); const c = minutes.get(w) || { total: 0, manual: 0 }; minutes.set(w, { total: c.total + r.total, manual: c.manual }); }
  const ev = evaluatePacto({ ...input, minutes });
  const wk = ev.weeks.filter((w) => w.week_start >= w0 && w.week_start <= to).slice(0, 4);
  const valid = wk.filter((w) => ['green', 'yellow', 'shield'].includes(w.state) && (w.promised_minutes || 0) >= b.pacto_min_minutes).length;
  // Questões: só as lançadas no mesmo dia, até o limite diário.
  const qrows = await d.all(
    `SELECT date, SUM(questions)::int AS q FROM question_logs WHERE student_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?
        AND (created_at AT TIME ZONE ?)::date = date GROUP BY date`, [studentId, doneOn, to, tz]);
  const questions = qrows.reduce((a, r) => a + Math.min(r.q, b.questions_daily_cap), 0);
  // Plano: só contam ações marcadas até o fim da janela medida.
  const planFull = await getPlan(d, ctx, studentId);
  const dayOf = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
  const plan = planFull && { ...planFull, done: planFull.items.filter((i) => i.done && dayOf(i.done_at) <= to).length };
  if (plan) plan.pct = plan.total ? Math.round((plan.done / plan.total) * 100) : 0;
  const planPct = plan?.pct || 0;
  const goals = {
    constancy: { value: valid, of: 4, need: b.constancy_weeks, met: valid >= b.constancy_weeks, label: `Chama acesa em ${valid} de 4 semanas` },
    questions: { value: questions, of: b.questions_goal, need: b.questions_goal, met: questions >= b.questions_goal, label: `${questions} questões resolvidas no período` },
    plan: { value: plan?.done || 0, of: plan?.total || 0, pct: planPct, need: b.plan_pct, met: !!plan?.total && planPct >= b.plan_pct, label: `${planPct}% das ações necessárias` },
  };
  const met = Object.values(goals).filter((g) => g.met).length;
  // Bronze = 1 meta, Prata = 2, Ouro = 3. Sem nenhuma meta não há medalha nem bônus.
  const medal = met >= 3 ? 'ouro' : met === 2 ? 'prata' : met === 1 ? 'bronze' : null;
  return { eligible: true, started: true, window: { from: doneOn, to }, goals, goals_met: met, medal, discount_cents: medal ? b.values_cents[medal] : 0 };
}
function emptyGoals(b) {
  return {
    constancy: { value: 0, of: 4, need: b.constancy_weeks, met: false, label: 'Chama acesa em 0 de 4 semanas' },
    questions: { value: 0, of: b.questions_goal, need: b.questions_goal, met: false, label: '0 questões resolvidas no período' },
    plan: { value: 0, of: 0, pct: 0, need: b.plan_pct, met: false, label: '0% das ações necessárias' },
  };
}

/** Bônus emitido (após aprovar o relatório) mais recente do aluno. */
export async function issuedBonus(d, studentId, t) {
  const r = await d.one('SELECT * FROM bonuses WHERE student_id = ? ORDER BY issued_on DESC, created_at DESC LIMIT 1', [studentId]);
  if (!r) return null;
  const valid_until = dstr(r.valid_until);
  return { id: r.id, medal: r.medal, medal_label: MEDAL[r.medal], discount_cents: r.discount_cents, issued_on: dstr(r.issued_on), valid_until, applied: !!r.applied_at, applied_at: r.applied_at, expired: !r.applied_at && valid_until < t, days_left: Math.max(0, Math.round((new Date(`${valid_until}T00:00:00Z`) - new Date(`${t}T00:00:00Z`)) / 86400000)) };
}

/** Visão do aluno na aba Consultoria. */
export async function consultoriaForStudent(d, ctx, studentId) {
  const journey = await journeyView(d, ctx, studentId);
  if (!journey) return null;
  const t = todayFn(ctx.tz);
  const cfg = await getConfig(d, ctx.tenantId);
  const measure = await measureBonus(d, ctx, studentId, { cfg });
  const issued = await issuedBonus(d, studentId, t);
  const plan = await getPlan(d, ctx, studentId);
  const report = await d.one("SELECT id, period_from, period_to, facts, body, approved_at FROM consult_reports WHERE student_id = ? AND status = 'approved' ORDER BY approved_at DESC LIMIT 1", [studentId]);
  return {
    journey: { ...journey, note: undefined }, plan, bonus: { ...measure, issued, valid_days: cfg.bonus.valid_days, values_cents: undefined }, report: report ? { ...report, period_from: dstr(report.period_from), period_to: dstr(report.period_to) } : null,
    needs_diagnostic: !journey.has_diagnostic, diagnostic_questions: DIAG_QUESTIONS,
  };
}

// ───────────── Relatório de 30 dias ─────────────
/** Fatos calculados do período (sem IA). Cada número traz a base e o nível de confiança. */
export async function reportFacts(d, ctx, studentId, from, to, cfg) {
  const conf = cfg || await getConfig(d, ctx.tenantId);
  const min = conf.credibility.subject_accuracy_min;
  const hours = await d.one("SELECT COALESCE(sum(duration_seconds),0)::int AS secs, count(*)::int AS n, count(DISTINCT date)::int AS days, COALESCE(sum(duration_seconds) FILTER (WHERE source = 'manual'),0)::int AS manual FROM study_sessions WHERE student_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?", [studentId, from, to]);
  const subj = await d.all(
    `SELECT s.name AS subject, sum(x.questions)::int AS q, sum(x.correct)::int AS c
       FROM question_logs x LEFT JOIN topics t ON t.id = x.topic_id JOIN subjects s ON s.id = COALESCE(t.subject_id, x.subject_id)
      WHERE x.student_id = ? AND x.voided_at IS NULL AND x.date >= ? AND x.date <= ? GROUP BY s.name ORDER BY q DESC`, [studentId, from, to]);
  const totalQ = await d.one('SELECT COALESCE(sum(questions),0)::int AS q, COALESCE(sum(correct),0)::int AS c FROM question_logs WHERE student_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?', [studentId, from, to]);
  const level = (n) => (n < min ? 'insuficiente' : n < min * 2 ? 'inicial' : 'confiavel');
  const subjects = subj.map((r) => {
    const lv = level(r.q);
    return { subject: r.subject, questions: r.q, accuracy: lv === 'insuficiente' ? null : round1((r.c / r.q) * 100), level: lv, missing: lv === 'insuficiente' ? min - r.q : 0 };
  });
  const changes = await d.all("SELECT to_status AS status, count(*)::int AS n FROM learning_events WHERE student_id = ? AND type = 'status_change' AND date >= ? AND date <= ? GROUP BY to_status", [studentId, from, to]);
  const consolidated = await d.one("SELECT count(*)::int AS n FROM topic_progress WHERE student_id = ? AND status = 'consolidated'", [studentId]);
  const measure = await measureBonus(d, ctx, studentId, { cfg: conf });
  return {
    period: { from, to },
    hours: { seconds: hours.secs, sessions: hours.n, days: hours.days, manual_seconds: hours.manual, basis: `${hours.n} ${hours.n === 1 ? 'sessão' : 'sessões'} em ${hours.days} ${hours.days === 1 ? 'dia' : 'dias'}` },
    questions: { total: totalQ.q, correct: totalQ.c, accuracy: totalQ.q >= min ? round1((totalQ.c / totalQ.q) * 100) : null, subjects },
    status_changes: changes, consolidated_total: consolidated.n,
    goals: measure.goals, goals_met: measure.goals_met, medal: measure.medal, min_questions: min,
  };
}

export async function prepareReport(d, ctx, studentId, { body } = {}) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora preparam o relatório.');
  const st = await assertStudent(d, ctx, studentId);
  const j = await journeyView(d, ctx, studentId);
  if (!j?.done_on) throw badRequest('Registre o encontro realizado antes de preparar o relatório.');
  const t = todayFn(st.timezone || ctx.tz);
  if (await d.one("SELECT 1 FROM consult_reports WHERE student_id = ? AND journey_id = ? AND status = 'approved'", [studentId, j.id])) throw badRequest('O relatório desta consultoria já foi aprovado.');
  const to = addDays(j.done_on, 30) < t ? addDays(j.done_on, 30) : t;
  const facts = await reportFacts(d, ctx, studentId, j.done_on, to);
  const draft = await d.one("SELECT id FROM consult_reports WHERE student_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1", [studentId]);
  let row;
  if (draft) row = await d.one('UPDATE consult_reports SET facts = ?, body = COALESCE(?, body), period_from = ?, period_to = ? WHERE id = ? RETURNING *', [JSON.stringify(facts), body ?? null, j.done_on, to, draft.id]);
  else row = await d.one('INSERT INTO consult_reports (tenant_id, student_id, journey_id, period_from, period_to, facts, body, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING *', [st.tenant_id, studentId, j.id, j.done_on, to, JSON.stringify(facts), body || null, ctx.userId, nowIso()]);
  await audit(d, ctx, 'consult.report_prepare', { targetType: 'student', targetId: studentId, payload: { report: row.id } });
  return row;
}

export async function updateReportBody(d, ctx, reportId, body) {
  if (!canManage(ctx)) throw forbidden('Sem permissão.');
  const r = await d.one("SELECT * FROM consult_reports WHERE id = ? AND status = 'draft'", [reportId]);
  if (!r) throw notFound('Rascunho não encontrado.');
  await assertStudent(d, ctx, r.student_id);
  await d.run('UPDATE consult_reports SET body = ? WHERE id = ?', [String(body || '').slice(0, 8000), reportId]);
  await audit(d, ctx, 'consult.report_edit', { targetType: 'student', targetId: r.student_id, payload: { report: reportId } });
  return d.one('SELECT * FROM consult_reports WHERE id = ?', [reportId]);
}

/** Só a professora aprova. Ao aprovar, o bônus é emitido (valor da medalha, validade a partir de hoje). */
export async function approveReport(d, ctx, reportId) {
  if (!isTeacher(ctx)) throw forbidden('Somente a professora aprova o relatório.');
  const r = await d.one("SELECT * FROM consult_reports WHERE id = ? AND status = 'draft'", [reportId]);
  if (!r) throw notFound('Rascunho não encontrado.');
  const st = await assertStudent(d, ctx, r.student_id);
  const t = todayFn(st.timezone || ctx.tz);
  const cfg = await getConfig(d, ctx.tenantId);
  const facts = await reportFacts(d, ctx, r.student_id, dstr(r.period_from), dstr(r.period_to), cfg);
  const ts = nowIso();
  const won = await d.one("UPDATE consult_reports SET status = 'approved', approved_by = ?, approved_at = ?, facts = ? WHERE id = ? AND status = 'draft' RETURNING id", [ctx.userId, ts, JSON.stringify(facts), reportId]);
  if (!won) throw conflict('Este relatório já foi aprovado.');
  if (r.journey_id && await d.one('SELECT 1 FROM bonuses WHERE journey_id = ?', [r.journey_id])) throw conflict('Esta consultoria já teve um bônus emitido.');
  const measure = await measureBonus(d, ctx, r.student_id, { cfg });
  let bonus = null;
  if (measure.medal) {
    bonus = await d.one(
      `INSERT INTO bonuses (tenant_id, student_id, journey_id, report_id, medal, discount_cents, metrics, issued_on, valid_until, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      [r.tenant_id, r.student_id, r.journey_id, reportId, measure.medal, measure.discount_cents, JSON.stringify(measure.goals), t, addDays(t, cfg.bonus.valid_days - 1), ts]);
  }
  await audit(d, ctx, 'consult.report_approve', { targetType: 'student', targetId: r.student_id, payload: { report: reportId, medal: measure.medal, discount_cents: measure.discount_cents } });
  return { report_id: reportId, bonus };
}

export async function listReports(d, ctx, studentId) {
  await assertStudent(d, ctx, studentId);
  return (await d.all('SELECT id, status, period_from, period_to, facts, body, approved_at, created_at FROM consult_reports WHERE student_id = ? ORDER BY created_at DESC', [studentId]))
    .map((r) => ({ ...r, period_from: dstr(r.period_from), period_to: dstr(r.period_to) }));
}

/** Baixa manual do bônus: quem gerou o link de compra com o desconto marca como aplicado. */
export async function applyBonus(d, ctx, bonusId, note) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora dão baixa no bônus.');
  const b = await d.one('SELECT * FROM bonuses WHERE id = ?', [bonusId]);
  if (!b) throw notFound('Bônus não encontrado.');
  await assertStudent(d, ctx, b.student_id);
  if (b.applied_at) throw badRequest('Este bônus já foi aplicado.');
  const t = todayFn(ctx.tz);
  if (dstr(b.valid_until) < t) throw badRequest('Este bônus venceu.');
  const won = await d.one('UPDATE bonuses SET applied_by = ?, applied_at = ?, applied_note = ? WHERE id = ? AND applied_at IS NULL RETURNING id', [ctx.userId, nowIso(), note ? String(note).slice(0, 300) : null, bonusId]);
  if (!won) throw badRequest('Este bônus já foi aplicado.');
  await audit(d, ctx, 'consult.bonus_apply', { targetType: 'student', targetId: b.student_id, payload: { bonus: bonusId, discount_cents: b.discount_cents } });
  return issuedBonus(d, b.student_id, t);
}

/** Tudo da consultoria de um aluno, para a ficha da equipe. */
export async function consultoriaForStaff(d, ctx, studentId) {
  await assertStudent(d, ctx, studentId);
  const journey = await journeyView(d, ctx, studentId);
  if (!journey) return null;
  const cfg = await getConfig(d, ctx.tenantId);
  const t = todayFn(ctx.tz);
  const seeMoney = isTeacher(ctx);                       // valores em R$ do bônus: só professora/administrador
  const live = await measureBonus(d, ctx, studentId, { cfg });
  const issued = await issuedBonus(d, studentId, t);
  await audit(d, ctx, 'consult.view', { targetType: 'student', targetId: studentId });   // inclui a leitura do diagnóstico
  return {
    journey, diagnostic: await getDiagnostic(d, ctx, studentId), plan: await getPlan(d, ctx, studentId, { staff: true }),
    reports: await listReports(d, ctx, studentId),
    bonus_live: seeMoney ? live : { ...live, discount_cents: undefined },
    bonus_issued: issued && (seeMoney ? issued : { ...issued, discount_cents: undefined }),
    bonus_values_cents: seeMoney ? cfg.bonus.values_cents : undefined,
  };
}
