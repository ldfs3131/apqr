/**
 * Rotas por matrícula (aluno × edital). Toda rota passa por assertEnrollment:
 * aluno só a própria; monitor só alunos atribuídos; professora só o próprio ambiente (RLS).
 */
import { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db/index.js';
import { requireAuth, isStaff } from '../security/auth.js';
import { assertEnrollment, audit } from '../security/access.js';
import { ah, addDays, badRequest, forbidden, isValidDate, parseId, pct, today } from '../lib/util.js';
import { parse } from './auth.js';
import * as A from '../domain/apqr.js';
import * as Stats from '../domain/stats.js';
import * as Study from '../domain/study.js';
import * as Rota from '../domain/rota.js';
import { suggestions, insights } from '../domain/guidance.js';
import { getSettings, getSettingsVersion, publicSettings } from '../domain/settings.js';

const r = Router();
r.use(requireAuth);

/** Executa fn(d, enrollment) com a matrícula validada, numa única transação. */
const withEnrollment = (req, fn) =>
  tx(req.ctx, async (d) => {
    const e = await assertEnrollment(d, req.ctx, parseId(req.params.eid, 'edital'));
    return fn(d, e);
  });
const tid = (req) => parseId(req.params.tid, 'conteúdo');

function periodFrom(req, tz) {
  const t = today(tz);
  const preset = req.query.period;
  let { from, to } = req.query;
  if (preset && preset !== 'custom' && preset !== 'all') {
    const days = { '7d': 7, '30d': 30, '3m': 91, '6m': 182, '12m': 365 }[preset];
    if (!days) throw badRequest('Período inválido.');
    from = addDays(t, -(days - 1));
    to = t;
  }
  if (from && !isValidDate(from)) throw badRequest('Data inicial inválida.');
  if (to && !isValidDate(to)) throw badRequest('Data final inválida.');
  if (from && to && from > to) throw badRequest('A data inicial deve ser anterior à final.');
  return { from: from || null, to: to || null };
}

r.get('/:eid', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => ({ enrollment: e, settings: publicSettings(await getSettings(d, e.tenant_id)) })));
}));

// ───────────── Conteúdos e APQR ─────────────

r.get('/:eid/topics', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const s = await getSettings(d, e.tenant_id);
    return { topics: await Stats.topicRows(d, e, s), settings: publicSettings(s) };
  }));
}));

r.get('/:eid/topics/:tid', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const topic = await A.getTopicState(d, e, tid(req));
    const s = await getSettings(d, e.tenant_id);
    const row = (await Stats.topicRows(d, e, s)).find((x) => x.id === topic.id) || null;
    const reviews = (await d.all('SELECT * FROM reviews WHERE enrollment_id = ? AND topic_id = ? ORDER BY cycle, number, created_at', [e.id, topic.id]))
      .map((x) => ({ ...x, percent: pct(x.correct, x.questions) }));
    const sessions = await d.all('SELECT * FROM study_sessions WHERE enrollment_id = ? AND topic_id = ? AND voided_at IS NULL ORDER BY date DESC, created_at DESC', [e.id, topic.id]);
    const practice = await d.all(`SELECT * FROM question_logs WHERE enrollment_id = ? AND topic_id = ? AND source = 'practice' AND voided_at IS NULL ORDER BY date DESC, created_at DESC`, [e.id, topic.id]);
    const productions = await d.all('SELECT * FROM production_logs WHERE enrollment_id = ? AND topic_id = ? AND voided_at IS NULL ORDER BY date DESC, created_at DESC', [e.id, topic.id]);
    const valid = reviews.filter((x) => !x.voided_at);
    const lastInCycle = valid.filter((x) => x.cycle === topic.current_cycle).pop();
    return {
      topic, row, subject: { id: topic.subject_id, name: topic.subject_name },
      reviews, sessions, practice, productions,
      history: await Stats.topicHistory(d, e.id, topic.id),
      rotation: await A.rotationStatus(d, e, topic.id, s),
      can_undo_review: !!lastInCycle,
      settings: publicSettings(s),
    };
  }));
}));

