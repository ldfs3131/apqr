/**
 * Ajuste de Rota: retrato quinzenal do aluno, gerado por regras do método (catálogo fechado, SEM inteligência artificial).
 *  - Quinzena = 15 dias seguidos a partir da matrícula; o retrato fica pronto quando a quinzena termina e é gravado (não muda depois).
 *  - Blocos: placar, edital em cores, questões por matéria (com regra de credibilidade), revisões, conquista, até 3 ajustes.
 *  - Nunca mostra: previsão de aprovação, ranking, comparação com colegas, melhor horário ou caderno de erros.
 *  - "Aceitar ajustes" aplica o ajuste de horas no Pacto da próxima semana.
 */
import { addDays, badRequest, forbidden, daysBetween, notFound, nowIso, round1, today as todayFn } from '../lib/util.js';
import { audit } from '../security/access.js';
import { getConfig } from './consultoria.js';
import { evaluatePacto, loadInputs, setPacto, weekStartOf } from './pacto.js';
import { BACKLOG_DAYS } from './indicators.js';

export const PERIOD_DAYS = 15;
const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v || null);
const roundHalf = (m) => Math.round(m / 30) * 30;
const fmtH = (secs) => `${round1(secs / 3600).toLocaleString('pt-BR')} h`;
const STATUS_LABEL = { assimilation: 'para laranja', production: 'para amarelo', review: 'para verde', consolidated: 'consolidado' };

/** Quinzena concluída mais recente da matrícula (ou null se a primeira ainda não fechou). */
export function periodFor(enrollmentCreated, today, tz = 'America/Sao_Paulo') {
  const raw = enrollmentCreated instanceof Date ? enrollmentCreated.toISOString() : String(enrollmentCreated);
  const anchor = /T/.test(raw) ? new Date(raw).toLocaleDateString('en-CA', { timeZone: tz }) : raw.slice(0, 10);   // dia da matrícula no fuso do aluno
  const elapsed = daysBetween(anchor, today);
  const idx = Math.floor(elapsed / PERIOD_DAYS) - 1;           // último período completo
  if (idx < 0) return { ready: false, ready_on: addDays(anchor, PERIOD_DAYS), days_left: PERIOD_DAYS - elapsed };
  const from = addDays(anchor, idx * PERIOD_DAYS);
  return { ready: true, from, to: addDays(from, PERIOD_DAYS - 1), index: idx };
}

async function studyIn(d, studentId, from, to) {
  const r = await d.one('SELECT COALESCE(sum(duration_seconds),0)::int AS secs, count(DISTINCT date)::int AS days, count(*) FILTER (WHERE source = \'timer\')::int AS timer FROM study_sessions WHERE student_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?', [studentId, from, to]);
  return r;
}

function promisedIn(pactoWeeks, from, to) {
  let total = 0;
  for (const w of pactoWeeks) {
    const a = w.week_start > from ? w.week_start : from;
    const b = w.week_end < to ? w.week_end : to;
    if (b >= a) total += (w.promised_minutes * (daysBetween(a, b) + 1)) / 7;
  }
  return Math.round(total);
}

