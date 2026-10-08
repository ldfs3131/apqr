/**
 * Horas e sessões: cronômetro (estado no servidor) e registro manual; questões avulsas.
 * Horas = indicador de ESFORÇO, nunca de domínio. Cada sessão pode indicar a atividade APQR
 * (assimilação, produção, questões, revisão) — isso descreve o comportamento, não muda a etapa.
 */
import { addDays, badRequest, conflict, isValidDate, localDate, notFound, now, nowIso, today } from '../lib/util.js';
import { assertTopicInEnrollment } from '../security/access.js';
import { logEvent } from './apqr.js';

export const ACTIVITIES = ['study', 'assimilation', 'production', 'questions', 'review'];
export const MIN_TIMER_SECONDS = 60;
export const LONG_SESSION_WARNING_SECONDS = 4 * 3600;
export const MAX_SESSION_SECONDS = 16 * 3600;
export const MAX_DAY_SECONDS = 24 * 3600;

const cleanActivity = (a) => {
  const v = a || 'study';
  if (!ACTIVITIES.includes(v)) throw badRequest('Atividade inválida.');
  return v;
};
const elapsedSeconds = (t) => t.accumulated_seconds + Math.max(0, t.running_since ? Math.floor((now().getTime() - new Date(t.running_since).getTime()) / 1000) : 0);

export async function getTimer(d, studentId) {
  const t = await d.one(
    `SELECT at.*, tp.name AS topic_name, sb.name AS subject_name, sb.id AS subject_id, ed.name AS edital_name,
            COALESCE(p.status, 'not_started') AS topic_status
       FROM active_timers at JOIN topics tp ON tp.id = at.topic_id JOIN subjects sb ON sb.id = tp.subject_id
       JOIN enrollments e ON e.id = at.enrollment_id JOIN editais ed ON ed.id = e.edital_id
       LEFT JOIN topic_progress p ON p.enrollment_id = at.enrollment_id AND p.topic_id = at.topic_id
      WHERE at.student_id = ?`,
    [studentId]
  );
  if (!t) return null;
  const elapsed = elapsedSeconds(t);
  return { ...t, state: t.running_since ? 'running' : 'paused', elapsed_seconds: elapsed, long_session: elapsed >= LONG_SESSION_WARNING_SECONDS, server_now: nowIso() };
}

export async function startTimer(d, enrollment, topicId, activity) {
  const topic = await assertTopicInEnrollment(d, enrollment, topicId);
  if (topic.archived_at || topic.subject_archived_at) throw badRequest('Conteúdo arquivado.');
  const existing = await getTimer(d, enrollment.student_id);
  if (existing) throw conflict(`Já existe um estudo em andamento (${existing.subject_name} — ${existing.topic_name}). Finalize-o antes de iniciar outro.`, 'timer_active', { timer: existing });
  const ts = nowIso();
  await d.run(
    'INSERT INTO active_timers (student_id, tenant_id, enrollment_id, topic_id, activity, started_at, running_since, accumulated_seconds) VALUES (?,?,?,?,?,?,?,0)',
    [enrollment.student_id, enrollment.tenant_id, enrollment.id, topicId, cleanActivity(activity), ts, ts]
  );
  const status = (await d.one('SELECT status FROM topic_progress WHERE enrollment_id = ? AND topic_id = ?', [enrollment.id, topicId]))?.status || 'not_started';
  // Sugestão (nunca automática): conteúdo vermelho com estudo iniciado costuma estar em Assimilação.
  return { timer: await getTimer(d, enrollment.student_id), suggest_status: status === 'not_started' ? 'assimilation' : null };
}

export async function pauseTimer(d, studentId) {
  const t = await getTimer(d, studentId);
  if (!t) throw notFound('Nenhum estudo em andamento.');
  if (t.state === 'paused') throw badRequest('O cronômetro já está pausado.');
  await d.run('UPDATE active_timers SET accumulated_seconds = ?, running_since = NULL WHERE student_id = ?', [elapsedSeconds(t), studentId]);
  return getTimer(d, studentId);
}

export async function resumeTimer(d, studentId) {
  const t = await getTimer(d, studentId);
  if (!t) throw notFound('Nenhum estudo em andamento.');
  if (t.state === 'running') throw badRequest('O cronômetro já está em andamento.');
  await d.run('UPDATE active_timers SET running_since = ? WHERE student_id = ?', [nowIso(), studentId]);
  return getTimer(d, studentId);
}

