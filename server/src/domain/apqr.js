/**
 * NÚCLEO DO MÉTODO APQR — regras de negócio validadas no servidor.
 *
 *  🔴 not_started → 🟧 assimilation (A) → 🟡 production (P: material pronto) → 🟢 review (Q + R) → 🟩 consolidated
 *
 * Regras (ver docs/DECISOES.md):
 *  1. Mudanças de etapa são MANUAIS e somente para frente. O aluno nunca volta etapa.
 *     Só a professora/monitor corrige (volta), com motivo, e apenas se não houver revisões válidas.
 *  2. 🟩 Consolidado nunca é marcado manualmente: acontece quando uma revisão tem percentual
 *     ESTRITAMENTE MAIOR que o percentual de consolidação vigente. Comparação em inteiros.
 *  3. Cada revisão exige o MÍNIMO DE QUESTÕES vigente (configurável e versionado; padrão inicial 20).
 *  4. Máximo de revisões por ciclo (configurável; padrão 4). Depois disso o ciclo trava e só o rodízio
 *     libera um novo ciclo — a menos que a professora tenha liberado "revisões extras" para o aluno.
 *  5. Registrar produção/atualização de material NÃO muda a etapa.
 *  6. Nada é apagado: revisão desfeita é anulada (voided_at), com motivo e ator.
 *
 * Os parâmetros vêm de `getSettings(d, tenantId)` DENTRO da mesma transação e cada revisão grava
 * a versão e os valores usados (config_version, min_questions_used, threshold_used).
 */
import { getSettings, MAX_QUESTIONS_PER_REVIEW, UNDO_REVIEW_WINDOW_MINUTES } from './settings.js';
import { badRequest, conflict, forbidden, isValidDate, now, nowIso, notFound, pct, today } from '../lib/util.js';

export const STATUSES = ['not_started', 'assimilation', 'production', 'review', 'consolidated'];
export const STATUS_LABEL = {
  not_started: 'Não iniciado',
  assimilation: 'A — Assimilação',
  production: 'P — Material pronto',
  review: 'Q + R — Questões e Revisão',
  consolidated: 'Consolidado',
};
/** Peso de cada etapa no "Progresso APQR" (média por conteúdo). */
export const STATUS_WEIGHT = { not_started: 0, assimilation: 25, production: 50, review: 75, consolidated: 100 };
const STATUS_DATE_FIELD = { assimilation: 'started_at', production: 'material_done_at', review: 'review_started_at', consolidated: 'consolidated_at' };
export const PRODUCTION_KINDS = ['resumo', 'mapa_mental', 'esquema', 'flashcards', 'anotacoes', 'outro'];

export const LIMIT_MESSAGE = (max) => `Limite de ${max} revisões atingido. Avance para os demais conteúdos do edital.`;

/** A regra de consolidação, em aritmética inteira (sem erro de arredondamento). */
export function isConsolidating(correct, questions, threshold) {
  return correct * 100 > threshold * questions;
}

export const fmtBr = (d) => (d ? d.split('-').reverse().join('/') : '');
export const fmtPct = (p) => (p == null ? '—' : `${String(p).replace('.', ',')}%`);