export async function buildFacts(d, ctx, enrollment, from, to, cfg) {
  const studentId = enrollment.student_id;
  const min = cfg.credibility.subject_accuracy_min;
  const prevFrom = addDays(from, -PERIOD_DAYS); const prevTo = addDays(from, -1);
  const cur = await studyIn(d, studentId, from, to);
  const prev = await studyIn(d, studentId, prevFrom, prevTo);
  const input = await loadInputs(d, studentId, enrollment.student_tz || ctx.tz);
  const ev = evaluatePacto(input);
  const promised = promisedIn(ev.weeks, from, to);
  const doneMin = Math.round(cur.secs / 60);
  const enough = cur.days >= cfg.credibility.route_min_days && cur.secs >= cfg.credibility.route_min_hours * 3600;
  // Porcentagem e variação só aparecem com dados suficientes (regra de credibilidade).
  const placar = {
    done_seconds: cur.secs, promised_minutes: promised, pct: enough && promised ? Math.round((doneMin / promised) * 100) : null,
    delta_pct: enough && prev.secs >= 3600 ? Math.round(((cur.secs - prev.secs) / prev.secs) * 100) : null, study_days: cur.days, has_pacto: promised > 0,
  };
  const ch = await d.all("SELECT to_status AS status, count(*)::int AS n FROM learning_events WHERE enrollment_id = ? AND type IN ('status_change','consolidated') AND date >= ? AND date <= ? AND to_status IN ('assimilation','production','review','consolidated') GROUP BY to_status", [enrollment.id, from, to]);
  const cm = Object.fromEntries(ch.map((r) => [r.status, r.n]));
  // 'consolidated' pode ser registrado como status_change e como evento próprio: conta uma vez por tópico.
  const consolidatedTopics = (await d.one("SELECT count(DISTINCT topic_id)::int AS n FROM learning_events WHERE enrollment_id = ? AND to_status = 'consolidated' AND date >= ? AND date <= ?", [enrollment.id, from, to])).n;
  const colors = { assimilation: cm.assimilation || 0, production: cm.production || 0, review: cm.review || 0, consolidated: consolidatedTopics };
  const colorsTotal = Object.values(colors).reduce((a, b) => a + b, 0);
  const subj = await d.all(
    `SELECT s.name AS subject, sum(x.questions)::int AS q, sum(x.correct)::int AS c
       FROM question_logs x LEFT JOIN topics t ON t.id = x.topic_id JOIN subjects s ON s.id = COALESCE(t.subject_id, x.subject_id)
      WHERE x.enrollment_id = ? AND x.voided_at IS NULL AND x.date >= ? AND x.date <= ? GROUP BY s.name ORDER BY q DESC`, [enrollment.id, from, to]);
  const subjects = subj.map((r) => {
    const level = r.q < min ? 'insuficiente' : r.q < min * 2 ? 'inicial' : 'confiavel';
    return { subject: r.subject, questions: r.q, accuracy: level === 'insuficiente' ? null : round1((r.c / r.q) * 100), level, missing: level === 'insuficiente' ? min - r.q : 0 };
  });
  const questionsTotal = subj.reduce((a, r) => a + r.q, 0);
  const rev = await d.one('SELECT count(*)::int AS n, count(*) FILTER (WHERE consolidated)::int AS cons FROM reviews WHERE enrollment_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?', [enrollment.id, from, to]);
  const backlog = (await d.one("SELECT count(*)::int AS n FROM topic_progress p LEFT JOIN (SELECT progress_id, max(date) AS last FROM reviews WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY progress_id) lr ON lr.progress_id = p.id WHERE p.enrollment_id = ? AND p.status = 'review' AND p.cycle_locked_at IS NULL AND COALESCE(lr.last, p.review_started_at) <= ?", [enrollment.id, enrollment.id, addDays(to, -BACKLOG_DAYS)])).n;
  const periodWeeks = ev.weeks.filter((w) => w.week_end >= from && w.week_start <= to && ['green', 'yellow', 'red', 'shield'].includes(w.state));
  const hoursBySubject = await d.all('SELECT s.name AS subject, sum(x.duration_seconds)::int AS secs FROM study_sessions x JOIN topics t ON t.id = x.topic_id JOIN subjects s ON s.id = t.subject_id WHERE x.enrollment_id = ? AND x.voided_at IS NULL AND x.date >= ? AND x.date <= ? GROUP BY s.name', [enrollment.id, from, to]);
  return {
    period: { from, to }, enough_data: enough, min_days: cfg.credibility.route_min_days, min_hours: cfg.credibility.route_min_hours, min_questions: min,
    placar, colors, colors_total: colorsTotal, questions: { total: questionsTotal, subjects },
    reviews: { consolidated: consolidatedTopics, done: rev.n, backlog },
    pacto: { weeks: periodWeeks.map((w) => ({ week_start: w.week_start, state: w.state, percent: w.percent, promised_minutes: w.promised_minutes, done_minutes: w.done_minutes })), chama: ev.chama, shields: ev.shields },
    hours_by_subject: hoursBySubject,
  };
}