r.post('/:eid/topics/:tid/status', ah(async (req, res) => {
  const body = parse(z.object({ status: z.enum(A.STATUSES), date: z.string().optional() }), req.body);
  res.json({ topic: await withEnrollment(req, (d, e) => A.changeStatus(d, req.ctx, e, tid(req), body.status, { date: body.date })) });
}));

r.post('/:eid/topics/:tid/correct-status', ah(async (req, res) => {
  if (!isStaff(req.ctx)) throw forbidden('Somente a professora pode corrigir a etapa de um conteúdo.');
  const body = parse(z.object({ status: z.enum(A.STATUSES), reason: z.string() }), req.body);
  res.json({ topic: await withEnrollment(req, async (d, e) => {
    const t = await A.staffCorrectStatus(d, req.ctx, e, tid(req), body.status, { reason: body.reason });
    await audit(d, req.ctx, 'apqr.correct_status', { targetType: 'topic_progress', targetId: t.progress_id, payload: { status: body.status, reason: body.reason } });
    return t;
  }) });
}));

r.post('/:eid/topics/:tid/reviews', ah(async (req, res) => {
  const body = parse(z.object({ questions: z.number(), correct: z.number(), date: z.string().optional() }), req.body);
  res.status(201).json(await withEnrollment(req, (d, e) => A.registerReview(d, req.ctx, e, tid(req), body)));
}));

r.post('/:eid/topics/:tid/reviews/undo', ah(async (req, res) => {
  const body = parse(z.object({ reason: z.string().optional() }), req.body);
  res.json({ topic: await withEnrollment(req, async (d, e) => {
    const staff = isStaff(req.ctx) || req.ctx.platform;
    const t = await A.undoLastReview(d, req.ctx, e, tid(req), { isStaff: staff, reason: body.reason });
    if (staff) await audit(d, req.ctx, 'apqr.undo_review', { targetType: 'topic_progress', targetId: t.progress_id, payload: { reason: body.reason } });
    return t;
  }) });
}));

r.post('/:eid/topics/:tid/material-update', ah(async (req, res) => {
  const body = parse(z.object({ note: z.string().max(500).optional(), kind: z.enum(A.PRODUCTION_KINDS).optional() }), req.body);
  res.json(await withEnrollment(req, (d, e) => A.registerMaterialUpdate(d, req.ctx, e, tid(req), body)));
}));

r.post('/:eid/topics/:tid/productions', ah(async (req, res) => {
  const body = parse(z.object({ kind: z.enum(A.PRODUCTION_KINDS).optional(), note: z.string().max(500).optional(), date: z.string().optional() }), req.body);
  res.status(201).json(await withEnrollment(req, (d, e) => A.registerProduction(d, req.ctx, e, tid(req), body)));
}));

r.delete('/:eid/productions/:pid', ah(async (req, res) => {
  await withEnrollment(req, (d, e) => A.voidProduction(d, req.ctx, e, parseId(req.params.pid, 'registro')));
  res.json({ ok: true });
}));

r.post('/:eid/topics/:tid/release-cycle', ah(async (req, res) => {
  res.json({ topic: await withEnrollment(req, async (d, e) => {
    const staff = isStaff(req.ctx) || req.ctx.platform;
    const t = await A.releaseCycle(d, req.ctx, e, tid(req), { isStaff: staff });
    if (staff) await audit(d, req.ctx, 'apqr.release_cycle', { targetType: 'topic_progress', targetId: t.progress_id });
    return t;
  }) });
}));

// ───────────── Sessões, questões e produção ─────────────

r.get('/:eid/sessions', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const p = periodFrom(req, e.student_tz);
    const params = [e.id];
    let where = 'ss.enrollment_id = ? AND ss.voided_at IS NULL';
    if (p.from) { where += ' AND ss.date >= ?'; params.push(p.from); }
    if (p.to) { where += ' AND ss.date <= ?'; params.push(p.to); }
    const sessions = await d.all(
      `SELECT ss.*, t.name AS topic_name, s.name AS subject_name, t.subject_id FROM study_sessions ss
         JOIN topics t ON t.id = ss.topic_id JOIN subjects s ON s.id = t.subject_id
        WHERE ${where} ORDER BY ss.date DESC, COALESCE(ss.started_at, ss.created_at) DESC LIMIT 500`,
      params
    );
    return { sessions, by_period: await Stats.hoursByPeriod(d, e.id), summary: await Stats.summary(d, e, p) };
  }));
}));