export async function logEvent(d, enrollment, topicId, type, { from = null, to = null, date, payload = null, actor = null }) {
  await d.run(
    `INSERT INTO learning_events (tenant_id, student_id, enrollment_id, topic_id, type, from_status, to_status, date, payload, actor_user_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, type, from, to, date, payload ? JSON.stringify(payload) : null, actor, nowIso()]
  );
}

const TOPIC_STATE_SQL = `
  SELECT t.id, t.name, t.subject_id, t.edital_id, t.archived_at, s.name AS subject_name, s.archived_at AS subject_archived_at,
         p.id AS progress_id, COALESCE(p.status, 'not_started') AS status, p.started_at, p.material_done_at, p.review_started_at,
         p.consolidated_at, COALESCE(p.current_cycle, 1) AS current_cycle, p.cycle_locked_at, COALESCE(p.material_updates, 0) AS material_updates
    FROM topics t JOIN subjects s ON s.id = t.subject_id
    LEFT JOIN topic_progress p ON p.topic_id = t.id AND p.enrollment_id = ?
   WHERE t.id = ? AND t.edital_id = ?`;

/** Estado do conteúdo para o aluno (sem criar progresso). */
export async function getTopicState(d, enrollment, topicId) {
  const t = await d.one(TOPIC_STATE_SQL, [enrollment.id, topicId, enrollment.edital_id]);
  if (!t) throw notFound('Conteúdo não encontrado.');
  return t;
}

/** Garante a linha de progresso e a TRAVA para escrita (evita revisões simultâneas duplicadas). */
async function lockTopicState(d, enrollment, topicId) {
  const t = await getTopicState(d, enrollment, topicId);
  if (t.archived_at || t.subject_archived_at) throw badRequest('Este conteúdo está arquivado.');
  if (enrollment.status !== 'active') throw badRequest('Esta matrícula está arquivada.');
  if (!t.progress_id) {
    const ts = nowIso();
    await d.run(
      `INSERT INTO topic_progress (tenant_id, enrollment_id, student_id, topic_id, created_at, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (enrollment_id, topic_id) DO NOTHING`,
      [enrollment.tenant_id, enrollment.id, enrollment.student_id, topicId, ts, ts]
    );
  }
  await d.one('SELECT id FROM topic_progress WHERE enrollment_id = ? AND topic_id = ? FOR UPDATE', [enrollment.id, topicId]);
  return getTopicState(d, enrollment, topicId);
}

async function updateProgress(d, progressId, sets) {
  const cols = Object.keys(sets);
  await d.run(`UPDATE topic_progress SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => sets[c]), nowIso(), progressId]);
}

const lastStatusDate = (t) => [t.started_at, t.material_done_at, t.review_started_at].filter(Boolean).sort().pop() || null;

function validateEventDate(date, tz, minDate, label = 'data') {
  if (!isValidDate(date)) throw badRequest(`Informe uma ${label} válida (AAAA-MM-DD).`, 'invalid_date');
  if (date > today(tz)) throw badRequest(`A ${label} não pode estar no futuro.`, 'future_date');
  if (minDate && date < minDate) throw badRequest(`A ${label} não pode ser anterior a ${fmtBr(minDate)} (etapa anterior do conteúdo).`, 'date_before_previous');
}

/**
 * Muda a etapa (manual, só para frente). Pular etapas é permitido (ex.: aluno que já tem material pronto);
 * as datas intermediárias recebem a mesma data.
 */
export async function changeStatus(d, ctx, enrollment, topicId, target, { date } = {}) {
  const tz = enrollment.student_tz;
  if (!STATUSES.includes(target)) throw badRequest('Etapa inválida.');
  if (target === 'consolidated') {
    throw badRequest('A consolidação não é manual: ela acontece automaticamente quando uma revisão supera o percentual de consolidação.', 'manual_consolidation');
  }
  const t = await lockTopicState(d, enrollment, topicId);
  const fromIdx = STATUSES.indexOf(t.status);
  const toIdx = STATUSES.indexOf(target);
  if (t.status === 'consolidated') throw badRequest('Conteúdo já consolidado. O ciclo de revisões foi encerrado.', 'already_consolidated');
  if (toIdx === fromIdx) throw badRequest('O conteúdo já está nesta etapa.', 'same_status');
  if (toIdx < fromIdx) throw badRequest('No método APQR não existe retrocesso de etapa. Se foi um engano, peça à sua professora para corrigir.', 'no_regression');
  const eventDate = date || today(tz);
  validateEventDate(eventDate, tz, lastStatusDate(t));
  const sets = { status: target };
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const f = STATUS_DATE_FIELD[STATUSES[i]];
    if (f && !t[f]) sets[f] = eventDate;
  }
  await updateProgress(d, t.progress_id, sets);
  await logEvent(d, enrollment, topicId, 'status_change', {
    from: t.status, to: target, date: eventDate, actor: ctx.userId,
    payload: toIdx - fromIdx > 1 ? { skipped: STATUSES.slice(fromIdx + 1, toIdx) } : null,
  });
  return getTopicState(d, enrollment, topicId);
}

const validReviewsCount = async (d, progressId) => (await d.one('SELECT count(*) AS c FROM reviews WHERE progress_id = ? AND voided_at IS NULL', [progressId])).c;