/** Catálogo fechado de ajustes, em ordem de prioridade. Máximo de 3. Cada ajuste mostra a base do número. */
export function suggest(f) {
  if (!f.enough_data) return [];
  const out = [];
  const rel = f.questions.subjects.filter((s) => s.level !== 'insuficiente');
  const worst = [...rel].sort((a, b) => a.accuracy - b.accuracy)[0];
  if (worst && worst.accuracy < 50) out.push({ code: 'review_before_practice', icon: 'target', title: 'Revise antes de praticar', text: `${worst.subject} teve o menor acerto da quinzena. Revise a assimilação antes de treinar questões.`, base: `Base: ${worst.accuracy.toLocaleString('pt-BR')}% com ${worst.questions} questões.` });
  const reinforce = [...rel].filter((s) => s.accuracy >= 50 && s.accuracy < 70).sort((a, b) => a.accuracy - b.accuracy)[0];
  if (reinforce) out.push({ code: 'reinforce_subject', icon: 'book', title: `Reforce ${reinforce.subject}`, text: `Seu acerto em ${reinforce.subject} está em ${reinforce.accuracy.toLocaleString('pt-BR')}%. Reforce questões nessa matéria.`, base: `Base: ${reinforce.accuracy.toLocaleString('pt-BR')}% com ${reinforce.questions} questões.` });
  const wk = f.pacto.weeks.slice(-2);
  const below = wk.filter((w) => w.percent < 50);          // mesma régua do Pacto: a semana vale com 50%
  if (below.length && wk.length) {
    const promised = wk[wk.length - 1].promised_minutes;
    const avg = wk.reduce((a, w) => a + w.done_minutes, 0) / wk.length;
    const minutes = Math.max(60, Math.min(roundHalf(Math.max(avg, promised * 0.8)), promised - 30));
    if (minutes > 0 && minutes < promised) out.push({ code: 'pacto_lower', icon: 'clock', title: `Fixe um pacto de ${(minutes / 60).toLocaleString('pt-BR')} h`, text: `Você ficou abaixo de 50% do pacto em ${below.length} ${wk.length === 1 ? 'semana' : `das ${wk.length} semanas`}. Um pacto um pouco menor ajuda a manter o ritmo.`, base: `Base: ${below.length} de ${wk.length} semanas abaixo de 50%.`, apply: { type: 'pacto', minutes } });
  } else if (wk.length === 2 && wk.every((w) => w.percent > 150)) {
    const avg = wk.reduce((a, w) => a + w.done_minutes, 0) / 2;
    const minutes = Math.min(roundHalf(avg * 0.9), wk[1].promised_minutes * 2);
    out.push({ code: 'pacto_higher', icon: 'clock', title: `Suba o pacto para ${(minutes / 60).toLocaleString('pt-BR')} h`, text: 'Você passou muito do pacto nas duas últimas semanas. Um pacto maior combina com o seu ritmo.', base: 'Base: 2 de 2 semanas acima de 150%.', apply: { type: 'pacto', minutes } });
  }
  if (f.reviews.backlog > 0) out.push({ code: 'do_reviews', icon: 'book', title: 'Faça as revisões pendentes', text: `Você tem ${f.reviews.backlog} ${f.reviews.backlog === 1 ? 'conteúdo' : 'conteúdos'} em Q/R sem revisão há mais de ${BACKLOG_DAYS} dias.`, base: `Base: ${f.reviews.backlog} conteúdos parados.` });
  if (f.placar.done_seconds >= 10 * 3600 && f.questions.total === 0) out.push({ code: 'start_questions', icon: 'target', title: 'Comece a resolver questões', text: 'Você estudou bastante e ainda não lançou questões. Passe para Q/R nos conteúdos com material pronto.', base: `Base: ${fmtH(f.placar.done_seconds)} de estudo e nenhuma questão.` });
  if (f.hours_by_subject.length >= 2) {
    const total = f.hours_by_subject.reduce((a, r) => a + r.secs, 0);
    const top = [...f.hours_by_subject].sort((a, b) => b.secs - a.secs)[0];
    if (total >= 5 * 3600 && top.secs / total >= 0.75) out.push({ code: 'balance', icon: 'layers', title: 'Equilibre as matérias', text: `${Math.round((top.secs / total) * 100)}% das horas foram em ${top.subject}. Reserve um tempo para as outras matérias do edital.`, base: `Base: ${fmtH(top.secs)} de ${fmtH(total)}.` });
  }
  if (!out.length) out.push({ code: 'keep_going', icon: 'trophy', title: 'Mantenha o ritmo', text: 'Seu ritmo está bom. Continue com o pacto e as revisões em dia.', base: `Base: ${f.placar.study_days} dias de estudo na quinzena.` });
  return out.slice(0, 3);
}

