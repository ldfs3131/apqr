/**
 * Pacto de Estudo: compromisso semanal (horas + dias) do aluno. Calculado a cada consulta, sem rotina noturna.
 *
 * Regras (decididas com a professora):
 *  - Semana = segunda a domingo, no fuso do aluno. O pacto vale por semana; sem definir, repete o da semana anterior.
 *  - Pode ser definido/alterado até quarta 23h59 (semana atual) ou a qualquer hora para a próxima semana; depois trava.
 *  - A semana VALE com pelo menos 50% das horas prometidas (vermelho < 50%, amarelo 50–99%, verde ≥ 100%).
 *  - Primeira semana parcial (pacto definido depois da segunda) e semana com plano pausado: não contam e não quebram.
 *  - Chama = semanas válidas seguidas. Semana vermelha zera a Chama, a menos que um Escudo seja usado.
 *  - Escudo: 1 a cada 4 semanas verdes (zera na vermelha); guarda no máximo 2; usa no máximo 1 por mês, automaticamente.
 *  - Tempo lançado manualmente conta, mas fica marcado como "manual".
 */
import { badRequest, addDays, daysBetween, nowIso, today as todayFn, weekdayMon0 } from '../lib/util.js';
import { audit } from '../security/access.js';

export const SHIELD_MAX = 2;
export const SHIELD_EVERY = 4;
export const VALID_PCT = 50;
const LOW_PCT = 50;
const HIGH_PCT = 150;

export const weekStartOf = (date) => addDays(date, -weekdayMon0(date));
const roundHalfHour = (min) => Math.round(min / 30) * 30;
const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

/**
 * Avalia as semanas. Função pura (testável).
 * @param {{pactos: Array<{week_start,minutes,days,set_on}>, minutes: Map<string,{total:number,manual:number}>, pausedWeeks: Set<string>, today: string, lastWeek?: string}} input
 */
export function evaluatePacto({ pactos, minutes, pausedWeeks, today, lastWeek = null }) {
  const sorted = [...pactos].sort((a, b) => (a.week_start < b.week_start ? -1 : 1));
  const current = weekStartOf(today);
  if (!sorted.length) return { weeks: [], chama: 0, best_chama: 0, shields: 0, green_progress: 0, current_week: current };
  const byWeek = new Map(sorted.map((p) => [p.week_start, p]));
  const first = sorted[0].week_start;
  const end = lastWeek && lastWeek < current ? lastWeek : current;
  const weeks = [];
  let promised = null; let days = null;
  let chama = 0; let best = 0; let shields = 0; let green = 0;
  const shieldMonths = new Set();
  for (let w = first; w <= end; w = addDays(w, 7)) {
    const explicit = byWeek.get(w);
    const carried = !explicit;
    if (explicit) { promised = explicit.minutes; days = explicit.days; }
    const m = minutes.get(w) || { total: 0, manual: 0 };
    const pct = promised ? (m.total / 60 / promised) * 100 : 0;
    let state;
    if (pausedWeeks.has(w)) state = 'paused';
    else if (w === current) state = 'in_progress';
    else if (w === first && explicit && explicit.set_on > w) state = 'partial';
    else if (pct >= 100) state = 'green';
    else if (pct >= VALID_PCT) state = 'yellow';
    else state = 'red';

    if (state === 'green') {
      chama += 1; green += 1;
      if (green >= SHIELD_EVERY) { green = 0; if (shields < SHIELD_MAX) shields += 1; }
    } else if (state === 'yellow') {
      chama += 1;
    } else if (state === 'red') {
      const month = w.slice(0, 7);
      if (shields > 0 && !shieldMonths.has(month)) { shields -= 1; shieldMonths.add(month); state = 'shield'; }
      else chama = 0;
      green = 0;
    }
    best = Math.max(best, chama);
    weeks.push({
      week_start: w, week_end: addDays(w, 6), promised_minutes: promised, planned_days: days, carried,
      done_minutes: Math.round(m.total / 60), manual_minutes: Math.round(m.manual / 60),
      percent: Math.round(pct), state,
    });
  }
  return { weeks, chama, best_chama: best, shields, green_progress: green, current_week: current };
}

/** Sugere um pacto menor/maior com base nas duas últimas semanas encerradas (que contam). */
export function suggestPacto(weeks) {
  const done = weeks.filter((w) => ['green', 'yellow', 'red', 'shield'].includes(w.state)).slice(-2);
  if (done.length < 2) return null;
  const promised = done[1].promised_minutes;
  if (done.every((w) => w.percent < LOW_PCT)) {
    return { kind: 'lower', minutes: Math.max(60, roundHalfHour(promised * 0.7)), reason: 'Nas últimas 2 semanas você ficou abaixo de 50% do pacto.' };
  }
  if (done.every((w) => w.percent > HIGH_PCT)) {
    const avg = (done[0].done_minutes + done[1].done_minutes) / 2;
    return { kind: 'higher', minutes: Math.min(roundHalfHour(avg * 0.9), promised * 2), reason: 'Nas últimas 2 semanas você passou de 150% do pacto.' };
  }
  return null;
}