/** Correção de etapa pela professora/monitor: pode voltar, com motivo, só se não houver revisões válidas. */
export async function staffCorrectStatus(d, ctx, enrollment, topicId, target, { reason }) {
  const tz = enrollment.student_tz;
  if (!STATUSES.includes(target) || target === 'consolidated') throw badRequest('Etapa inválida para correção.');
  if (!reason || reason.trim().length < 3) throw badRequest('Informe o motivo da correção.');
  const t = await lockTopicState(d, enrollment, topicId);
  if (target === t.status) throw badRequest('O conteúdo já está nesta etapa.');
  if ((await validReviewsCount(d, t.progress_id)) > 0) throw badRequest('Este conteúdo possui revisões registradas. Desfaça as revisões antes de corrigir a etapa.', 'has_reviews');
  const toIdx = STATUSES.indexOf(target);
  const sets = { status: target };
  for (let i = toIdx + 1; i < STATUSES.length; i++) {
    const f = STATUS_DATE_FIELD[STATUSES[i]];
    if (f) sets[f] = null;
  }
  for (let i = 1; i <= toIdx; i++) {
    const f = STATUS_DATE_FIELD[STATUSES[i]];
    if (f && !t[f]) sets[f] = today(tz);
  }
  await updateProgress(d, t.progress_id, sets);
  await logEvent(d, enrollment, topicId, 'correction', { from: t.status, to: target, date: today(tz), actor: ctx.userId, payload: { reason: reason.trim() } });
  return getTopicState(d, enrollment, topicId);
}

export async function cycleReviews(d, progressId, cycle) {
  return d.all('SELECT * FROM reviews WHERE progress_id = ? AND cycle = ? AND voided_at IS NULL ORDER BY number', [progressId, cycle]);
}

async function extraReviewsAllowed(d, enrollment) {
  return !!(await d.one('SELECT extra_reviews_allowed FROM students WHERE id = ?', [enrollment.student_id]))?.extra_reviews_allowed;
}

/**
 * Registra uma revisão (Q/R-1..n) com questões e acertos. O percentual é calculado aqui, com a
 * configuração VIGENTE lida nesta mesma transação; a revisão grava versão e valores usados.
 */
