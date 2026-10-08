/**
 * Acessos: uma conta, várias vigências (Turma, Consultoria, Só Plataforma).
 *  - Consultoria: 30 dias contados do "encontro realizado" (até lá fica sem data de fim).
 *  - Pausa: 1 por acesso; extra somente liberada pela professora; sem limite de duração; só para acessos longos (≥ 90 dias).
 *  - Cancelamento exige motivo.
 * students.access_until / plan_status continuam sendo o resumo usado por listas e filtros (ver syncLegacy).
 */
import { badRequest, daysBetween, forbidden, notFound, nowIso, addDays, today as todayFn } from '../lib/util.js';
import { audit, assertStudent } from '../security/access.js';
import { destroyUserSessions } from '../security/auth.js';

export const KINDS = { turma: 'Turma', consultoria: 'Consultoria', plataforma: 'Só plataforma' };
export const LONG_ACCESS_DAYS = 90;
export const CONSULTORIA_DAYS = 30;

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTeacher = (ctx) => ctx.role === 'teacher' || !!ctx.actingAsPlatform;
const canManage = (ctx) => isTeacher(ctx) || ctx.role === 'coordinator';
const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v || null);
const norm = (r) => ({ ...r, starts_on: dstr(r.starts_on), ends_on: dstr(r.ends_on), paused_from: dstr(r.paused_from), meeting_on: dstr(r.meeting_on) });

export function isLong(a) {
  return !!a.ends_on && daysBetween(a.starts_on, a.ends_on) >= LONG_ACCESS_DAYS;
}

/** Situação de um acesso na data `t`: active | paused | expired | canceled | pending_meeting. */
export function accessStatus(a, t) {
  if (a.status === 'canceled') return 'canceled';
  if (a.paused_from) return 'paused';
  if (a.kind === 'consultoria' && !a.ends_on) return 'pending_meeting';
  if (a.ends_on && a.ends_on < t) return 'expired';
  return 'active';
}

/** Situação do aluno: active | paused | expired. Sem acessos cadastrados vale o resumo antigo (validade/plano). */
export function studentState(rows, legacy, t) {
  const list = rows.map(norm);
  if (!list.length) {
    if (legacy.plan_status === 'ended' || (legacy.access_until && dstr(legacy.access_until) < t)) return 'expired';
    return 'active';
  }
  const sts = list.map((a) => accessStatus(a, t));
  if (sts.some((s) => s === 'active' || s === 'pending_meeting')) return 'active';
  if (sts.some((s) => s === 'paused')) return 'paused';
  return 'expired';
}

export async function listAccesses(d, ctx, studentId) {
  await assertStudent(d, ctx, studentId);
  const rows = (await d.all('SELECT * FROM accesses WHERE student_id = ? ORDER BY starts_on DESC, created_at DESC', [studentId])).map(norm);
  const t = todayFn(ctx.tz);
  return rows.map((a) => ({ ...a, situation: accessStatus(a, t), long: isLong(a), can_pause: canPause(a) }));
}

function canPause(a) {
  if (a.status === 'canceled' || a.paused_from || !isLong(a)) return false;
  return a.pauses_used < 1 || !!a.extra_pause_allowed;
}

/** Atualiza o resumo antigo usado nas listas: validade = maior fim entre os acessos válidos; plano = ativo/pausado/encerrado. */
export async function syncLegacy(d, studentId, tz) {
  const t = todayFn(tz);
  const rows = (await d.all('SELECT * FROM accesses WHERE student_id = ?', [studentId])).map(norm);
  if (!rows.length) return;
  const state = studentState(rows, {}, t);
  const live = rows.filter((a) => a.status !== 'canceled');
  const ends = live.map((a) => a.ends_on).filter(Boolean).sort();
  const until = state === 'paused' ? null : (ends[ends.length - 1] || null);
  const plan = state === 'expired' ? 'ended' : state === 'paused' ? 'paused' : 'active';
  await d.run('UPDATE students SET access_until = ?, plan_status = ?, updated_at = ? WHERE id = ?', [until, plan, nowIso(), studentId]);
}