r.post('/:eid/sessions', ah(async (req, res) => {
  const body = parse(z.object({
    topic_id: z.string().uuid(), date: z.string(), duration_minutes: z.number().int(), start_time: z.string().optional().nullable(),
    note: z.string().max(500).optional().nullable(), activity: z.enum(Study.ACTIVITIES).optional(),
  }), req.body);
  const session = await withEnrollment(req, (d, e) => Study.addManualSession(d, req.ctx, e, {
    topicId: body.topic_id, date: body.date, durationMinutes: body.duration_minutes, startTime: body.start_time || null, note: body.note, activity: body.activity,
  }));
  res.status(201).json({ session });
}));

r.delete('/:eid/sessions/:sid', ah(async (req, res) => {
  await withEnrollment(req, (d, e) => Study.voidSession(d, req.ctx, e, parseId(req.params.sid, 'sessão')));
  res.json({ ok: true });
}));

r.get('/:eid/questions', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => ({
    questions: await d.all(
      `SELECT q.*, t.name AS topic_name, s.name AS subject_name FROM question_logs q LEFT JOIN topics t ON t.id = q.topic_id LEFT JOIN subjects s ON s.id = COALESCE(t.subject_id, q.subject_id)
        WHERE q.enrollment_id = ? AND q.voided_at IS NULL ORDER BY q.date DESC, q.created_at DESC LIMIT 500`,
      [e.id]
    ),
  })));
}));

r.post('/:eid/practice', ah(async (req, res) => {
  const body = parse(z.object({ topic_id: z.string().uuid(), date: z.string(), questions: z.number().int(), correct: z.number().int(), note: z.string().max(300).optional().nullable() }), req.body);
  res.status(201).json({ attempt: await withEnrollment(req, (d, e) => Study.addPracticeQuestions(d, req.ctx, e, { topicId: body.topic_id, ...body })) });
}));

r.get('/:eid/route', ah(async (req, res) => {
  res.json({ route: await withEnrollment(req, (d, e) => Rota.routeFor(d, req.ctx, e)) });
}));
r.post('/:eid/route/:rid/accept', ah(async (req, res) => {
  res.json(await withEnrollment(req, (d, e) => Rota.acceptRoute(d, req.ctx, e, parseId(req.params.rid, 'ajuste'))));
}));

r.post('/:eid/questions', ah(async (req, res) => {
  const body = parse(z.object({
    kind: z.enum(['topic', 'subject', 'simulado']), topic_id: z.string().uuid().optional().nullable(), subject_id: z.string().uuid().optional().nullable(),
    name: z.string().max(80).optional().nullable(), date: z.string(), questions: z.number().int(), correct: z.number().int(), note: z.string().max(300).optional().nullable(),
  }), req.body);
  const { topic_id, subject_id, ...rest } = body;
  res.status(201).json({ attempt: await withEnrollment(req, (d, e) => Study.addFreeQuestions(d, req.ctx, e, { ...rest, topicId: topic_id, subjectId: subject_id })) });
}));

r.delete('/:eid/practice/:qid', ah(async (req, res) => {
  await withEnrollment(req, (d, e) => Study.voidPractice(d, req.ctx, e, parseId(req.params.qid, 'registro')));
  res.json({ ok: true });
}));

r.get('/:eid/productions', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => ({
    productions: await d.all(
      `SELECT p.*, t.name AS topic_name, s.name AS subject_name FROM production_logs p JOIN topics t ON t.id = p.topic_id JOIN subjects s ON s.id = t.subject_id
        WHERE p.enrollment_id = ? AND p.voided_at IS NULL ORDER BY p.date DESC, p.created_at DESC LIMIT 500`,
      [e.id]
    ),
  })));
}));

// ───────────── Painéis e análises ─────────────