export async function registerReview(d, ctx, enrollment, topicId, { questions, correct, date }) {
  const tz = enrollment.student_tz;
  const s = await getSettings(d, enrollment.tenant_id);
  const t = await lockTopicState(d, enrollment, topicId);
  if (t.status === 'consolidated') throw conflict('Conteúdo já consolidado. Não são necessárias novas revisões.', 'already_consolidated');
  if (t.status !== 'review') {
    throw badRequest('Revisões só podem ser registradas quando o conteúdo está na etapa Em revisão (Q + R). Mude a etapa quando decidir iniciar a revisão.', 'not_in_review');
  }
  const extraAllowed = await extraReviewsAllowed(d, enrollment);
  if (t.cycle_locked_at && !extraAllowed) throw conflict(LIMIT_MESSAGE(s.max_reviews_per_cycle), 'review_limit_reached');

  if (!Number.isInteger(questions) || !Number.isInteger(correct)) throw badRequest('Informe números inteiros de questões e acertos.', 'invalid_numbers');
  if (questions < s.min_questions_per_review) {
    throw badRequest(`Cada revisão precisa de no mínimo ${s.min_questions_per_review} questões para gerar um percentual confiável.`, 'min_questions');
  }
  if (questions > MAX_QUESTIONS_PER_REVIEW) throw badRequest(`Máximo de ${MAX_QUESTIONS_PER_REVIEW} questões por revisão.`, 'max_questions');
  if (correct < 0 || correct > questions) throw badRequest('O número de acertos deve estar entre 0 e o número de questões.', 'invalid_correct');

  const existing = await cycleReviews(d, t.progress_id, t.current_cycle);
  const beyondLimit = existing.length >= s.max_reviews_per_cycle;
  if (beyondLimit && !extraAllowed) throw conflict(LIMIT_MESSAGE(s.max_reviews_per_cycle), 'review_limit_reached');

  const reviewDate = date || today(tz);
  const minDate = existing.length ? existing[existing.length - 1].date : t.review_started_at;
  validateEventDate(reviewDate, tz, minDate, 'data da revisão');

  const number = existing.length + 1;
  const threshold = s.consolidation_threshold;
  const consolidates = isConsolidating(correct, questions, threshold);
  const ts = nowIso();
  const review = await d.one(
    `INSERT INTO reviews (tenant_id, student_id, enrollment_id, topic_id, progress_id, cycle, number, date, questions, correct,
                          threshold_used, min_questions_used, config_version, consolidated, extra, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, t.progress_id, t.current_cycle, number, reviewDate, questions, correct,
      threshold, s.min_questions_per_review, s.version, consolidates, beyondLimit, ctx.userId, ts]
  );
  await d.run(
    `INSERT INTO question_logs (tenant_id, student_id, enrollment_id, topic_id, review_id, source, date, questions, correct, created_by, created_at)
     VALUES (?,?,?,?,?,'review',?,?,?,?,?)`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, review.id, reviewDate, questions, correct, ctx.userId, ts]
  );
  const percent = pct(correct, questions);
  await logEvent(d, enrollment, topicId, 'review', {
    date: reviewDate, actor: ctx.userId, from: t.status, to: t.status,
    payload: { review_id: review.id, cycle: t.current_cycle, number, questions, correct, percent, threshold, min_questions: s.min_questions_per_review, config_version: s.version, extra: beyondLimit },
  });

  let outcome;
  if (consolidates) {
    await updateProgress(d, t.progress_id, { status: 'consolidated', consolidated_at: reviewDate, cycle_locked_at: null });
    await logEvent(d, enrollment, topicId, 'consolidated', { from: 'review', to: 'consolidated', date: reviewDate, actor: ctx.userId, payload: { review_id: review.id, cycle: t.current_cycle, number, percent, config_version: s.version } });
    outcome = 'consolidated';
  } else if (number >= s.max_reviews_per_cycle && !extraAllowed) {
    await updateProgress(d, t.progress_id, { cycle_locked_at: ts });
    await logEvent(d, enrollment, topicId, 'cycle_locked', { date: reviewDate, actor: ctx.userId, payload: { cycle: t.current_cycle, max: s.max_reviews_per_cycle } });
    outcome = 'limit_reached';
  } else {
    outcome = beyondLimit ? 'extra' : 'continue';
  }
  const message =
    outcome === 'consolidated'
      ? `Conteúdo consolidado com ${fmtPct(percent)}! Meta atingida, o ciclo de revisões foi encerrado.`
      : outcome === 'limit_reached'
        ? LIMIT_MESSAGE(s.max_reviews_per_cycle)
        : outcome === 'extra'
          ? `Q/R-${number} registrada (revisão extra liberada pela professora): ${fmtPct(percent)}. Para consolidar é preciso MAIS de ${threshold}%.`
          : `Q/R-${number} registrada: ${fmtPct(percent)}. Para consolidar é preciso MAIS de ${threshold}%. Q/R-${number + 1} disponível.`;
  return { review: { ...review, percent }, outcome, message, topic: await getTopicState(d, enrollment, topicId) };
}

/**
 * Desfaz (anula) a última revisão válida do ciclo atual.
 *  - aluno: somente nos primeiros 30 minutos (correção de digitação);
 *  - professora/monitor: a qualquer momento, com motivo.
 * A revisão NÃO é apagada: fica com voided_at, voided_by e motivo.
 */
export async function undoLastReview(d, ctx, enrollment, topicId, { isStaff, reason }) {
  const tz = enrollment.student_tz;
  const t = await lockTopicState(d, enrollment, topicId);
  const last = await d.one('SELECT * FROM reviews WHERE progress_id = ? AND cycle = ? AND voided_at IS NULL ORDER BY number DESC LIMIT 1', [t.progress_id, t.current_cycle]);
  if (!last) throw badRequest('Não há revisão para desfazer no ciclo atual.');
  if (!isStaff) {
    const ageMin = (now().getTime() - new Date(last.created_at).getTime()) / 60000;
    if (ageMin > UNDO_REVIEW_WINDOW_MINUTES) {
      throw forbidden(`A revisão só pode ser desfeita pelo aluno em até ${UNDO_REVIEW_WINDOW_MINUTES} minutos após o registro. Fale com sua professora para corrigir.`);
    }
  } else if (!reason || reason.trim().length < 3) {
    throw badRequest('Informe o motivo da correção.');
  }
  const ts = nowIso();
  const why = reason?.trim() || 'correção pelo aluno';
  await d.run('UPDATE reviews SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [ts, ctx.userId, why, last.id]);
  await d.run('UPDATE question_logs SET voided_at = ?, voided_by = ? WHERE review_id = ?', [ts, ctx.userId, last.id]);
  const sets = {};
  if (t.status === 'consolidated' && last.consolidated) Object.assign(sets, { status: 'review', consolidated_at: null });
  if (t.cycle_locked_at) sets.cycle_locked_at = null;
  if (Object.keys(sets).length) await updateProgress(d, t.progress_id, sets);
  await logEvent(d, enrollment, topicId, 'review_undone', {
    date: today(tz), actor: ctx.userId, from: t.status, to: sets.status || t.status,
    payload: { review_id: last.id, cycle: last.cycle, number: last.number, questions: last.questions, correct: last.correct, reason: why },
  });
  return getTopicState(d, enrollment, topicId);
}

/**
 * Produção de material (P): registra o que foi produzido (resumo, mapa mental...).
 * Na fase 🟢/🟩 conta como atualização do material. A etapa NUNCA muda por aqui.
 */
export async function registerProduction(d, ctx, enrollment, topicId, { kind = 'resumo', note, date } = {}) {
  const tz = enrollment.student_tz;
  if (!PRODUCTION_KINDS.includes(kind)) throw badRequest('Tipo de produção inválido.');
  const t = await lockTopicState(d, enrollment, topicId);
  if (t.status === 'not_started') throw badRequest('Inicie o conteúdo (Assimilação) antes de registrar produção de material.', 'not_started');
  const dt = date || today(tz);
  validateEventDate(dt, tz, t.started_at, 'data da produção');
  const isUpdate = ['review', 'consolidated'].includes(t.status);
  const row = await d.one(
    `INSERT INTO production_logs (tenant_id, student_id, enrollment_id, topic_id, kind, is_update, note, date, created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, topicId, kind, isUpdate, note ? String(note).slice(0, 500) : null, dt, ctx.userId, nowIso()]
  );
  if (isUpdate) await updateProgress(d, t.progress_id, { material_updates: t.material_updates + 1 });
  await logEvent(d, enrollment, topicId, isUpdate ? 'material_updated' : 'production', { from: t.status, to: t.status, date: dt, actor: ctx.userId, payload: { production_id: row.id, kind, note: note ? String(note).slice(0, 500) : null } });
  return { production: row, topic: await getTopicState(d, enrollment, topicId) };
}

