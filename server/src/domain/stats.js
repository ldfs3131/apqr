/**
 * Estatísticas por matrícula (aluno × edital). Tudo vem dos registros reais (sessões, revisões,
 * questões, produção, eventos), ignorando registros anulados. Nada é estimado.
 *
 *  - Percentual de acertos = acertos ÷ questões (ponderado por questões), nunca média de percentuais.
 *  - Progresso APQR = média dos pesos por conteúdo (🔴0 🟧25 🟡50 🟢75 🟩100).
 *  - "Último %" = revisão válida mais recente; "Média %" = todas as revisões válidas do conteúdo.
 */
import { STATUSES, STATUS_WEIGHT } from './apqr.js';
import { getSettings } from './settings.js';
import { addDays, daysBetween, pct, round1, today } from '../lib/util.js';

export const emptyCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));
export function progressFromCounts(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return round1(STATUSES.reduce((acc, s) => acc + counts[s] * STATUS_WEIGHT[s], 0) / total);
}

function period(from, to, col = 'date') {
  const parts = [];
  const params = [];
  if (from) { parts.push(`${col} >= ?`); params.push(from); }
  if (to) { parts.push(`${col} <= ?`); params.push(to); }
  return { sql: parts.length ? ` AND ${parts.join(' AND ')}` : '', params };
}

/** Uma linha por conteúdo ativo do edital, com estado APQR do aluno e indicadores. */
export async function topicRows(d, enrollment, settings = null) {
  const s = settings || (await getSettings(d, enrollment.tenant_id));
  const extra = !!(await d.one('SELECT extra_reviews_allowed FROM students WHERE id = ?', [enrollment.student_id]))?.extra_reviews_allowed;
  const topics = await d.all(
    `SELECT t.id, t.name, t.subject_id, t.position, sb.name AS subject_name, sb.position AS subject_position,
            sb.priority AS plan_priority, sb.relevance AS plan_relevance,
            p.id AS progress_id, COALESCE(p.status, 'not_started') AS status, p.started_at, p.material_done_at, p.review_started_at,
            p.consolidated_at, COALESCE(p.current_cycle, 1) AS current_cycle, p.cycle_locked_at, COALESCE(p.material_updates, 0) AS material_updates
       FROM topics t JOIN subjects sb ON sb.id = t.subject_id
       LEFT JOIN topic_progress p ON p.topic_id = t.id AND p.enrollment_id = ?
      WHERE t.edital_id = ? AND t.archived_at IS NULL AND sb.archived_at IS NULL
      ORDER BY sb.position, sb.created_at, t.position, t.created_at`,
    [enrollment.id, enrollment.edital_id]
  );
  const reviews = await d.all('SELECT * FROM reviews WHERE enrollment_id = ? AND voided_at IS NULL ORDER BY topic_id, cycle, number', [enrollment.id]);
  const hours = await d.all('SELECT topic_id, sum(duration_seconds) AS secs, count(*) AS n, max(date) AS last_date FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY topic_id', [enrollment.id]);
  const practice = await d.all(`SELECT topic_id, sum(questions) AS q, sum(correct) AS c FROM question_logs WHERE enrollment_id = ? AND source = 'practice' AND voided_at IS NULL GROUP BY topic_id`, [enrollment.id]);
  const prods = await d.all('SELECT topic_id, count(*) AS n, max(date) AS last_date FROM production_logs WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY topic_id', [enrollment.id]);
  const byTopic = new Map();
  for (const r of reviews) {
    if (!byTopic.has(r.topic_id)) byTopic.set(r.topic_id, []);
    byTopic.get(r.topic_id).push({ ...r, percent: pct(r.correct, r.questions) });
  }
  const hMap = new Map(hours.map((h) => [h.topic_id, h]));
  const pMap = new Map(practice.map((p) => [p.topic_id, p]));
  const prMap = new Map(prods.map((p) => [p.topic_id, p]));
  return topics.map((t) => {
    const all = byTopic.get(t.id) || [];
    const current = all.filter((r) => r.cycle === t.current_cycle);
    const last = all[all.length - 1] || null;
    const q = all.reduce((a, r) => a + r.questions, 0);
    const c = all.reduce((a, r) => a + r.correct, 0);
    const h = hMap.get(t.id);
    const p = pMap.get(t.id);
    const pr = prMap.get(t.id);
    const locked = !!t.cycle_locked_at;
    const canReview = t.status === 'review' && !locked && (current.length < s.max_reviews_per_cycle || extra);
    // Com revisões extras liberadas, o próximo espaço (R5, R6…) também aparece.
    const slotsN = Math.max(s.max_reviews_per_cycle, current.length + (canReview ? 1 : 0));
    const slots = Array.from({ length: slotsN }, (_, i) => {
      const r = current.find((x) => x.number === i + 1);
      return r ? { number: r.number, percent: r.percent, questions: r.questions, correct: r.correct, date: r.date, consolidated: r.consolidated, extra: r.extra, config_version: r.config_version } : null;
    });
    return {
      id: t.id, name: t.name, subject_id: t.subject_id, subject_name: t.subject_name, status: t.status,
      started_at: t.started_at, material_done_at: t.material_done_at, review_started_at: t.review_started_at, consolidated_at: t.consolidated_at,
      current_cycle: t.current_cycle, cycle_locked: locked, material_updates: t.material_updates,
      plan_priority: t.plan_priority, plan_relevance: t.plan_relevance,
      reviews: slots, reviews_in_cycle: current.length, total_reviews: all.length,
      next_review_number: canReview ? current.length + 1 : null,
      extra_reviews_allowed: extra,
      last_percent: last ? last.percent : null, last_review_date: last ? last.date : null,
      avg_percent: q ? pct(c, q) : null, best_percent: all.length ? Math.max(...all.map((r) => r.percent)) : null,
      review_questions: q, review_correct: c, practice_questions: p?.q || 0, practice_correct: p?.c || 0,
      study_seconds: h?.secs || 0, sessions_count: h?.n || 0, last_study_date: h?.last_date || null,
      productions: pr?.n || 0, last_production_date: pr?.last_date || null,
    };
  });
}