export async function loadInputs(d, studentId, tz) {
  const t = todayFn(tz);
  const pactos = (await d.all('SELECT week_start, minutes, days, set_on FROM pactos WHERE student_id = ? ORDER BY week_start', [studentId]))
    .map((p) => ({ ...p, week_start: dstr(p.week_start), set_on: dstr(p.set_on) }));
  const first = pactos[0]?.week_start;
  const minutes = new Map();
  if (first) {
    const rows = await d.all(
      `SELECT date, SUM(duration_seconds)::int AS total, COALESCE(SUM(CASE WHEN source = 'manual' THEN duration_seconds END), 0)::int AS manual
         FROM study_sessions WHERE student_id = ? AND voided_at IS NULL AND date >= ? GROUP BY date`, [studentId, first]);
    for (const r of rows) {
      const w = weekStartOf(dstr(r.date));
      const cur = minutes.get(w) || { total: 0, manual: 0 };
      minutes.set(w, { total: cur.total + r.total, manual: cur.manual + r.manual });
    }
  }
  const pausedWeeks = new Set();
  const pauses = await d.all('SELECT from_date, to_date FROM access_pauses WHERE student_id = ?', [studentId]);
  for (const p of pauses) {
    const a = dstr(p.from_date); const b = dstr(p.to_date) || t;
    for (let w = weekStartOf(a); w <= b; w = addDays(w, 7)) pausedWeeks.add(w);
  }
  // Semanas depois do fim do último acesso não entram (aluno sem acesso não "quebra" a Chama).
  const acc = await d.all("SELECT ends_on, kind FROM accesses WHERE student_id = ? AND status = 'active'", [studentId]);
  let lastWeek = null;
  if (acc.length && acc.every((a) => a.ends_on)) lastWeek = weekStartOf(acc.map((a) => dstr(a.ends_on)).sort().pop());
  return { pactos, minutes, pausedWeeks, today: t, lastWeek };
}

/** Mesma coisa que loadInputs, mas para vários alunos de uma vez (a Fila usa isto: sem uma consulta por aluno). */
export async function loadInputsMany(d, studentIds, tz) {
  const t = todayFn(tz);
  const out = new Map(studentIds.map((id) => [id, { pactos: [], minutes: new Map(), pausedWeeks: new Set(), today: t, lastWeek: null }]));
  if (!studentIds.length) return out;
  for (const p of await d.all('SELECT student_id, week_start, minutes, days, set_on FROM pactos WHERE student_id = ANY(?::uuid[]) ORDER BY week_start', [studentIds])) {
    out.get(p.student_id).pactos.push({ week_start: dstr(p.week_start), minutes: p.minutes, days: p.days, set_on: dstr(p.set_on) });
  }
  const firsts = Object.fromEntries([...out].filter(([, v]) => v.pactos.length).map(([id, v]) => [id, v.pactos[0].week_start]));
  const rows = await d.all(
    `SELECT s.student_id, s.date, SUM(s.duration_seconds)::int AS total, COALESCE(SUM(CASE WHEN s.source = 'manual' THEN s.duration_seconds END), 0)::int AS manual
       FROM study_sessions s WHERE s.student_id = ANY(?::uuid[]) AND s.voided_at IS NULL GROUP BY s.student_id, s.date`, [studentIds]);
  for (const r of rows) {
    const v = out.get(r.student_id); const first = firsts[r.student_id];
    if (!first || dstr(r.date) < first) continue;
    const w = weekStartOf(dstr(r.date));
    const cur = v.minutes.get(w) || { total: 0, manual: 0 };
    v.minutes.set(w, { total: cur.total + r.total, manual: cur.manual + r.manual });
  }
  for (const p of await d.all('SELECT student_id, from_date, to_date FROM access_pauses WHERE student_id = ANY(?::uuid[])', [studentIds])) {
    const v = out.get(p.student_id); const a = dstr(p.from_date); const b = dstr(p.to_date) || t;
    for (let w = weekStartOf(a); w <= b; w = addDays(w, 7)) v.pausedWeeks.add(w);
  }
  const ends = new Map();
  for (const a of await d.all("SELECT student_id, ends_on FROM accesses WHERE student_id = ANY(?::uuid[]) AND status = 'active'", [studentIds])) {
    const e = ends.get(a.student_id) || { all: true, max: null };
    if (!a.ends_on) e.all = false; else if (!e.max || dstr(a.ends_on) > e.max) e.max = dstr(a.ends_on);
    ends.set(a.student_id, e);
  }
  for (const [id, e] of ends) if (e.all && e.max) out.get(id).lastWeek = weekStartOf(e.max);
  return out;
}