/** Compatibilidade: "atualizei o resumo" na fase verde. */
export async function registerMaterialUpdate(d, ctx, enrollment, topicId, { note, kind = 'resumo' } = {}) {
  const t = await getTopicState(d, enrollment, topicId);
  if (!['review', 'consolidated'].includes(t.status)) {
    throw badRequest('A atualização do material é registrada nas fases Em revisão ou Consolidado. Antes disso, registre como produção de material.');
  }
  return registerProduction(d, ctx, enrollment, topicId, { kind, note });
}

export async function voidProduction(d, ctx, enrollment, productionId) {
  const p = await d.one('SELECT * FROM production_logs WHERE id = ? AND enrollment_id = ? AND voided_at IS NULL', [productionId, enrollment.id]);
  if (!p) throw notFound('Registro não encontrado.');
  await d.run('UPDATE production_logs SET voided_at = ?, voided_by = ? WHERE id = ?', [nowIso(), ctx.userId, p.id]);
  if (p.is_update) await d.run('UPDATE topic_progress SET material_updates = GREATEST(material_updates - 1, 0), updated_at = ? WHERE enrollment_id = ? AND topic_id = ?', [nowIso(), enrollment.id, p.topic_id]);
  await logEvent(d, enrollment, p.topic_id, 'production_removed', { date: p.date, actor: ctx.userId, payload: { production_id: p.id, kind: p.kind } });
}

/**
 * RODÍZIO — situação de um conteúdo travado após o limite do ciclo.
 * Critério: todos os OUTROS conteúdos do edital em 🟢 (não travados) receberam ao menos 1 revisão
 * depois do travamento, e existem pelo menos N desses conteúdos.
 */
