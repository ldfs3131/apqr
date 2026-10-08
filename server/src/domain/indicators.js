/**
 * Indicadores da turma, diagnósticos determinísticos e ranking por edital.
 *
 * Tudo aqui é CALCULADO a partir dos registros (sessões, revisões, questões, materiais e mudanças de
 * etapa). Nada é estimado e nada vem de IA. A documentação das fórmulas está em docs/METRICAS.md.
 *
 * Camadas:
 *   loadClass(d, ctx, opts)      → dados brutos por matrícula (poucas consultas agregadas, sem N+1)
 *   computeIndicators(raw, opt)  → indicadores numéricos (função pura, testável)
 *   diagnose(ind, settings)      → lista de diagnósticos com severidade e fatos (função pura)
 *   rank(rows, metric)           → ordenação e posições do ranking (função pura)
 */
import { addDays, daysBetween, round1 } from '../lib/util.js';
import { studentScope } from '../security/access.js';

export const WINDOW_DAYS = 28;           // janela de constância e evolução
export const WEEKS = 4;
export const MAX_DAYS_PER_WEEK = 5;      // teto: estudar mais de 5 dias na semana não aumenta a constância
export const NEW_STUDENT_DAYS = 7;       // menos que isso: "novo", sem posição no ranking
export const BACKLOG_DAYS = 14;          // conteúdo em revisão sem revisar há 14+ dias
export const MATERIAL_IDLE_DAYS = 14;    // material pronto parado há 14+ dias
export const STALL_DAYS = 21;            // sem nenhum avanço de etapa/revisão em 21 dias
export const ACCURACY_MIN_QUESTIONS = 40;
export const ACCURACY_DROP_PP = 10;

export const SEVERITY_ORDER = { critical: 0, serious: 1, warning: 2, info: 3, good: 4 };

const ACTIVE_STAFF_SQL = "u.status = 'active'";

/**
 * Carrega os dados brutos de todas as matrículas ativas visíveis (opcionalmente de um edital ou de um aluno).
 * Cada consulta é agregada por matrícula — o custo cresce linearmente com a turma, sem consultas por aluno.
 */