const PHRASES = {
  start: 'Defina seu pacto da semana: ele guia o seu ritmo, sem cobrança de ninguém além de você.',
  flame: 'Cada semana conta. Mantenha a Chama acesa!',
  shield: 'Um Escudo protege a sua Chama quando uma semana sai do planejado. Siga no ritmo!',
  rebuild: 'Recomeçar faz parte. O que importa é a próxima semana.',
};

function monthOf(date) { return date.slice(0, 7); }

/** Visão do aluno: semana atual, mês colorido, Chama, Escudos, sugestão e lembretes. */
export async function pactoOverview(d, ctx, studentId, { month } = {}) {
  const tz = (await d.one('SELECT u.timezone FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [studentId]))?.timezone || ctx.tz;
  const input = await loadInputs(d, studentId, tz);
  const ev = evaluatePacto(input);
  const t = input.today;
  const cur = weekStartOf(t);
  const next = addDays(cur, 7);
  const explicitCur = input.pactos.find((p) => p.week_start === cur);
  const explicitNext = input.pactos.find((p) => p.week_start === next);
  const editableCurrent = weekdayMon0(t) <= 2; // seg, ter, qua (até 23h59)
  const lockAt = addDays(cur, 2);
  const curWeek = ev.weeks.find((w) => w.week_start === cur) || null;
  const m = month || monthOf(t);
  const shown = ev.weeks.filter((w) => monthOf(w.week_start) === m || monthOf(w.week_end) === m);
  const suggestion = suggestPacto(ev.weeks.filter((w) => w.week_start < cur));
  const reminders = [];
  if (!explicitCur && editableCurrent) reminders.push({ kind: 'define', text: input.pactos.length ? 'Seu pacto desta semana repete o da anterior. Quer ajustar? Você pode alterar até quarta, 23h59.' : 'Defina seu pacto de estudo da semana.' });
  if (editableCurrent && weekdayMon0(t) === 2 && explicitCur) reminders.push({ kind: 'lock', text: 'Hoje é o último dia para alterar o pacto desta semana.' });
  const promised = curWeek?.promised_minutes ?? explicitNext?.minutes ?? null;
  let phrase = PHRASES.start;
  if (ev.chama > 0) phrase = ev.shields > 0 ? PHRASES.shield : PHRASES.flame;
  else if (input.pactos.length) phrase = PHRASES.rebuild;
  return {
    today: t, tz, current_week: cur, next_week: next, month: m,
    has_pacto: input.pactos.length > 0,
    current: curWeek ? { ...curWeek, explicit: !!explicitCur } : null,
    next: explicitNext ? { week_start: next, minutes: explicitNext.minutes, days: explicitNext.days } : null,
    editable: { current: editableCurrent, next: true, locks_after: lockAt },
    default_minutes: promised,
    weeks: shown,
    chama: ev.chama, best_chama: ev.best_chama, shields: ev.shields, shields_max: SHIELD_MAX, green_progress: ev.green_progress, green_target: SHIELD_EVERY,
    suggestion, reminders, phrase,
  };
}

export async function setPacto(d, ctx, studentId, { week, minutes, days }) {
  const tz = (await d.one('SELECT u.timezone FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [studentId]))?.timezone || ctx.tz;
  const t = todayFn(tz);
  const cur = weekStartOf(t);
  const target = week === 'next' ? addDays(cur, 7) : cur;
  if (week !== 'next' && weekdayMon0(t) > 2) throw badRequest('O pacto desta semana está travado (podia ser alterado até quarta, 23h59). Defina o da próxima semana.', 'pacto_locked');
  const min = Number(minutes);
  if (!Number.isInteger(min) || min < 30 || min > 6000 || min % 30 !== 0) throw badRequest('Informe as horas da semana de 30 em 30 minutos (mínimo 30 min).');
  const mask = Array.isArray(days) ? days.reduce((a, x) => a | (1 << Number(x)), 0) : Number(days);
  if (!Number.isInteger(mask) || mask < 1 || mask > 127) throw badRequest('Escolha pelo menos um dia da semana.');
  const prev = await d.one('SELECT minutes, days FROM pactos WHERE student_id = ? AND week_start = ?', [studentId, target]);
  const tenant = (await d.one('SELECT tenant_id FROM students WHERE id = ?', [studentId])).tenant_id;
  await d.run(
    `INSERT INTO pactos (tenant_id, student_id, week_start, minutes, days, set_on, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT (student_id, week_start) DO UPDATE SET minutes = EXCLUDED.minutes, days = EXCLUDED.days, updated_at = EXCLUDED.updated_at`,
    [tenant, studentId, target, min, mask, t, nowIso(), nowIso()]);
  await audit(d, ctx, 'pacto.set', { targetType: 'student', targetId: studentId, payload: { week_start: target, minutes: { anterior: prev?.minutes ?? null, novo: min }, days_mask: mask } });
  return { week_start: target, minutes: min, days: mask };
}

export { daysBetween };