export async function discardTimer(d, studentId) {
  const n = await d.run('DELETE FROM active_timers WHERE student_id = ?', [studentId]);
  if (!n) throw notFound('Nenhum estudo em andamento.');
}

/** Finaliza e salva. adjustedSeconds só pode REDUZIR (esqueceu ligado), nunca aumentar. */
export async function finishTimer(d, ctx, studentId, { adjustedSeconds, note, activity, tz }) {
  const t = await getTimer(d, studentId);
  if (!t) throw notFound('Nenhum estudo em andamento.');
  let duration = t.elapsed_seconds;
  if (adjustedSeconds != null) {
    if (!Number.isInteger(adjustedSeconds) || adjustedSeconds < 1) throw badRequest('Duração ajustada inválida.');
    if (adjustedSeconds > duration) throw badRequest('A duração ajustada não pode ser maior que o tempo cronometrado.');
    duration = adjustedSeconds;
  }
  duration = Math.min(duration, MAX_SESSION_SECONDS);
  await d.run('DELETE FROM active_timers WHERE student_id = ?', [studentId]);
  if (duration < MIN_TIMER_SECONDS) return { saved: false, message: 'Sessão com menos de 1 minuto: não foi salva.' };
  const enrollment = await d.one('SELECT * FROM enrollments WHERE id = ?', [t.enrollment_id]);
  const date = localDate(new Date(t.started_at), tz);
  const endedAt = nowIso();
  const session = await d.one(
    `INSERT INTO study_sessions (tenant_id, student_id, enrollment_id, topic_id, activity, date, started_at, ended_at, duration_seconds, source, note, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,'timer',?,?,?) RETURNING *`,
    [t.tenant_id, studentId, t.enrollment_id, t.topic_id, cleanActivity(activity || t.activity), date, t.started_at, endedAt, duration, note ? String(note).slice(0, 500) : null, ctx.userId, endedAt]
  );
  await logEvent(d, enrollment, t.topic_id, 'study_session', { date, actor: ctx.userId, payload: { session_id: session.id, source: 'timer', seconds: duration, activity: session.activity } });
  return { saved: true, session };
}

/** "+ Registrar estudo manualmente". */
export async function addManualSession(d, ctx, enrollment, { topicId, date, durationMinutes, startTime, note, activity }) {
  const tz = enrollment.student_tz;
  const topic = await assertTopicInEnrollment(d, enrollment, topicId);
  if (topic.archived_at) throw badRequest('Conteúdo arquivado.');
  if (!isValidDate(date)) throw badRequest('Informe uma data válida.');
  const t = today(tz);
  if (date > t) throw badRequest('A data do estudo não pode estar no futuro.');
  if (date < addDays(t, -365)) throw badRequest('Registros manuais são aceitos para até 1 ano atrás.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > MAX_SESSION_SECONDS / 60) throw badRequest('Duração inválida: informe entre 1 minuto e 16 horas.');
  const seconds = durationMinutes * 60;
  const dayTotal = (await d.one('SELECT COALESCE(sum(duration_seconds), 0) AS s FROM study_sessions WHERE student_id = ? AND date = ? AND voided_at IS NULL', [enrollment.student_id, date])).s;
  if (dayTotal + seconds > MAX_DAY_SECONDS) throw badRequest('O total de estudo neste dia ultrapassaria 24 horas.');
  let startedAt = null;
  let endedAt = null;
  if (startTime) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw badRequest('Horário inicial inválido (use HH:MM).');
    startedAt = new Date(`${date}T${startTime}:00-03:00`).toISOString(); // Brasília (sem horário de verão desde 2019)
    endedAt = new Date(new Date(startedAt).getTime() + seconds * 1000).toISOString();
  }
  const session = await d.one(
    `INSERT INTO study_sessions (tenant_id, student_id, enrollment_id, topic_id, activity, date, started_at, ended_at, duration_seconds, source, note, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,'manual',?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, cleanActivity(activity), date, startedAt, endedAt, seconds, note ? String(note).slice(0, 500) : null, ctx.userId, nowIso()]
  );
  await logEvent(d, enrollment, topicId, 'study_session', { date, actor: ctx.userId, payload: { session_id: session.id, source: 'manual', seconds, activity: session.activity } });
  return session;
}

export async function voidSession(d, ctx, enrollment, sessionId) {
  const s = await d.one('SELECT * FROM study_sessions WHERE id = ? AND enrollment_id = ? AND voided_at IS NULL', [sessionId, enrollment.id]);
  if (!s) throw notFound('Sessão não encontrada.');
  await d.run('UPDATE study_sessions SET voided_at = ?, voided_by = ? WHERE id = ?', [nowIso(), ctx.userId, s.id]);
  await logEvent(d, enrollment, s.topic_id, 'study_session_removed', { date: s.date, actor: ctx.userId, payload: { session_id: s.id, seconds: s.duration_seconds, source: s.source } });
}

/** Questões avulsas (treino/simulado): entram no desempenho, NUNCA mudam a etapa APQR. */
export async function addPracticeQuestions(d, ctx, enrollment, { topicId, date, questions, correct, note }) {
  const tz = enrollment.student_tz;
  await assertTopicInEnrollment(d, enrollment, topicId);
  if (!isValidDate(date) || date > today(tz)) throw badRequest('Data inválida.');
  if (!Number.isInteger(questions) || questions < 1 || questions > 500) throw badRequest('Informe entre 1 e 500 questões.');
  if (!Number.isInteger(correct) || correct < 0 || correct > questions) throw badRequest('Acertos devem estar entre 0 e o total de questões.');
  const row = await d.one(
    `INSERT INTO question_logs (tenant_id, student_id, enrollment_id, topic_id, source, date, questions, correct, note, created_by, created_at)
     VALUES (?,?,?,?,'practice',?,?,?,?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, date, questions, correct, note ? String(note).slice(0, 300) : null, ctx.userId, nowIso()]
  );
  await logEvent(d, enrollment, topicId, 'practice', { date, actor: ctx.userId, payload: { attempt_id: row.id, questions, correct } });
  return row;
}