/** Sequência de dias consecutivos com atividade terminando hoje (ou ontem). */
export function streak(dates, tz) {
  const set = new Set(dates);
  let day = today(tz);
  if (!set.has(day)) day = addDays(day, -1);
  let n = 0;
  while (set.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export async function summary(d, enrollment, { from, to, rows = null, settings = null } = {}) {
  const tz = enrollment.student_tz;
  const r = rows || (await topicRows(d, enrollment, settings));
  const counts = emptyCounts();
  for (const x of r) counts[x.status]++;
  const p = period(from, to);
  const hours = await d.one(`SELECT COALESCE(sum(duration_seconds), 0) AS secs, count(*) AS n FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL${p.sql}`, [enrollment.id, ...p.params]);
  const days = (await d.all(`SELECT date FROM daily_activity WHERE enrollment_id = ?${p.sql} AND (study_seconds > 0 OR questions > 0 OR productions > 0) ORDER BY date`, [enrollment.id, ...p.params])).map((x) => x.date);
  const qs = await d.one(`SELECT COALESCE(sum(questions), 0) AS q, COALESCE(sum(correct), 0) AS c FROM question_logs WHERE enrollment_id = ? AND voided_at IS NULL${p.sql}`, [enrollment.id, ...p.params]);
  const prods = await d.one(`SELECT count(*) AS n FROM production_logs WHERE enrollment_id = ? AND voided_at IS NULL${p.sql}`, [enrollment.id, ...p.params]);
  const allDays = (await d.all('SELECT date FROM daily_activity WHERE enrollment_id = ? ORDER BY date', [enrollment.id])).map((x) => x.date);
  const t = today(tz);
  const spanStart = from || allDays[0] || null;
  const spanDays = spanStart ? daysBetween(spanStart, to && to < t ? to : t) + 1 : 0;
  return {
    edital: { id: enrollment.edital_id, name: enrollment.edital_name, role_title: enrollment.role_title, board: enrollment.board, exam_date: enrollment.exam_date },
    days_to_exam: enrollment.exam_date ? daysBetween(t, enrollment.exam_date) : null,
    total_topics: r.length, counts,
    locked_topics: r.filter((x) => x.cycle_locked).length,
    reviews_available: r.filter((x) => x.next_review_number).length,
    apqr_progress: progressFromCounts(counts),
    consolidated_percent: r.length ? round1((counts.consolidated / r.length) * 100) : 0,
    study_seconds: hours.secs, sessions_count: hours.n, study_days: days.length,
    avg_seconds_per_study_day: days.length ? Math.round(hours.secs / days.length) : 0,
    avg_seconds_per_calendar_day: spanDays > 0 ? Math.round(hours.secs / spanDays) : 0,
    span_days: spanDays, questions: qs.q, correct: qs.c, wrong: qs.q - qs.c, accuracy: pct(qs.c, qs.q),
    productions: prods.n, streak: streak(allDays, tz), last_activity: allDays[allDays.length - 1] || null,
    period: { from: from || null, to: to || null },
  };
}

export async function dailySeries(d, enrollmentId, from, to) {
  const rows = await d.all('SELECT * FROM daily_activity WHERE enrollment_id = ? AND date >= ? AND date <= ?', [enrollmentId, from, to]);
  const map = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let day = from; day <= to && out.length <= 800; day = addDays(day, 1)) {
    const r = map.get(day);
    out.push({ date: day, seconds: r?.study_seconds || 0, sessions: r?.sessions_count || 0, questions: r?.questions || 0, correct: r?.correct || 0, productions: r?.productions || 0, accuracy: r?.questions ? pct(r.correct, r.questions) : null });
  }
  return out;
}

/** Estado de cada conteúdo reconstruído a partir dos eventos, ao fim de cada dia. */
export async function apqrProgressSeries(d, enrollment, from, to) {
  const topics = (await d.all('SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.edital_id = ? AND t.archived_at IS NULL AND s.archived_at IS NULL', [enrollment.edital_id])).map((r) => r.id);
  if (!topics.length) return [];
  const ids = new Set(topics);
  const events = (await d.all(
    `SELECT topic_id, to_status, date FROM learning_events
      WHERE enrollment_id = ? AND to_status IS NOT NULL AND type IN ('status_change','consolidated','correction','review_undone')
      ORDER BY date, created_at`,
    [enrollment.id]
  )).filter((e) => ids.has(e.topic_id));
  const state = new Map(topics.map((id) => [id, 'not_started']));
  const out = [];
  let i = 0;
  for (; i < events.length && events[i].date < from; i++) state.set(events[i].topic_id, events[i].to_status);
  for (let day = from; day <= to && out.length <= 800; day = addDays(day, 1)) {
    for (; i < events.length && events[i].date <= day; i++) state.set(events[i].topic_id, events[i].to_status);
    const counts = emptyCounts();
    for (const st of state.values()) counts[st]++;
    out.push({ date: day, progress: progressFromCounts(counts), consolidated: counts.consolidated, ...counts });
  }
  return out;
}

export async function subjectBreakdown(d, enrollment, { from, to, rows = null } = {}) {
  const r = rows || (await topicRows(d, enrollment));
  const subjects = await d.all('SELECT id, name, position, priority AS plan_priority, relevance AS plan_relevance FROM subjects WHERE edital_id = ? AND archived_at IS NULL ORDER BY position, created_at', [enrollment.edital_id]);
  const p = period(from, to, 'x.date');
  const hours = new Map((await d.all(`SELECT t.subject_id, sum(x.duration_seconds) AS secs FROM study_sessions x JOIN topics t ON t.id = x.topic_id WHERE x.enrollment_id = ? AND x.voided_at IS NULL${p.sql} GROUP BY t.subject_id`, [enrollment.id, ...p.params])).map((x) => [x.subject_id, x.secs]));
  const qs = new Map((await d.all(`SELECT COALESCE(t.subject_id, x.subject_id) AS subject_id, sum(x.questions) AS q, sum(x.correct) AS c FROM question_logs x LEFT JOIN topics t ON t.id = x.topic_id WHERE x.enrollment_id = ? AND x.voided_at IS NULL${p.sql} AND COALESCE(t.subject_id, x.subject_id) IS NOT NULL GROUP BY COALESCE(t.subject_id, x.subject_id)`, [enrollment.id, ...p.params])).map((x) => [x.subject_id, x]));
  return subjects.map((s) => {
    const ts = r.filter((x) => x.subject_id === s.id);
    const counts = emptyCounts();
    for (const x of ts) counts[x.status]++;
    const q = qs.get(s.id);
    return {
      ...s, total_topics: ts.length, counts, locked_topics: ts.filter((x) => x.cycle_locked).length,
      apqr_progress: progressFromCounts(counts), consolidated_percent: ts.length ? round1((counts.consolidated / ts.length) * 100) : 0,
      study_seconds: hours.get(s.id) || 0, questions: q?.q || 0, correct: q?.c || 0, accuracy: q ? pct(q.c, q.q) : null,
    };
  });
}

/** ⚖️ Equilíbrio entre matérias (±15 p.p. em torno da média; linguagem não punitiva). */
export async function balance(d, enrollment, opts = {}) {
  const subjects = (await subjectBreakdown(d, enrollment, opts)).filter((s) => s.total_topics > 0);
  if (!subjects.length) return { average_progress: 0, spread: 0, subjects: [], concentrated: false };
  const avg = round1(subjects.reduce((a, s) => a + s.apqr_progress, 0) / subjects.length);
  const max = Math.max(...subjects.map((s) => s.apqr_progress));
  const min = Math.min(...subjects.map((s) => s.apqr_progress));
  const totalSecs = subjects.reduce((a, s) => a + s.study_seconds, 0);
  const BAND = 15;
  return {
    average_progress: avg, spread: round1(max - min), concentrated: max - min >= 40,
    subjects: subjects.map((s) => {
      let group = 'intermediaria';
      if (max - min >= 10) {
        if (s.apqr_progress >= avg + BAND || (s.apqr_progress === max && max - avg >= BAND / 2)) group = 'avancada';
        else if (s.apqr_progress <= avg - BAND || (s.apqr_progress === min && avg - min >= BAND / 2)) group = 'atrasada';
      }
      return { ...s, group, hours_share: totalSecs ? round1((s.study_seconds / totalSecs) * 100) : 0 };
    }),
  };
}

export async function reviewEvolution(d, enrollmentId) {
  const rows = await d.all('SELECT number, sum(questions) AS q, sum(correct) AS c, count(*) AS n, sum(CASE WHEN consolidated THEN 1 ELSE 0 END) AS cons FROM reviews WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY number ORDER BY number', [enrollmentId]);
  return rows.map((r) => ({ number: r.number, label: `Q/R-${r.number}`, reviews: r.n, questions: r.q, accuracy: pct(r.c, r.q), consolidated: r.cons }));
}

/** Desempenho por conteúdo (do próprio aluno): avaliados pelo MENOR % atual; sem avaliação separados. */
export function topicPerformance(rows) {
  const evaluated = rows.filter((r) => r.last_percent != null)
    .sort((a, b) => a.last_percent - b.last_percent || (a.avg_percent ?? 0) - (b.avg_percent ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
  return { evaluated, unevaluated: rows.filter((r) => r.last_percent == null) };
}

export async function topicHistory(d, enrollmentId, topicId) {
  return d.all(
    `SELECT h.*, h.type AS event_type, u.name AS actor_name, u.role AS actor_role FROM learning_events h LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.enrollment_id = ? AND h.topic_id = ? ORDER BY h.date, h.created_at`,
    [enrollmentId, topicId]
  );
}

export async function enrollmentHistory(d, enrollmentId, { limit = 200, from, to } = {}) {
  const p = period(from, to, 'h.date');
  return d.all(
    `SELECT h.*, h.type AS event_type, t.name AS topic_name, s.name AS subject_name, u.name AS actor_name, u.role AS actor_role
       FROM learning_events h LEFT JOIN topics t ON t.id = h.topic_id LEFT JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.enrollment_id = ?${p.sql} ORDER BY h.date DESC, h.created_at DESC LIMIT ?`,
    [enrollmentId, ...p.params, Math.min(limit, 1000)]
  );
}

export async function hoursByPeriod(d, enrollmentId) {
  const byMonth = await d.all(`SELECT to_char(date, 'YYYY-MM') AS month, sum(duration_seconds) AS secs, count(DISTINCT date) AS days FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY 1 ORDER BY 1`, [enrollmentId]);
  const byWeek = await d.all(`SELECT to_char(date_trunc('week', date), 'YYYY-MM-DD') AS week_start, sum(duration_seconds) AS secs, count(DISTINCT date) AS days FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL GROUP BY 1 ORDER BY 1`, [enrollmentId]);
  return { by_month: byMonth, by_week: byWeek };
}