async function studentTz(d, studentId) {
  return (await d.one('SELECT u.timezone FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [studentId]))?.timezone || undefined;
}

export async function grantAccess(d, ctx, studentId, { kind, label, starts_on, ends_on, days }) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const st = await assertStudent(d, ctx, studentId);
  if (!KINDS[kind]) throw badRequest('Tipo de acesso inválido.');
  const start = starts_on || todayFn(st.timezone || ctx.tz);
  if (!isDate(start)) throw badRequest('Data de início inválida.');
  let end = ends_on || null;
  if (!end && days) end = addDays(start, Number(days));
  if (end && !isDate(end)) throw badRequest('Data de fim inválida.');
  if (kind !== 'consultoria' && !end) throw badRequest('Informe até quando vale este acesso.');
  if (end && end < start) throw badRequest('O fim não pode ser antes do início.');
  const row = await d.one(
    `INSERT INTO accesses (tenant_id, student_id, kind, label, starts_on, ends_on, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?) RETURNING *`,
    [st.tenant_id, studentId, kind, label ? String(label).slice(0, 120) : null, start, end, ctx.userId, nowIso(), nowIso()]
  );
  await syncLegacy(d, studentId, st.timezone);
  await audit(d, ctx, 'access.grant', { targetType: 'student', targetId: studentId, payload: { kind, starts_on: start, ends_on: end, label } });
  return norm(row);
}

async function loadAccess(d, ctx, accessId) {
  const a = await d.one('SELECT * FROM accesses WHERE id = ?', [accessId]);
  if (!a) throw notFound('Acesso não encontrado.');
  await assertStudent(d, ctx, a.student_id);
  return norm(a);
}

export async function updateAccess(d, ctx, accessId, { ends_on, starts_on, label }) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const a = await loadAccess(d, ctx, accessId);
  const sets = []; const vals = []; const changes = {};
  if (ends_on !== undefined) { if (ends_on && !isDate(ends_on)) throw badRequest('Data de fim inválida.'); sets.push('ends_on = ?'); vals.push(ends_on || null); changes.ends_on = { anterior: a.ends_on, novo: ends_on || null }; }
  if (starts_on !== undefined) { if (!isDate(starts_on)) throw badRequest('Data de início inválida.'); sets.push('starts_on = ?'); vals.push(starts_on); changes.starts_on = { anterior: a.starts_on, novo: starts_on }; }
  if (label !== undefined) { sets.push('label = ?'); vals.push(label ? String(label).slice(0, 120) : null); changes.label = { anterior: a.label, novo: label }; }
  if (!sets.length) return a;
  await d.run(`UPDATE accesses SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...vals, nowIso(), accessId]);
  await syncLegacy(d, a.student_id, await studentTz(d, a.student_id));
  await audit(d, ctx, 'access.update', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, ...changes } });
  return norm(await d.one('SELECT * FROM accesses WHERE id = ?', [accessId]));
}

/** Consultoria: o prazo (30 dias) passa a contar do encontro realizado. */
export async function registerMeeting(d, ctx, accessId, date) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const a = await loadAccess(d, ctx, accessId);
  if (a.kind !== 'consultoria') throw badRequest('Só a consultoria conta o prazo a partir do encontro.');
  if (a.status === 'canceled') throw badRequest('Este acesso foi cancelado.');
  if (!isDate(date)) throw badRequest('Data do encontro inválida.');
  const ends = addDays(date, CONSULTORIA_DAYS);
  await d.run('UPDATE accesses SET meeting_on = ?, ends_on = ?, updated_at = ? WHERE id = ?', [date, ends, nowIso(), accessId]);
  await syncLegacy(d, a.student_id, await studentTz(d, a.student_id));
  await audit(d, ctx, 'access.meeting', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, meeting_on: date, ends_on: ends } });
  return { meeting_on: date, ends_on: ends };
}

export async function pauseAccess(d, ctx, accessId) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const a = await loadAccess(d, ctx, accessId);
  if (a.status === 'canceled') throw badRequest('Este acesso foi cancelado.');
  if (a.paused_from) throw badRequest('Este acesso já está pausado.');
  if (!isLong(a)) throw badRequest(`A pausa só vale para acessos longos (a partir de ${LONG_ACCESS_DAYS} dias).`);
  if (!canPause(a)) throw badRequest('Este acesso já usou a pausa. Somente a professora pode liberar uma pausa extra.', 'pause_used');
  const tz = await studentTz(d, a.student_id);
  const t = todayFn(tz);
  if (a.ends_on < t) throw badRequest('Este acesso já terminou.');
  const usedExtra = a.pauses_used >= 1;
  await d.run('UPDATE accesses SET paused_from = ?, pauses_used = pauses_used + 1, extra_pause_allowed = CASE WHEN ? THEN false ELSE extra_pause_allowed END, updated_at = ? WHERE id = ?', [t, usedExtra, nowIso(), accessId]);
  await d.run('INSERT INTO access_pauses (tenant_id, student_id, access_id, from_date) VALUES (?,?,?,?)', [a.tenant_id, a.student_id, accessId, t]);
  await syncLegacy(d, a.student_id, tz);
  await audit(d, ctx, 'access.pause', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, from: t, extra: usedExtra } });
}

/** Retomar: o tempo parado é somado ao fim do acesso. */
export async function resumeAccess(d, ctx, accessId) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const a = await loadAccess(d, ctx, accessId);
  if (!a.paused_from) throw badRequest('Este acesso não está pausado.');
  const tz = await studentTz(d, a.student_id);
  const t = todayFn(tz);
  const paused = Math.max(0, daysBetween(a.paused_from, t));
  const ends = a.ends_on ? addDays(a.ends_on, paused) : null;
  await d.run('UPDATE accesses SET paused_from = NULL, ends_on = ?, updated_at = ? WHERE id = ?', [ends, nowIso(), accessId]);
  await d.run('UPDATE access_pauses SET to_date = ? WHERE access_id = ? AND to_date IS NULL', [t, accessId]);
  await syncLegacy(d, a.student_id, tz);
  await audit(d, ctx, 'access.resume', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, paused_days: paused, ends_on: ends } });
  return { paused_days: paused, ends_on: ends };
}

export async function allowExtraPause(d, ctx, accessId, allowed = true) {
  if (!isTeacher(ctx)) throw forbidden('Somente a professora pode liberar uma pausa extra.');
  const a = await loadAccess(d, ctx, accessId);
  await d.run('UPDATE accesses SET extra_pause_allowed = ?, updated_at = ? WHERE id = ?', [!!allowed, nowIso(), accessId]);
  await audit(d, ctx, 'access.extra_pause', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, allowed: !!allowed } });
}

export async function cancelAccess(d, ctx, accessId, reason) {
  if (!canManage(ctx)) throw forbidden('Somente a professora ou a coordenadora gerenciam acessos.');
  const why = String(reason || '').trim();
  if (why.length < 3) throw badRequest('Informe o motivo do cancelamento.');
  const a = await loadAccess(d, ctx, accessId);
  if (a.status === 'canceled') throw badRequest('Este acesso já está cancelado.');
  await d.run("UPDATE accesses SET status = 'canceled', cancel_reason = ?, canceled_at = ?, paused_from = NULL, updated_at = ? WHERE id = ?", [why.slice(0, 300), nowIso(), nowIso(), accessId]);
  await d.run('UPDATE access_pauses SET to_date = ? WHERE access_id = ? AND to_date IS NULL', [todayFn(await studentTz(d, a.student_id)), accessId]);
  const tz = await studentTz(d, a.student_id);
  await syncLegacy(d, a.student_id, tz);
  await audit(d, ctx, 'access.cancel', { targetType: 'student', targetId: a.student_id, payload: { access: accessId, reason: why } });
}

/** Resumo do aluno para a tela "Seu período de acesso encerrou" / "Plano pausado". */
export async function accessSummary(d, ctx, studentId) {
  const st = await d.one('SELECT st.plan_status, st.access_until, u.timezone FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [studentId]);
  const t = todayFn(st?.timezone || ctx.tz);
  const rows = (await d.all('SELECT * FROM accesses WHERE student_id = ? ORDER BY starts_on DESC', [studentId])).map(norm);
  const state = studentState(rows, st || {}, t);
  const paused = rows.find((a) => a.paused_from && a.status !== 'canceled');
  const totals = await d.one(
    `SELECT COALESCE((SELECT SUM(duration_seconds) FROM study_sessions WHERE student_id = ? AND voided_at IS NULL),0) AS seconds,
            COALESCE((SELECT SUM(questions) FROM question_logs WHERE student_id = ? AND voided_at IS NULL),0) AS questions,
            (SELECT count(*) FROM topic_progress WHERE student_id = ? AND status = 'consolidated') AS consolidated,
            (SELECT count(*) FROM topic_progress WHERE student_id = ? AND status <> 'not_started') AS started`,
    [studentId, studentId, studentId, studentId]);
  const colors = await d.all(
    `SELECT status, count(*)::int AS n FROM topic_progress WHERE student_id = ? GROUP BY status`, [studentId]);
  return {
    state, today: t,
    ends_on: rows.length ? (rows.map((a) => a.ends_on).filter(Boolean).sort().pop() || null) : dstr(st?.access_until),
    paused_since: paused?.paused_from || null,
    accesses: rows.map((a) => ({ id: a.id, kind: a.kind, label: a.label, starts_on: a.starts_on, ends_on: a.ends_on, situation: accessStatus(a, t) })),
    totals: { seconds: Number(totals.seconds), questions: Number(totals.questions), consolidated: Number(totals.consolidated), started: Number(totals.started) },
    colors,
  };
}