/**
 * Questões livres: por matéria (sem tema) ou simulado misto. Nunca bloqueadas por consolidação/limites de revisão
 * e nunca mudam a etapa APQR. Entram no desempenho geral e, quando há matéria, no desempenho da matéria.
 */
export async function addFreeQuestions(d, ctx, enrollment, { kind, topicId, subjectId, name, date, questions, correct, note }) {
  const tz = enrollment.student_tz;
  if (kind === 'topic') return addPracticeQuestions(d, ctx, enrollment, { topicId, date, questions, correct, note });
  if (!['subject', 'simulado'].includes(kind)) throw badRequest('Tipo de registro inválido.');
  if (!isValidDate(date) || date > today(tz)) throw badRequest('Data inválida.');
  if (!Number.isInteger(questions) || questions < 1 || questions > 500) throw badRequest('Informe entre 1 e 500 questões.');
  if (!Number.isInteger(correct) || correct < 0 || correct > questions) throw badRequest('Acertos devem estar entre 0 e o total de questões.');
  let subj = null;
  if (kind === 'subject') {
    subj = await d.one('SELECT id FROM subjects WHERE id = ? AND edital_id = ? AND archived_at IS NULL', [subjectId, enrollment.edital_id]);
    if (!subj) throw badRequest('Matéria não encontrada neste edital.');
  }
  const row = await d.one(
    `INSERT INTO question_logs (tenant_id, student_id, enrollment_id, topic_id, subject_id, source, simulado_name, date, questions, correct, note, created_by, created_at)
     VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, subj?.id || null, kind === 'subject' ? 'general' : 'simulado', kind === 'simulado' && name ? String(name).slice(0, 80) : null, date, questions, correct, note ? String(note).slice(0, 300) : null, ctx.userId, nowIso()]
  );
  await logEvent(d, enrollment, null, kind === 'subject' ? 'practice' : 'simulado', { date, actor: ctx.userId, payload: { attempt_id: row.id, questions, correct, subject_id: subj?.id || null } });
  return row;
}

export async function voidPractice(d, ctx, enrollment, attemptId) {
  const q = await d.one("SELECT * FROM question_logs WHERE id = ? AND enrollment_id = ? AND source IN ('practice','general','simulado') AND voided_at IS NULL", [attemptId, enrollment.id]);
  if (!q) throw notFound('Registro não encontrado.');
  await d.run('UPDATE question_logs SET voided_at = ?, voided_by = ? WHERE id = ?', [nowIso(), ctx.userId, q.id]);
  await logEvent(d, enrollment, q.topic_id, 'practice_removed', { date: q.date, actor: ctx.userId, payload: { attempt_id: q.id, questions: q.questions, correct: q.correct } });
}