export async function loadClass(d, ctx, { editalId = null, studentId = null, today: t }) {
  const sc = studentScope(ctx, 'st');
  const where = [`e.status = 'active'`, `ed.archived_at IS NULL`, ACTIVE_STAFF_SQL];
  const params = [];
  if (editalId) { where.push('e.edital_id = ?'); params.push(editalId); }
  if (studentId) { where.push('e.student_id = ?'); params.push(studentId); }
  const base = await d.all(
    `SELECT e.id AS enrollment_id, e.student_id, e.edital_id, e.created_at AS enrolled_at, ed.name AS edital_name,
            u.id AS user_id, u.name, u.email, u.last_login_at, st.extra_reviews_allowed, st.access_until
       FROM enrollments e JOIN editais ed ON ed.id = e.edital_id JOIN students st ON st.id = e.student_id JOIN users u ON u.id = st.user_id
      WHERE ${where.join(' AND ')}${sc.sql}
      ORDER BY u.name`,
    [...params, ...sc.params]
  );
  if (!base.length) return [];
  // As consultas seguintes recebem a lista de matrículas como array (usa os índices por matrícula e data).
  const ids = base.map((b) => b.enrollment_id);
  const editalIds = [...new Set(base.map((b) => b.edital_id))];
  const from2 = addDays(t, -(2 * WINDOW_DAYS - 1)); // duas janelas: atual e anterior
  const cut = addDays(t, -WINDOW_DAYS);              // "há 28 dias"
  const IDS = '?::uuid[]';

  // Consultas em sequência: numa transação há uma única conexão.
  const totals = await d.all(
    `SELECT t.edital_id, count(*) AS topics, count(DISTINCT t.subject_id) AS subjects FROM topics t JOIN subjects sb ON sb.id = t.subject_id
      WHERE t.edital_id = ANY(${IDS}) AND t.archived_at IS NULL AND sb.archived_at IS NULL GROUP BY t.edital_id`, [editalIds]);
  const status = await d.all(
    `SELECT p.enrollment_id, p.status, count(*) AS n, count(*) FILTER (WHERE p.cycle_locked_at IS NOT NULL AND p.status = 'review') AS locked
       FROM topic_progress p JOIN topics t ON t.id = p.topic_id JOIN subjects sb ON sb.id = t.subject_id
      WHERE p.enrollment_id = ANY(${IDS}) AND t.archived_at IS NULL AND sb.archived_at IS NULL
      GROUP BY p.enrollment_id, p.status`, [ids]);
  const reviewedAgg = await d.all(
    `SELECT r.enrollment_id,
            count(DISTINCT r.topic_id) FILTER (WHERE r.consolidated AND r.date <= ?) AS cons_past,
            count(DISTINCT r.topic_id) FILTER (WHERE r.date <= ?) AS reviewed_past,
            count(DISTINCT r.topic_id) AS reviewed_now
       FROM reviews r JOIN topics t ON t.id = r.topic_id
      WHERE r.enrollment_id = ANY(${IDS}) AND r.voided_at IS NULL AND t.archived_at IS NULL
      GROUP BY r.enrollment_id`, [cut, cut, ids]);
  // Somas por janela (atual = últimos 28 dias; anterior = 28 dias antes; semana = últimos 7) — uma linha por matrícula.
  const winStart = addDays(t, -(WINDOW_DAYS - 1));
  const weekStart = addDays(t, -6);
  const sums = await d.all(
    `SELECT enrollment_id,
            COALESCE(sum(secs) FILTER (WHERE date >= ?), 0)::int AS cur_secs, COALESCE(sum(q) FILTER (WHERE date >= ?), 0)::int AS cur_q,
            COALESCE(sum(c) FILTER (WHERE date >= ?), 0)::int AS cur_c, COALESCE(sum(prod) FILTER (WHERE date >= ?), 0)::int AS cur_prod,
            COALESCE(sum(rev) FILTER (WHERE date >= ?), 0)::int AS cur_rev,
            COALESCE(sum(secs) FILTER (WHERE date < ?), 0)::int AS prev_secs, COALESCE(sum(q) FILTER (WHERE date < ?), 0)::int AS prev_q,
            COALESCE(sum(c) FILTER (WHERE date < ?), 0)::int AS prev_c, COALESCE(sum(secs) FILTER (WHERE date >= ?), 0)::int AS week_secs
       FROM (
        SELECT enrollment_id, date, duration_seconds AS secs, 0 AS q, 0 AS c, 0 AS prod, 0 AS rev FROM study_sessions
         WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
        UNION ALL
        SELECT enrollment_id, date, 0, questions, correct, 0, CASE WHEN source = 'review' THEN 1 ELSE 0 END FROM question_logs
         WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
        UNION ALL
        SELECT enrollment_id, date, 0, 0, 0, 1, 0 FROM production_logs
         WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
      ) x GROUP BY enrollment_id`,
    [winStart, winStart, winStart, winStart, winStart, winStart, winStart, winStart, weekStart, ids, from2, t, ids, from2, t, ids, from2, t]);
  // Dias ativos distintos (registros + mudanças de etapa feitas pelo aluno) e eventos de avanço recentes.
  const days = await d.all(
    `SELECT enrollment_id, date FROM (
        SELECT enrollment_id, date FROM study_sessions WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
        UNION ALL SELECT enrollment_id, date FROM question_logs WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
        UNION ALL SELECT enrollment_id, date FROM production_logs WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL AND date >= ? AND date <= ?
        UNION ALL SELECT le.enrollment_id, le.date FROM learning_events le JOIN students s2 ON s2.id = le.student_id
                   WHERE le.enrollment_id = ANY(${IDS}) AND le.date >= ? AND le.date <= ?
                     AND le.type IN ('status_change','review','consolidated') AND le.actor_user_id = s2.user_id
      ) x GROUP BY enrollment_id, date`,
    [ids, from2, t, ids, from2, t, ids, from2, t, ids, from2, t]);
  const progress = await d.all(
    `SELECT le.enrollment_id, count(*) AS n FROM learning_events le JOIN students s2 ON s2.id = le.student_id
      WHERE le.enrollment_id = ANY(${IDS}) AND le.date >= ? AND le.date <= ?
        AND le.type IN ('status_change','review','consolidated') AND le.actor_user_id = s2.user_id
      GROUP BY le.enrollment_id`, [ids, addDays(t, -(STALL_DAYS - 1)), t]);
  const lastEver = await d.all(
    `SELECT enrollment_id, max(last) AS last FROM (
        SELECT enrollment_id, max(date) AS last FROM study_sessions WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL GROUP BY enrollment_id
        UNION ALL SELECT enrollment_id, max(date) FROM question_logs WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL GROUP BY enrollment_id
        UNION ALL SELECT enrollment_id, max(date) FROM production_logs WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL GROUP BY enrollment_id
        UNION ALL SELECT enrollment_id, max(date) FROM learning_events WHERE enrollment_id = ANY(${IDS}) AND type = 'status_change' GROUP BY enrollment_id
      ) x GROUP BY enrollment_id`, [ids, ids, ids, ids]);
  const backlog = await d.all(
    `SELECT p.enrollment_id, count(*) AS n FROM topic_progress p JOIN topics t ON t.id = p.topic_id
       LEFT JOIN (SELECT progress_id, max(date) AS last FROM reviews WHERE enrollment_id = ANY(${IDS}) AND voided_at IS NULL GROUP BY progress_id) lr ON lr.progress_id = p.id
      WHERE p.enrollment_id = ANY(${IDS}) AND p.status = 'review' AND p.cycle_locked_at IS NULL AND t.archived_at IS NULL
        AND COALESCE(lr.last, p.review_started_at) <= ?
      GROUP BY p.enrollment_id`, [ids, ids, addDays(t, -BACKLOG_DAYS)]);
  const idle = await d.all(
    `SELECT p.enrollment_id, count(*) AS n FROM topic_progress p JOIN topics t ON t.id = p.topic_id
      WHERE p.enrollment_id = ANY(${IDS}) AND p.status = 'production' AND p.material_done_at <= ? AND t.archived_at IS NULL
      GROUP BY p.enrollment_id`, [ids, addDays(t, -MATERIAL_IDLE_DAYS)]);
  const subjHours = await d.all(
    `SELECT ss.enrollment_id, sb.name AS subject, sum(ss.duration_seconds) AS secs FROM study_sessions ss
       JOIN topics t ON t.id = ss.topic_id JOIN subjects sb ON sb.id = t.subject_id
      WHERE ss.enrollment_id = ANY(${IDS}) AND ss.voided_at IS NULL AND ss.date > ? AND ss.date <= ?
      GROUP BY ss.enrollment_id, sb.name`, [ids, cut, t]);

  const group = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.enrollment_id)) m.set(r.enrollment_id, []); m.get(r.enrollment_id).push(r); } return m; };
  const one = (rows) => new Map(rows.map((r) => [r.enrollment_id, r]));
  const G = { status: group(status), subj: group(subjHours) };
  const O = { rv: one(reviewedAgg), last: one(lastEver), backlog: one(backlog), idle: one(idle), sums: one(sums), days: group(days), progress: one(progress) };
  const TT = new Map(totals.map((x) => [x.edital_id, x]));
  return base.map((b) => ({
    ...b,
    topics_total: TT.get(b.edital_id)?.topics || 0,
    subjects_total: TT.get(b.edital_id)?.subjects || 0,
    status: G.status.get(b.enrollment_id) || [],
    consolidated_past: O.rv.get(b.enrollment_id)?.cons_past || 0,
    reviewed_past: O.rv.get(b.enrollment_id)?.reviewed_past || 0,
    reviewed_now: O.rv.get(b.enrollment_id)?.reviewed_now || 0,
    sums: O.sums.get(b.enrollment_id) || null,
    active_dates: (O.days.get(b.enrollment_id) || []).map((x) => x.date),
    progress_events_21: O.progress.get(b.enrollment_id)?.n || 0,
    last_activity: O.last.get(b.enrollment_id)?.last || null,
    backlog: O.backlog.get(b.enrollment_id)?.n || 0,
    material_idle: O.idle.get(b.enrollment_id)?.n || 0,
    subject_hours: G.subj.get(b.enrollment_id) || [],
  }));
}