export async function rotationStatus(d, enrollment, topicId, settings = null) {
  const s = settings || (await getSettings(d, enrollment.tenant_id));
  const t = await getTopicState(d, enrollment, topicId);
  if (!t.cycle_locked_at) return { locked: false };
  const others = await d.all(
    `SELECT t.id, t.name, sb.name AS subject_name,
            (SELECT count(*) FROM reviews r WHERE r.progress_id = p.id AND r.voided_at IS NULL AND r.created_at > ?) AS reviews_since
       FROM topic_progress p JOIN topics t ON t.id = p.topic_id JOIN subjects sb ON sb.id = t.subject_id
      WHERE p.enrollment_id = ? AND p.topic_id <> ? AND t.archived_at IS NULL AND sb.archived_at IS NULL
        AND p.status = 'review' AND p.cycle_locked_at IS NULL`,
    [t.cycle_locked_at, enrollment.id, topicId]
  );
  const reviewed = others.filter((o) => o.reviews_since > 0);
  const pending = others.filter((o) => o.reviews_since === 0);
  const enough = others.length >= s.rotation_min_other_topics;
  const fulfilled = enough && pending.length === 0;
  return {
    locked: true, locked_at: t.cycle_locked_at, cycle: t.current_cycle, mode: s.rotation_mode,
    eligible_count: others.length, reviewed_count: reviewed.length, min_other_topics: s.rotation_min_other_topics,
    pending: pending.map((p) => ({ id: p.id, name: p.name, subject_name: p.subject_name })),
    fulfilled, can_student_release: s.rotation_mode === 'auto' && fulfilled,
    message: fulfilled
      ? s.rotation_mode === 'auto' ? 'Rodízio cumprido. Você já pode iniciar um novo ciclo de revisões deste conteúdo.' : 'Rodízio cumprido. Sua professora pode liberar um novo ciclo de revisões.'
      : !enough
        ? `Avance outros conteúdos até a revisão: é preciso ter pelo menos ${s.rotation_min_other_topics} outros conteúdos em revisão (Q + R) e revisá-los.`
        : `Revise os demais conteúdos em Q + R antes de voltar a este (${reviewed.length} de ${others.length} revisados desde o bloqueio).`,
  };
}

/** Libera um novo ciclo (Q/R-1.. de novo), preservando o histórico. */
export async function releaseCycle(d, ctx, enrollment, topicId, { isStaff }) {
  const tz = enrollment.student_tz;
  const t = await lockTopicState(d, enrollment, topicId);
  if (!t.cycle_locked_at) throw badRequest('Este conteúdo não está com o ciclo travado.');
  const rs = await rotationStatus(d, enrollment, topicId);
  if (!isStaff && !rs.can_student_release) {
    throw forbidden(rs.mode === 'manual' ? 'A liberação de um novo ciclo é feita pela sua professora após o rodízio.' : rs.message);
  }
  await updateProgress(d, t.progress_id, { current_cycle: t.current_cycle + 1, cycle_locked_at: null });
  await logEvent(d, enrollment, topicId, 'cycle_released', { date: today(tz), actor: ctx.userId, payload: { from_cycle: t.current_cycle, to_cycle: t.current_cycle + 1, by: isStaff ? 'professora' : 'rodizio_automatico' } });
  return getTopicState(d, enrollment, topicId);
}

/**
 * Liberação/retirada de "revisões extras" pela professora (aplicada a todas as matrículas do aluno):
 *  - ao liberar: destrava ciclos travados (o aluno pode seguir revisando);
 *  - ao retirar: trava ciclos que já atingiram o limite. Nenhuma revisão existente é alterada.
 */
export async function applyExtraReviewsChange(d, ctx, studentId, allowed) {
  const s = await getSettings(d, ctx.tenantId);
  const rows = await d.all(
    `SELECT p.id, p.enrollment_id, p.topic_id, p.cycle_locked_at, p.current_cycle,
            (SELECT count(*) FROM reviews r WHERE r.progress_id = p.id AND r.cycle = p.current_cycle AND r.voided_at IS NULL) AS n,
            e.tenant_id, e.student_id
       FROM topic_progress p JOIN enrollments e ON e.id = p.enrollment_id
      WHERE p.student_id = ? AND p.status = 'review'`,
    [studentId]
  );
  const ts = nowIso();
  for (const r of rows) {
    const enr = { id: r.enrollment_id, tenant_id: r.tenant_id, student_id: r.student_id };
    if (allowed && r.cycle_locked_at) {
      await updateProgress(d, r.id, { cycle_locked_at: null });
      await logEvent(d, enr, r.topic_id, 'extra_reviews_enabled', { date: ts.slice(0, 10), actor: ctx.userId, payload: { cycle: r.current_cycle } });
    } else if (!allowed && !r.cycle_locked_at && r.n >= s.max_reviews_per_cycle) {
      await updateProgress(d, r.id, { cycle_locked_at: ts });
      await logEvent(d, enr, r.topic_id, 'cycle_locked', { date: ts.slice(0, 10), actor: ctx.userId, payload: { cycle: r.current_cycle, max: s.max_reviews_per_cycle, reason: 'revisões extras retiradas' } });
    }
  }
}