r.get('/:eid/dashboard', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const t = today(e.student_tz);
    const s = await getSettings(d, e.tenant_id);
    const rows = await Stats.topicRows(d, e, s);
    return {
      summary: await Stats.summary(d, e, { rows }),
      week: await Stats.summary(d, e, { from: addDays(t, -6), to: t, rows }),
      suggestions: await suggestions(d, e, { rows, settings: s }),
      insights: (await insights(d, e, { rows })).slice(0, 4),
      last14: await Stats.dailySeries(d, e.id, addDays(t, -13), t),
      subjects: await Stats.subjectBreakdown(d, e, { rows }),
      settings: publicSettings(s),
    };
  }));
}));

r.get('/:eid/suggestions', ah(async (req, res) => {
  res.json(await withEnrollment(req, (d, e) => suggestions(d, e)));
}));

r.get('/:eid/analytics', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const t = today(e.student_tz);
    let p = periodFrom(req, e.student_tz);
    if (!p.from) {
      const first = (await d.one('SELECT min(date) AS d FROM daily_activity WHERE enrollment_id = ?', [e.id])).d;
      const created = e.created_at.slice(0, 10);
      p = { from: first && first < created ? first : created, to: p.to || t };
    }
    if (!p.to) p.to = t;
    if (p.from > p.to) p.from = p.to;
    const rows = await Stats.topicRows(d, e);
    return {
      period: p,
      summary: await Stats.summary(d, e, { ...p, rows }),
      daily: await Stats.dailySeries(d, e.id, p.from, p.to),
      apqr_series: await Stats.apqrProgressSeries(d, e, p.from, p.to),
      subjects: await Stats.subjectBreakdown(d, e, { ...p, rows }),
      balance: await Stats.balance(d, e, { ...p, rows }),
      review_evolution: await Stats.reviewEvolution(d, e.id),
      insights: await insights(d, e, { rows }),
      settings: publicSettings(await getSettings(d, e.tenant_id)),
    };
  }));
}));

/** Relatório do aluno (página imprimível). Padrão: últimos 30 dias. */
r.get('/:eid/report', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const t = today(e.student_tz);
    let p = periodFrom(req, e.student_tz);
    if (!p.from) p = { from: addDays(t, -29), to: t };
    if (!p.to) p.to = t;
    const s = await getSettings(d, e.tenant_id);
    const rows = await Stats.topicRows(d, e, s);
    const student = await d.one('SELECT u.name, u.email, st.goal FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?', [e.student_id]);
    if (req.ctx.role !== 'student') await audit(d, req.ctx, 'report.view', { targetType: 'enrollment', targetId: e.id });
    return {
      generated_at: new Date().toISOString(),
      student,
      exam: { id: e.edital_id, name: e.edital_name, role_title: e.role_title, board: e.board, exam_date: e.exam_date },
      period: p,
      summary: await Stats.summary(d, e, { ...p, rows }),
      subjects: await Stats.subjectBreakdown(d, e, { ...p, rows }),
      balance: await Stats.balance(d, e, { ...p, rows }),
      daily: await Stats.dailySeries(d, e.id, p.from, p.to),
      review_evolution: await Stats.reviewEvolution(d, e.id),
      attention: Stats.topicPerformance(rows).evaluated.filter((x) => x.status !== 'consolidated').slice(0, 8),
      insights: await insights(d, e, { rows }),
      settings: publicSettings(s),
    };
  }));
}));

/** Desempenho por conteúdo do PRÓPRIO aluno (não é ranking comparativo entre alunos). */
r.get('/:eid/performance', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const s = await getSettings(d, e.tenant_id);
    return { ...Stats.topicPerformance(await Stats.topicRows(d, e, s)), settings: publicSettings(s) };
  }));
}));

r.get('/:eid/history', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => ({ history: await Stats.enrollmentHistory(d, e.id, { ...periodFrom(req, e.student_tz), limit: Number(req.query.limit) || 300 }) })));
}));

/** Regra usada numa revisão antiga (auditável/reprodutível). */
r.get('/:eid/reviews/:rid/rule', ah(async (req, res) => {
  res.json(await withEnrollment(req, async (d, e) => {
    const rv = await d.one('SELECT * FROM reviews WHERE id = ? AND enrollment_id = ?', [parseId(req.params.rid, 'revisão'), e.id]);
    if (!rv) throw badRequest('Revisão não encontrada.');
    return { review: rv, rule: await getSettingsVersion(d, e.tenant_id, rv.config_version) };
  }));
}));

export default r;