/** Indicadores numéricos de uma matrícula (função pura). */
export function computeIndicators(raw, { today: t }) {
  const counts = { not_started: 0, assimilation: 0, production: 0, review: 0, consolidated: 0 };
  let locked = 0;
  let started = 0;
  for (const s of raw.status) { counts[s.status] = s.n; locked += s.locked; started += s.n; }
  counts.not_started = Math.max(0, raw.topics_total - (started - (counts.not_started || 0)));
  const total = raw.topics_total;
  const consolidationPct = total ? round1((counts.consolidated / total) * 100) : 0;
  const consolidationPastPct = total ? round1((Math.min(raw.consolidated_past, total) / total) * 100) : 0;

  const enrolledDay = String(raw.enrolled_at).slice(0, 10);
  const daysEnrolled = daysBetween(enrolledDay, t) + 1;
  const isNew = daysEnrolled < NEW_STUDENT_DAYS;

  // Dias ativos: qualquer registro (sessão, questões, revisão, material) ou mudança de etapa feita pelo aluno.
  // Aceita a forma agregada do banco (active_dates + sums) ou a forma detalhada por dia (activity + events).
  const winStart = addDays(t, -(WINDOW_DAYS - 1));
  const activeDays = new Set(raw.active_dates || []);
  const sums = { cur: { secs: 0, q: 0, c: 0, prod: 0, rev: 0 }, prev: { secs: 0, q: 0, c: 0 }, week: { secs: 0 } };
  let progressEvents = raw.progress_events_21 || 0;
  if (raw.sums) {
    const x = raw.sums;
    Object.assign(sums.cur, { secs: x.cur_secs, q: x.cur_q, c: x.cur_c, prod: x.cur_prod, rev: x.cur_rev });
    Object.assign(sums.prev, { secs: x.prev_secs, q: x.prev_q, c: x.prev_c });
    sums.week.secs = x.week_secs;
  }
  for (const a of raw.activity || []) {
    const hasAny = a.study_seconds > 0 || a.questions > 0 || a.productions > 0 || a.reviews > 0;
    if (hasAny) activeDays.add(a.date);
    if (a.date >= winStart) {
      sums.cur.secs += a.study_seconds; sums.cur.q += a.questions; sums.cur.c += a.correct; sums.cur.prod += a.productions; sums.cur.rev += a.reviews;
      if (a.date >= addDays(t, -6)) sums.week.secs += a.study_seconds;
    } else {
      sums.prev.secs += a.study_seconds; sums.prev.q += a.questions; sums.prev.c += a.correct;
    }
  }
  const stallStart = addDays(t, -(STALL_DAYS - 1));
  for (const ev of raw.events || []) {
    activeDays.add(ev.date);
    if (ev.date >= stallStart) progressEvents += 1;
  }
  // Constância: 4 semanas móveis terminando hoje; cada semana vale no máximo 5 dias.
  const weeks = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const end = addDays(t, -7 * w);
    const start = addDays(end, -6);
    let n = 0;
    for (const day of activeDays) if (day >= start && day <= end) n += 1;
    weeks.push({ start, end, active_days: n, counted: end >= enrolledDay });
  }
  // Semanas anteriores à matrícula não contam (aluno com 2 semanas é avaliado sobre 2 semanas).
  const counted = weeks.filter((w) => w.counted);
  const constancy = counted.length && !isNew
    ? round1((counted.reduce((a, w) => a + Math.min(w.active_days, MAX_DAYS_PER_WEEK), 0) / (counted.length * MAX_DAYS_PER_WEEK)) * 100)
    : null;
  let activeCur = 0;
  let activePrev = 0;
  for (const day of activeDays) { if (day >= winStart) activeCur += 1; else activePrev += 1; }
  const last14 = [...activeDays].filter((x) => x >= addDays(t, -13)).length;

  const hoursBySubject = raw.subject_hours.map((x) => ({ subject: x.subject, secs: x.secs })).sort((a, b) => b.secs - a.secs);
  return {
    enrollment_id: raw.enrollment_id, student_id: raw.student_id, edital_id: raw.edital_id, edital_name: raw.edital_name,
    name: raw.name, email: raw.email, last_login_at: raw.last_login_at, extra_reviews_allowed: raw.extra_reviews_allowed,
    enrolled_at: enrolledDay, days_enrolled: daysEnrolled, is_new: isNew,
    topics_total: total, subjects_total: raw.subjects_total, counts, locked,
    consolidation_pct: consolidationPct,
    consolidation_past_pct: consolidationPastPct,
    evolution_pp: isNew ? null : round1(consolidationPct - consolidationPastPct),
    reviewed_topics_delta: raw.reviewed_now - raw.reviewed_past,
    consolidated_delta: counts.consolidated - Math.min(raw.consolidated_past, total),
    constancy, weeks,
    active_days_28: activeCur, active_days_prev_28: activePrev, active_days_14: last14,
    last_activity: raw.last_activity,
    days_since_activity: raw.last_activity ? daysBetween(raw.last_activity, t) : null,
    study_seconds_28: sums.cur.secs, study_seconds_7: sums.week.secs, study_seconds_prev_28: sums.prev.secs,
    questions_28: sums.cur.q, correct_28: sums.cur.c, accuracy_28: sums.cur.q ? round1((sums.cur.c / sums.cur.q) * 100) : null,
    questions_prev_28: sums.prev.q, accuracy_prev_28: sums.prev.q ? round1((sums.prev.c / sums.prev.q) * 100) : null,
    productions_28: sums.cur.prod, reviews_28: sums.cur.rev,
    progress_events_21: progressEvents,
    review_backlog: raw.backlog, material_idle: raw.material_idle,
    hours_by_subject_28: hoursBySubject,
  };
}