/** Frase de conquista (sempre positiva e baseada em fato). */
export function achievement(f) {
  const wk = f.pacto.weeks;
  let streak = 0;
  for (let i = wk.length - 1; i >= 0 && wk[i].percent >= 100; i--) streak++;
  if (streak >= 2) return `Você bateu o pacto ${streak} semanas seguidas.`;
  if (f.reviews.consolidated >= 1) return `Você consolidou ${f.reviews.consolidated} ${f.reviews.consolidated === 1 ? 'tópico' : 'tópicos'} nesta quinzena.`;
  if (f.pacto.chama >= 2) return `Sua Chama está acesa há ${f.pacto.chama} semanas.`;
  if (f.placar.study_days >= 5) return `Você estudou em ${f.placar.study_days} dias da quinzena.`;
  if (f.questions.total >= 1) return `Você resolveu ${f.questions.total} questões nesta quinzena.`;
  return 'Cada quinzena é um recomeço. O importante é voltar a estudar.';
}

/** Retrato da quinzena concluída (criado na primeira abertura e gravado). */
export async function routeFor(d, ctx, enrollment) {
  const cfg = await getConfig(d, ctx.tenantId);
  if (!cfg.route_adjust_enabled) return { enabled: false };
  const tz = enrollment.student_tz || ctx.tz;
  const t = todayFn(tz);
  const per = periodFor(enrollment.created_at, t, tz);
  if (!per.ready) return { enabled: true, ready: false, ready_on: per.ready_on, days_left: per.days_left };
  let row = await d.one('SELECT * FROM route_adjustments WHERE enrollment_id = ? AND period_from = ?', [enrollment.id, per.from]);
  if (!row) {
    const facts = await buildFacts(d, ctx, enrollment, per.from, per.to, cfg);
    const suggestions = suggest(facts);
    if (ctx.role !== 'student') {                      // a equipe só visualiza: nada é gravado fora da conta do aluno
      return { enabled: true, ready: true, id: null, preview: true, period: { from: per.from, to: per.to }, facts, achievement: achievement(facts), suggestions, accepted_at: null, next_on: addDays(per.from, PERIOD_DAYS * 2) };
    }
    row = await d.one('INSERT INTO route_adjustments (tenant_id, student_id, enrollment_id, period_from, period_to, facts, suggestions, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (enrollment_id, period_from) DO NOTHING RETURNING *', [enrollment.tenant_id, enrollment.student_id, enrollment.id, per.from, per.to, JSON.stringify(facts), JSON.stringify(suggestions), nowIso()]);
    if (!row) row = await d.one('SELECT * FROM route_adjustments WHERE enrollment_id = ? AND period_from = ?', [enrollment.id, per.from]);
  }
  const facts = row.facts;
  return { enabled: true, ready: true, id: row.id, period: { from: per.from, to: per.to }, facts, achievement: achievement(facts), suggestions: row.suggestions, accepted_at: row.accepted_at, next_on: addDays(per.from, PERIOD_DAYS * 2) };
}

export async function acceptRoute(d, ctx, enrollment, id) {
  if (ctx.role !== 'student') throw forbidden('Somente o aluno aceita os ajustes da própria rota.');
  const row = await d.one('SELECT * FROM route_adjustments WHERE id = ? AND enrollment_id = ?', [id, enrollment.id]);
  if (!row) throw notFound('Ajuste de Rota não encontrado.');
  if (row.accepted_at) throw badRequest('Você já aceitou estes ajustes.');
  const cur = periodFor(enrollment.created_at, todayFn(enrollment.student_tz || ctx.tz), enrollment.student_tz || ctx.tz);
  if (!cur.ready || dstr(row.period_from) !== cur.from) throw badRequest('Estes ajustes são de uma quinzena anterior. Abra o Ajuste de Rota atual.');
  const won = await d.one('UPDATE route_adjustments SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL RETURNING id', [nowIso(), id]);
  if (!won) throw badRequest('Você já aceitou estes ajustes.');
  const pact = row.suggestions.find((s) => s.apply?.type === 'pacto');
  let applied = null;
  if (pact) {
    const t = todayFn(enrollment.student_tz || ctx.tz);
    const nextWeek = weekStartOf(addDays(t, 7));
    const existing = await d.one('SELECT days FROM pactos WHERE student_id = ? AND week_start <= ? ORDER BY week_start DESC LIMIT 1', [enrollment.student_id, nextWeek]);
    await setPacto(d, ctx, enrollment.student_id, { week: 'next', minutes: pact.apply.minutes, days: existing?.days || 31 });
    applied = { minutes: pact.apply.minutes, week_start: nextWeek };
  }
  await audit(d, ctx, 'route.accept', { targetType: 'student', targetId: enrollment.student_id, payload: { route: id, applied } });
  return { accepted: true, applied };
}