const br = (n) => String(n).replace('.', ',');
const fmtH = (secs) => { const h = Math.floor(secs / 3600); const m = Math.round((secs % 3600) / 60); return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`; };

/**
 * Diagnósticos determinísticos. Cada item tem: code, severity, title, facts (texto com os números), action.
 * `inactivity_days` vem da configuração vigente do ambiente.
 */
export function diagnose(ind, settings) {
  const out = [];
  const inact = settings.inactivity_days;
  const add = (code, severity, title, facts, action) => out.push({ code, severity, title, facts, action });

  if (!ind.last_activity) {
    if (ind.days_enrolled >= NEW_STUDENT_DAYS) add('never_started', 'critical', 'Ainda não começou', `Matriculado há ${ind.days_enrolled} dias e nenhum registro de estudo.`, 'Entrar em contato para ajudar no primeiro passo.');
    else add('new_student', 'info', 'Aluno novo', `Matriculado há ${ind.days_enrolled} dia(s). Dados ainda insuficientes.`, 'Acompanhar os primeiros registros.');
    return out;
  }
  if (ind.days_since_activity >= inact) {
    add('inactive', ind.days_since_activity >= 2 * inact ? 'critical' : 'serious', 'Parado', `Sem nenhum registro há ${ind.days_since_activity} dias (último em ${ind.last_activity.split('-').reverse().join('/')}).`, 'Conversar sobre a rotina e o que está impedindo.');
  } else if (ind.active_days_prev_28 >= 8 && ind.active_days_28 <= ind.active_days_prev_28 / 2) {
    add('frequency_drop', 'serious', 'Queda de frequência', `${ind.active_days_28} dias ativos nas últimas 4 semanas, contra ${ind.active_days_prev_28} nas 4 anteriores.`, 'Verificar se algo mudou na rotina.');
  }
  if (ind.questions_28 >= ACCURACY_MIN_QUESTIONS && ind.questions_prev_28 >= ACCURACY_MIN_QUESTIONS
    && ind.accuracy_prev_28 - ind.accuracy_28 >= ACCURACY_DROP_PP) {
    add('accuracy_drop', 'serious', 'Acerto em queda', `${br(ind.accuracy_28)}% de acerto em ${ind.questions_28} questões nas últimas 4 semanas, contra ${br(ind.accuracy_prev_28)}% em ${ind.questions_prev_28} nas 4 anteriores.`, 'Revisar os conteúdos com pior resultado junto com o aluno.');
  }
  const effortNoPractice = ind.study_seconds_28 >= 10 * 3600 && ind.questions_28 === 0;
  if (effortNoPractice) {
    add('effort_without_practice', 'warning', 'Estuda, mas não resolve questões', `${fmtH(ind.study_seconds_28)} de estudo nas últimas 4 semanas e nenhuma questão registrada.`, 'Orientar a passar para Q + R nos conteúdos com material pronto.');
  } else if (ind.active_days_14 >= 4 && ind.progress_events_21 === 0 && ind.counts.consolidated < ind.topics_total) {
    add('stalled', 'warning', 'Estuda, mas não avança', `${ind.active_days_14} dias ativos nas últimas 2 semanas, sem mudança de etapa ou revisão em ${STALL_DAYS} dias.`, 'Ajudar a fechar o material e começar as revisões.');
  }
  if (ind.review_backlog >= 3) add('review_backlog', 'warning', 'Revisões atrasadas', `${ind.review_backlog} conteúdos em revisão sem revisar há ${BACKLOG_DAYS} dias ou mais.`, 'Sugerir um bloco de revisões nesta semana.');
  if (ind.material_idle >= 3) add('material_idle', 'warning', 'Material pronto parado', `${ind.material_idle} conteúdos com material pronto há ${MATERIAL_IDLE_DAYS} dias ou mais sem iniciar a revisão.`, 'Incentivar a iniciar as questões desses conteúdos.');
  if (ind.locked >= 1) add('cycle_locked', ind.locked >= 2 ? 'warning' : 'info', 'Aguardando rodízio', `${ind.locked} conteúdo(s) atingiram o limite de revisões do ciclo sem consolidar.`, 'Avaliar liberar novo ciclo ou revisões extras.');
  const top = ind.hours_by_subject_28[0];
  if (top && !ind.is_new && ind.study_seconds_28 >= 5 * 3600 && ind.subjects_total >= 3 && top.secs / ind.study_seconds_28 >= 0.75) {
    add('concentration', 'warning', 'Concentrado em uma matéria', `${Math.round((top.secs / ind.study_seconds_28) * 100)}% das horas das últimas 4 semanas em ${top.subject}.`, 'Lembrar do equilíbrio entre as matérias do edital.');
  }
  const stopped = out.some((x) => x.code === 'inactive');
  if (!stopped && !ind.is_new && (ind.evolution_pp >= 10 || ind.consolidated_delta >= 3)) {
    add('improving', 'good', 'Evoluindo', `+${ind.consolidated_delta} conteúdo(s) consolidado(s) em 4 semanas (${ind.evolution_pp >= 0 ? '+' : ''}${br(ind.evolution_pp)} p.p.).`, 'Reconhecer o avanço.');
  }
  if (!stopped && ind.constancy != null && ind.constancy >= 80) {
    add('consistent', 'good', 'Constante', `Constância de ${br(ind.constancy)} (dias ativos por semana nas últimas 4 semanas).`, 'Manter o ritmo.');
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Maior severidade de uma lista de diagnósticos ('good' quando só há positivos; null se vazia). */
export function topSeverity(list) {
  if (!list.length) return null;
  return list.reduce((a, x) => (SEVERITY_ORDER[x.severity] < SEVERITY_ORDER[a] ? x.severity : a), 'good');
}

export const RANK_METRICS = {
  consolidation: { key: 'consolidation_pct', tie: ['evolution_pp', 'constancy'] },
  constancy: { key: 'constancy', tie: ['consolidation_pct', 'evolution_pp'] },
  evolution: { key: 'evolution_pp', tie: ['reviewed_topics_delta', 'consolidation_pct'] },
  // Esforço e volume (últimos 28 dias). Mostram dedicação, não domínio.
  hours: { key: 'study_seconds_28', tie: ['questions_28', 'consolidation_pct'] },
  questions: { key: 'questions_28', tie: ['accuracy_rank', 'study_seconds_28'] },
  // Desempenho: % de acerto só conta com amostra mínima (regra de credibilidade); abaixo disso fica sem posição de nota.
  accuracy: { key: 'accuracy_rank', tie: ['questions_28', 'study_seconds_28'] },
};

/**
 * Ranking determinístico por um indicador. Alunos novos (< 7 dias) ficam fora das posições.
 * Empate: critérios de desempate do indicador e, por fim, nome (ordem alfabética) — sempre a mesma ordem.
 * Empate exato nos critérios numéricos → mesma posição (1, 2, 2, 4).
 */
export function rank(rows, metric = 'consolidation') {
  const m = RANK_METRICS[metric] || RANK_METRICS.consolidation;
  for (const r of rows) r.accuracy_rank = r.questions_28 >= ACCURACY_MIN_QUESTIONS ? r.accuracy_28 : null;
  const keys = [m.key, ...m.tie];
  const val = (r, k) => (r[k] == null ? -Infinity : r[k]);
  const noSample = (r) => metric === 'accuracy' && r.accuracy_rank == null;   // sem amostra mínima: sem posição
  const ranked = rows.filter((r) => !r.is_new && !noSample(r)).sort((a, b) => {
    for (const k of keys) { const dlt = val(b, k) - val(a, k); if (dlt) return dlt; }
    return a.name.localeCompare(b.name, 'pt-BR');
  });
  let pos = 0;
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    if (!prev || keys.some((k) => val(prev, k) !== val(r, k))) pos = i + 1;
    r.position = pos;
  });
  return { ranked, unranked: rows.filter((r) => r.is_new || noSample(r)).map((r) => ({ ...r, position: null })) };
}

/** Indicadores + diagnósticos de todas as matrículas visíveis (visão POR EDITAL). */
export async function classIndicators(d, ctx, { editalId, studentId, today: t, settings, withRaw = false }) {
  const raw = await loadClass(d, ctx, { editalId, studentId, today: t });
  const rows = raw.map((r) => {
    const ind = computeIndicators(r, { today: t });
    const diagnostics = diagnose(ind, settings);
    return { ...ind, diagnostics, severity: topSeverity(diagnostics) };
  });
  return withRaw ? { rows, raw } : rows;
}

/** Diagnósticos que dizem respeito ao ALUNO (rotina, frequência), não a um edital específico. */
export const ACTIVITY_CODES = new Set(['never_started', 'new_student', 'inactive', 'frequency_drop', 'consistent']);

/**
 * Visão POR ALUNO (Central com "Todos os editais").
 *  - Atividade (última atividade, dias ativos, constância, horas, questões) soma TODOS os editais do aluno.
 *    Assim, quem estuda o edital A todos os dias não aparece como "parado" só porque não mexeu no edital B.
 *  - Consolidação, evolução, revisões atrasadas, rodízio e concentração continuam POR EDITAL (lista `editais`),
 *    e os diagnósticos desse tipo levam o nome do edital quando o aluno tem mais de um.
 */
export function studentOverview(raw, rows, settings, t) {
  const byStudent = new Map();
  raw.forEach((r, i) => {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, { raws: [], rows: [] });
    byStudent.get(r.student_id).raws.push(r);
    byStudent.get(r.student_id).rows.push(rows[i]);
  });
  const SUM_KEYS = ['cur_secs', 'cur_q', 'cur_c', 'cur_prod', 'cur_rev', 'prev_secs', 'prev_q', 'prev_c', 'week_secs'];
  const out = [];
  for (const [studentId, { raws, rows: rs }] of byStudent) {
    const sums = Object.fromEntries(SUM_KEYS.map((k) => [k, raws.reduce((a, r) => a + (r.sums?.[k] || 0), 0)]));
    const hours = new Map();
    for (const r of raws) for (const h of r.subject_hours) hours.set(h.subject, (hours.get(h.subject) || 0) + h.secs);
    const merged = {
      ...raws[0],
      enrollment_id: null, edital_id: null, edital_name: null,
      enrolled_at: raws.map((r) => String(r.enrolled_at)).sort()[0],
      topics_total: 0, subjects_total: 0, status: [], consolidated_past: 0, reviewed_past: 0, reviewed_now: 0,
      sums, active_dates: [...new Set(raws.flatMap((r) => r.active_dates || []))],
      progress_events_21: raws.reduce((a, r) => a + (r.progress_events_21 || 0), 0),
      last_activity: raws.map((r) => r.last_activity).filter(Boolean).sort().pop() || null,
      backlog: 0, material_idle: 0, subject_hours: [...hours].map(([subject, secs]) => ({ subject, secs })),
    };
    const act = computeIndicators(merged, { today: t });
    const multi = rs.length > 1;
    const diagnostics = [
      ...diagnose(act, settings).filter((g) => ACTIVITY_CODES.has(g.code)),
      ...rs.flatMap((r) => r.diagnostics.filter((g) => !ACTIVITY_CODES.has(g.code))
        .map((g) => (multi ? { ...g, edital_name: r.edital_name, facts: `${r.edital_name}: ${g.facts}` } : g))),
    ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    out.push({
      scope: 'student',
      student_id: studentId, name: act.name, email: act.email, last_login_at: act.last_login_at,
      is_new: act.is_new, days_enrolled: act.days_enrolled,
      last_activity: act.last_activity, days_since_activity: act.days_since_activity,
      active_days_28: act.active_days_28, constancy: act.constancy,
      study_seconds_7: act.study_seconds_7, study_seconds_28: act.study_seconds_28,
      questions_28: act.questions_28, accuracy_28: act.accuracy_28,
      consolidated_delta: rs.reduce((a, r) => a + r.consolidated_delta, 0),
      editais: rs.map((r) => ({
        enrollment_id: r.enrollment_id, edital_id: r.edital_id, edital_name: r.edital_name, topics_total: r.topics_total,
        counts: r.counts, consolidation_pct: r.consolidation_pct, evolution_pp: r.evolution_pp, consolidated_delta: r.consolidated_delta,
        severity: topSeverity(r.diagnostics.filter((g) => !ACTIVITY_CODES.has(g.code))),
      })),
      diagnostics,
      severity: topSeverity(diagnostics),
    });
  }
  return out;
}

/** Converte uma linha POR EDITAL para o mesmo formato da visão por aluno (Central com um edital selecionado). */
export function enrollmentAsOverview(r) {
  return {
    scope: 'edital',
    student_id: r.student_id, name: r.name, email: r.email, last_login_at: r.last_login_at,
    is_new: r.is_new, days_enrolled: r.days_enrolled,
    last_activity: r.last_activity, days_since_activity: r.days_since_activity,
    active_days_28: r.active_days_28, constancy: r.constancy,
    study_seconds_7: r.study_seconds_7, study_seconds_28: r.study_seconds_28,
    questions_28: r.questions_28, accuracy_28: r.accuracy_28, consolidated_delta: r.consolidated_delta,
    editais: [{ enrollment_id: r.enrollment_id, edital_id: r.edital_id, edital_name: r.edital_name, topics_total: r.topics_total, counts: r.counts, consolidation_pct: r.consolidation_pct, evolution_pp: r.evolution_pp, consolidated_delta: r.consolidated_delta, severity: r.severity }],
    diagnostics: r.diagnostics, severity: r.severity,
  };
}
