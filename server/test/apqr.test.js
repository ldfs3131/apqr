/**
 * FASE 2 — Núcleo APQR. Cenários de aceitação 1–12 da V1 (portados para o novo modelo),
 * regras do método e o teste de regressão de VERSIONAMENTO exigido pelo dono do produto.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, agent, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { advanceClock, today } from '../src/lib/util.js';
import { tx } from '../src/db/index.js';

let admin, A, B;
const topicsOf = (T) => T.structure.flatMap((s) => s.topics);

before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'pollyana', students: 0, topicsPerSubject: 6 });
  B = await createTenantWithClass(admin.agent, { slug: 'outra', students: 1 });
});
beforeEach(() => resetRateLimits());

/** Aluno novo, matriculado no edital de A. */
async function student() {
  const s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id] });
  const eid = s.enrollments[0].id;
  const api = (p) => `/api/enrollments/${eid}${p}`;
  return { ...s, eid, api };
}
async function toReview(s, topicId) {
  await s.agent.post(s.api(`/topics/${topicId}/status`)).send({ status: 'assimilation' }).expect(200);
  await s.agent.post(s.api(`/topics/${topicId}/status`)).send({ status: 'production' }).expect(200);
  await s.agent.post(s.api(`/topics/${topicId}/status`)).send({ status: 'review' }).expect(200);
}

describe('Cenários de aceitação (V1 portados)', () => {
  test('CENÁRIO 1 — vermelho → iniciar estudo sugere (não muda) → laranja manual', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    const start = await s.agent.post('/api/me/timer/start').send({ enrollment_id: s.eid, topic_id: t.id }).expect(201);
    assert.equal(start.body.suggest_status, 'assimilation');
    assert.equal((await s.agent.get(s.api(`/topics/${t.id}`))).body.topic.status, 'not_started');
    const r = await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'assimilation' }).expect(200);
    assert.equal(r.body.topic.status, 'assimilation');
    assert.equal(r.body.topic.started_at, today());
    await s.agent.post('/api/me/timer/discard').expect(200);
  });

  test('CENÁRIO 2 — finalizar material → amarelo', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'assimilation' }).expect(200);
    const r = await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'production' }).expect(200);
    assert.equal(r.body.topic.status, 'production');
    assert.ok(r.body.topic.material_done_at);
  });

  test('CENÁRIO 3 — 30 questões / 21 acertos = 70% → NÃO consolida', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await toReview(s, t.id);
    const r = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 30, correct: 21 }).expect(201);
    assert.equal(r.body.review.percent, 70);
    assert.equal(r.body.outcome, 'continue');
    assert.equal(r.body.topic.status, 'review');
  });

  test('CENÁRIO 4 — 30/22 = 73,33% → consolida; nova revisão recusada', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await toReview(s, t.id);
    await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 30, correct: 21 }).expect(201);
    const r = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 30, correct: 22 }).expect(201);
    assert.equal(r.body.review.percent, 73.33);
    assert.equal(r.body.outcome, 'consolidated');
    assert.equal(r.body.topic.status, 'consolidated');
    const again = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 30, correct: 10 }).expect(409);
    assert.equal(again.body.error.code, 'already_consolidated');
  });

  test('CENÁRIO 5 — R1 50%, R2 55%, R3 62%, R4 68% → bloqueia R5', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await toReview(s, t.id);
    for (const [q, c] of [[20, 10], [20, 11], [50, 31], [25, 17]]) await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: q, correct: c }).expect(201);
    const detail = (await s.agent.get(s.api(`/topics/${t.id}`))).body;
    assert.deepEqual(detail.reviews.map((r) => r.percent), [50, 55, 62, 68]);
    assert.ok(detail.topic.cycle_locked_at);
    const r5 = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 20 }).expect(409);
    assert.equal(r5.body.error.message, 'Limite de 4 revisões atingido. Avance para os demais conteúdos do edital.');
    assert.equal(detail.row.next_review_number, null);
  });

  test('CENÁRIO 6 — atualizar o material na fase verde mantém o verde; não volta etapa', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await toReview(s, t.id);
    await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 12 }).expect(201);
    const r = await s.agent.post(s.api(`/topics/${t.id}/material-update`)).send({ note: 'Acrescentei exceções' }).expect(200);
    assert.equal(r.body.topic.status, 'review');
    assert.equal(r.body.topic.material_updates, 1);
    const back = await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'production' }).expect(400);
    assert.equal(back.body.error.code, 'no_regression');
  });

  test('CENÁRIO 7 — aluno não acessa matrícula/dados de outro aluno (nem de outro ambiente)', async () => {
    const s = await student();
    const other = await student();
    const t = topicsOf(A)[0];
    const urls = ['', '/topics', `/topics/${t.id}`, '/dashboard', '/analytics', '/performance', '/sessions', '/history', '/questions', '/productions'];
    for (const u of urls) {
      assert.equal((await s.agent.get(other.api(u))).status, 404, `outro aluno ${u}`);
      assert.equal((await s.agent.get(`/api/enrollments/${B.students[0].enrollments[0].id}${u}`)).status, 404, `outro ambiente ${u}`);
    }
    assert.equal((await s.agent.post(other.api(`/topics/${t.id}/status`)).send({ status: 'assimilation' })).status, 404);
    assert.equal((await s.agent.post(other.api('/sessions')).send({ topic_id: t.id, date: today(), duration_minutes: 30 })).status, 404);
    assert.equal((await s.agent.post('/api/me/timer/start').send({ enrollment_id: other.eid, topic_id: t.id })).status, 404);
    // conteúdo de OUTRO edital dentro da própria matrícula também falha
    const tB = topicsOf(B)[0];
    assert.equal((await s.agent.post(s.api(`/topics/${tB.id}/status`)).send({ status: 'assimilation' })).status, 404);
    assert.equal((await s.agent.post(s.api('/sessions')).send({ topic_id: tB.id, date: today(), duration_minutes: 30 })).status, 404);
    assert.equal((await agent().get(s.api(''))).status, 401);
  });

  test('CENÁRIO 8 — cronômetro: iniciar, pausar, continuar, finalizar', async () => {
    const s = await student();
    const t = topicsOf(A)[1];
    await s.agent.post('/api/me/timer/start').send({ enrollment_id: s.eid, topic_id: t.id, activity: 'assimilation' }).expect(201);
    advanceClock(25 * 60_000);
    const p = await s.agent.post('/api/me/timer/pause').expect(200);
    assert.equal(p.body.timer.elapsed_seconds, 1500);
    advanceClock(10 * 60_000);
    assert.equal((await s.agent.get('/api/me/timer')).body.timer.elapsed_seconds, 1500);
    await s.agent.post('/api/me/timer/resume').expect(200);
    advanceClock(20 * 60_000);
    const f = await s.agent.post('/api/me/timer/finish').send({}).expect(200);
    assert.equal(f.body.saved, true);
    assert.equal(f.body.session.duration_seconds, 45 * 60);
    assert.equal(f.body.session.activity, 'assimilation');
    assert.equal(f.body.session.enrollment_id, s.eid);
    assert.equal((await s.agent.get('/api/me/timer')).body.timer, null);
    const row = (await s.agent.get(s.api('/topics'))).body.topics.find((x) => x.id === t.id);
    assert.equal(row.study_seconds, 2700);
  });

  test('CENÁRIO 9 — registro manual entra no histórico e nas horas; validações', async () => {
    const s = await student();
    const t = topicsOf(A)[0];
    await s.agent.post(s.api('/sessions')).send({ topic_id: t.id, date: today(), duration_minutes: 90 }).expect(201);
    await s.agent.post(s.api('/sessions')).send({ topic_id: t.id, date: today(), duration_minutes: 30, start_time: '19:00', activity: 'questions' }).expect(201);
    const ss = (await s.agent.get(s.api('/sessions'))).body;
    assert.equal(ss.sessions.length, 2);
    assert.equal(ss.summary.study_seconds, 7200);
    const detail = (await s.agent.get(s.api(`/topics/${t.id}`))).body;
    assert.equal(detail.history.filter((h) => h.event_type === 'study_session').length, 2);
    await s.agent.post(s.api('/sessions')).send({ topic_id: t.id, date: '2999-01-01', duration_minutes: 30 }).expect(400);
    await s.agent.post(s.api('/sessions')).send({ topic_id: t.id, date: today(), duration_minutes: 0 }).expect(400);
    // anular não apaga: some das horas, fica no histórico
    await s.agent.delete(s.api(`/sessions/${ss.sessions[0].id}`)).expect(200);
    assert.equal((await s.agent.get(s.api('/sessions'))).body.summary.study_seconds, 7200 - ss.sessions[0].duration_seconds);
    const hist = (await s.agent.get(s.api('/history'))).body.history;
    assert.ok(hist.some((h) => h.event_type === 'study_session_removed'));
  });

  test('CENÁRIO 10 — dois editais do mesmo aluno com dados separados', async () => {
    const s = await student();
    const ed2 = (await A.teacher.post('/api/teacher/editais').send({ name: 'CRF-DF' })).body.edital;
    await A.teacher.post(`/api/teacher/editais/${ed2.id}/subjects`).send({ name: 'Português', topics: ['Regência', 'Concordância'] }).expect(201);
    const e2 = (await A.teacher.post(`/api/teacher/students/${s.studentId}/enrollments`).send({ edital_id: ed2.id })).body.enrollment_id;
    const t = topicsOf(A)[0];
    await s.agent.post(s.api('/sessions')).send({ topic_id: t.id, date: today(), duration_minutes: 60 }).expect(201);
    await toReview(s, t.id);
    await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 18 }).expect(201);
    const da = (await s.agent.get(s.api('/dashboard'))).body.summary;
    const db = (await s.agent.get(`/api/enrollments/${e2}/dashboard`)).body.summary;
    assert.equal(da.study_seconds, 3600);
    assert.equal(db.study_seconds, 0);
    assert.equal(da.counts.consolidated, 1);
    assert.equal(db.counts.consolidated, 0);
    assert.equal(db.total_topics, 2);
    assert.equal(da.questions, 20);
    assert.equal(db.questions, 0);
    assert.equal((await s.agent.post(`/api/enrollments/${e2}/sessions`).send({ topic_id: t.id, date: today(), duration_minutes: 10 })).status, 404);
  });

  test('CENÁRIO 11 — alterar a rotina semanal atualiza o mapa; sobreposição recusada', async () => {
    const s = await student();
    await s.agent.put('/api/me/routine').send({ blocks: [
      { weekday: 0, start_min: 1140, end_min: 1260, category: 'estudo' }, { weekday: 0, start_min: 480, end_min: 1020, category: 'trabalho' },
      { weekday: 5, start_min: 480, end_min: 660, category: 'estudo' },
    ] }).expect(200);
    let r = (await s.agent.get('/api/me/routine')).body.routine;
    assert.equal(r.weekly_study_minutes, 300);
    await s.agent.put('/api/me/routine').send({ blocks: [{ weekday: 0, start_min: 1140, end_min: 1200, category: 'estudo' }, { weekday: 6, start_min: 540, end_min: 660, category: 'estudo' }] }).expect(200);
    r = (await s.agent.get('/api/me/routine')).body.routine;
    assert.equal(r.weekly_study_minutes, 180);
    assert.equal(r.study_minutes_per_day[6], 120);
    const bad = await s.agent.put('/api/me/routine').send({ blocks: [{ weekday: 1, start_min: 600, end_min: 700, category: 'estudo' }, { weekday: 1, start_min: 650, end_min: 800, category: 'trabalho' }] }).expect(400);
    assert.equal(bad.body.error.code, 'overlap');
  });

  test('CENÁRIO 12 — desempenho por conteúdo ordena pelo % atual; sem avaliação separado', async () => {
    const s = await student();
    const ts = topicsOf(A).slice(0, 5);
    const results = [[20, 13], [20, 9], [20, 11]]; // 65, 45, 55
    for (const [i, t] of ts.slice(0, 3).entries()) {
      await toReview(s, t.id);
      await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: results[i][0], correct: results[i][1] }).expect(201);
    }
    const rk = (await s.agent.get(s.api('/performance'))).body;
    assert.deepEqual(rk.evaluated.map((x) => x.last_percent), [45, 55, 65]);
    assert.deepEqual(rk.evaluated.map((x) => x.name), [ts[1].name, ts[2].name, ts[0].name]);
    assert.ok(rk.unevaluated.length >= 2 && rk.unevaluated.every((x) => x.last_percent === null));
  });
});

describe('Regras do método', () => {
  test('mínimo de questões vigente; revisão só no verde; consolidação nunca manual', async () => {
    const s = await student();
    const t = topicsOf(A)[2];
    const early = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 20 });
    assert.equal(early.body.error.code, 'not_in_review');
    await toReview(s, t.id);
    const few = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 19, correct: 19 });
    assert.equal(few.body.error.code, 'min_questions');
    const man = await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'consolidated' });
    assert.equal(man.body.error.code, 'manual_consolidation');
    const fut = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 15, date: '2999-01-01' });
    assert.equal(fut.body.error.code, 'future_date');
  });

  test('pular etapas com data retroativa (nunca futura); aluno não volta etapa', async () => {
    const s = await student();
    const t = topicsOf(A)[3];
    const r = await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'review', date: '2026-08-01' }).expect(200);
    assert.equal(r.body.topic.started_at, '2026-08-01');
    assert.equal(r.body.topic.material_done_at, '2026-08-01');
    assert.equal(r.body.topic.review_started_at, '2026-08-01');
    const t2 = topicsOf(A)[4];
    assert.equal((await s.agent.post(s.api(`/topics/${t2.id}/status`)).send({ status: 'assimilation', date: '2999-01-01' })).body.error.code, 'future_date');
    for (const st of ['not_started', 'assimilation', 'production']) {
      assert.equal((await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: st })).body.error.code, 'no_regression');
    }
  });

  test('professora corrige etapa com motivo, só sem revisões; aluno não pode corrigir', async () => {
    const s = await student();
    const t = topicsOf(A)[5];
    await toReview(s, t.id);
    assert.equal((await s.agent.post(s.api(`/topics/${t.id}/correct-status`)).send({ status: 'assimilation', reason: 'engano' })).status, 403);
    assert.equal((await A.teacher.post(s.api(`/topics/${t.id}/correct-status`)).send({ status: 'assimilation' })).status, 400);
    const ok = await A.teacher.post(s.api(`/topics/${t.id}/correct-status`)).send({ status: 'assimilation', reason: 'Marcou por engano' }).expect(200);
    assert.equal(ok.body.topic.status, 'assimilation');
    assert.equal(ok.body.topic.material_done_at, null);
    await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'review' }).expect(200);
    await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 10 }).expect(201);
    assert.equal((await A.teacher.post(s.api(`/topics/${t.id}/correct-status`)).send({ status: 'production', reason: 'x y z' })).body.error.code, 'has_reviews');
  });

  test('desfazer: aluno só em 30 min; professora depois, com motivo; anula (não apaga) e desfaz consolidação', async () => {
    const s = await student();
    const t = topicsOf(A)[6];
    await toReview(s, t.id);
    const r = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 18 }).expect(201);
    assert.equal(r.body.outcome, 'consolidated');
    advanceClock(31 * 60_000);
    assert.equal((await s.agent.post(s.api(`/topics/${t.id}/reviews/undo`)).send({})).status, 403);
    assert.equal((await A.teacher.post(s.api(`/topics/${t.id}/reviews/undo`)).send({})).status, 400);
    const u = await A.teacher.post(s.api(`/topics/${t.id}/reviews/undo`)).send({ reason: 'Digitou errado' }).expect(200);
    assert.equal(u.body.topic.status, 'review');
    const row = await tx({ tenantId: A.tenant.id }, (d) => d.one('SELECT voided_at, void_reason FROM reviews WHERE id = ?', [r.body.review.id]));
    assert.ok(row.voided_at, 'revisão anulada, não apagada');
    assert.equal(row.void_reason, 'Digitou errado');
    const q = (await s.agent.get(s.api('/dashboard'))).body.summary;
    assert.equal(q.questions, 0, 'questões da revisão anulada saem das contas');
    // o slot R1 volta a ficar livre
    const again = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 10 }).expect(201);
    assert.equal(again.body.review.number, 1);
  });

  test('rodízio manual: após R4 o ciclo trava; só a professora libera novo ciclo', async () => {
    const s = await student();
    const t = topicsOf(A)[7];
    await toReview(s, t.id);
    for (let i = 0; i < 4; i++) await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 10 }).expect(201);
    assert.equal((await s.agent.post(s.api(`/topics/${t.id}/release-cycle`))).status, 403);
    const rel = await A.teacher.post(s.api(`/topics/${t.id}/release-cycle`)).expect(200);
    assert.equal(rel.body.topic.current_cycle, 2);
    const r = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 12 }).expect(201);
    assert.equal(r.body.review.number, 1);
    assert.equal(r.body.review.cycle, 2);
  });

  test('revisões extras: liberadas pela professora permitem R5+; retiradas voltam a travar', async () => {
    const s = await student();
    const t = topicsOf(A)[8];
    await toReview(s, t.id);
    for (let i = 0; i < 4; i++) await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 10 }).expect(201);
    assert.equal((await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 10 })).status, 409);
    await A.teacher.patch(`/api/teacher/students/${s.studentId}`).send({ extra_reviews_allowed: true }).expect(200);
    const r5 = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 12 }).expect(201);
    assert.equal(r5.body.review.number, 5);
    assert.equal(r5.body.review.extra, true);
    assert.equal(r5.body.outcome, 'extra');
    // consolidação continua exigindo a regra vigente (>70% e mínimo de questões)
    assert.equal((await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 19, correct: 19 })).body.error.code, 'min_questions');
    await A.teacher.patch(`/api/teacher/students/${s.studentId}`).send({ extra_reviews_allowed: false }).expect(200);
    const blocked = await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 20 });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'review_limit_reached');
  });

  test('questões avulsas contam no desempenho e não mudam etapa; produção não muda etapa', async () => {
    const s = await student();
    const t = topicsOf(A)[9];
    await s.agent.post(s.api(`/topics/${t.id}/status`)).send({ status: 'assimilation' }).expect(200);
    await s.agent.post(s.api('/practice')).send({ topic_id: t.id, date: today(), questions: 10, correct: 7 }).expect(201);
    const p = await s.agent.post(s.api(`/topics/${t.id}/productions`)).send({ kind: 'mapa_mental', note: 'Mapa dos anti-hipertensivos' }).expect(201);
    assert.equal(p.body.topic.status, 'assimilation');
    assert.equal(p.body.production.is_update, false);
    const sum = (await s.agent.get(s.api('/dashboard'))).body.summary;
    assert.equal(sum.questions, 10);
    assert.equal(sum.correct, 7);
    assert.equal(sum.wrong, 3);
    assert.equal(sum.productions, 1);
    assert.equal((await s.agent.post(s.api(`/topics/${topicsOf(A)[10].id}/productions`)).send({ kind: 'resumo' })).body.error.code, 'not_started');
  });

  test('questões livres: por matéria, simulado misto e treino mesmo em conteúdo consolidado; não mudam etapa', async () => {
    const s = await student();
    const t = topicsOf(A)[11];
    const subj = (await s.agent.get(s.api('/topics'))).body.topics.find((x) => x.id === t.id).subject_id;
    await s.agent.post(s.api('/questions')).send({ kind: 'subject', subject_id: subj, date: today(), questions: 20, correct: 14 }).expect(201);
    const sim = await s.agent.post(s.api('/questions')).send({ kind: 'simulado', name: 'Simulado 1', date: today(), questions: 50, correct: 30 }).expect(201);
    assert.equal(sim.body.attempt.source, 'simulado');
    // consolida o conteúdo e continua podendo lançar treino por tema
    await toReview(s, t.id);
    await s.agent.post(s.api(`/topics/${t.id}/reviews`)).send({ questions: 20, correct: 19 }).expect(201);
    await s.agent.post(s.api('/questions')).send({ kind: 'topic', topic_id: t.id, date: today(), questions: 10, correct: 9 }).expect(201);
    assert.equal((await s.agent.post(s.api('/questions')).send({ kind: 'subject', date: today(), questions: 5, correct: 1 })).status, 400);
    assert.equal((await s.agent.post(s.api('/questions')).send({ kind: 'simulado', date: today(), questions: 5, correct: 6 })).status, 400);
    const sum = (await s.agent.get(s.api('/dashboard'))).body.summary;
    assert.equal(sum.questions, 20 + 50 + 20 + 10);
    const list = (await s.agent.get(s.api('/questions'))).body.questions;
    assert.equal(list.length, 4);
    await s.agent.delete(s.api(`/practice/${sim.body.attempt.id}`)).expect(200);
    assert.equal((await s.agent.get(s.api('/questions'))).body.questions.length, 3);
  });

  test('foto de perfil: aluno envia, equipe e o próprio aluno veem, outro aluno não; SVG recusado', async () => {
    const s = await student();
    const other = await student();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    await s.agent.post('/api/me/photo?name=eu.svg').set('Content-Type', 'application/octet-stream').send(Buffer.from('<svg onload="x"></svg>')).expect(400);
    const up = await s.agent.post('/api/me/photo?name=eu.png').set('Content-Type', 'application/octet-stream').send(png).expect(201);
    const id = up.body.photo_file_id;
    assert.equal((await s.agent.get('/api/auth/me')).body.user.photo_file_id, id);
    await s.agent.get(`/api/files/${id}`).expect(200);
    await A.teacher.get(`/api/files/${id}`).expect(200);
    await other.agent.get(`/api/files/${id}`).expect(404);
    assert.equal((await A.teacher.get(`/api/teacher/students/${s.studentId}/xray`)).body.student.photo_file_id, id);
    await s.agent.delete('/api/me/photo').expect(200);
    assert.equal((await s.agent.get('/api/auth/me')).body.user.photo_file_id, null);
  });

  test('cronômetro: um por vez, <1 min não salva, ajuste só para menos', async () => {
    const s = await student();
    const [t1, t2] = topicsOf(A);
    await s.agent.post('/api/me/timer/start').send({ enrollment_id: s.eid, topic_id: t1.id }).expect(201);
    assert.equal((await s.agent.post('/api/me/timer/start').send({ enrollment_id: s.eid, topic_id: t2.id })).body.error.code, 'timer_active');
    advanceClock(30_000);
    assert.equal((await s.agent.post('/api/me/timer/finish').send({})).body.saved, false);
    await s.agent.post('/api/me/timer/start').send({ enrollment_id: s.eid, topic_id: t1.id }).expect(201);
    advanceClock(3600_000);
    assert.equal((await s.agent.post('/api/me/timer/finish').send({ adjusted_seconds: 7200 })).status, 400);
    const f = await s.agent.post('/api/me/timer/finish').send({ adjusted_seconds: 1800 }).expect(200);
    assert.equal(f.body.session.duration_seconds, 1800);
  });

  test('exportação dos próprios dados (LGPD) só do próprio aluno', async () => {
    const s = await student();
    const ex = await s.agent.get('/api/me/export').expect(200);
    assert.equal(ex.body.profile.email, s.email);
    assert.ok(Array.isArray(ex.body.reviews));
    assert.equal((await A.teacher.get('/api/me/export')).status, 403);
  });
});

/**
 * REGRESSÃO OBRIGATÓRIA — versionamento da configuração APQR (pedido do dono do produto).
 * Não simplificar para "copiar valores atuais": o histórico precisa ser auditável e reproduzível.
 */
describe('Regressão: configuração versionada não altera o histórico', () => {
  test('consolidação com v1 (20q, >70%) permanece intacta após mudar para 30q (v2)', async () => {
    const T = await createTenantWithClass(admin.agent, { slug: `versao-${Date.now()}`, students: 1, topicsPerSubject: 2 });
    const s = T.students[0];
    const eid = s.enrollments[0].id;
    const api = (p) => `/api/enrollments/${eid}${p}`;
    const [t1, t2] = T.structure.flatMap((x) => x.topics);
    const ctx = { tenantId: T.tenant.id };

    // 1. Configuração inicial: mínimo 20 questões e >70%
    const cfg1 = (await T.teacher.get('/api/teacher/settings')).body.settings;
    assert.equal(cfg1.version, 1);
    assert.equal(cfg1.min_questions_per_review, 20);
    assert.equal(cfg1.consolidation_threshold, 70);

    // 2. Um conteúdo atinge os critérios e é consolidado usando a versão 1
    for (const st of ['assimilation', 'production', 'review']) await s.agent.post(api(`/topics/${t1.id}/status`)).send({ status: st }).expect(200);
    const c = await s.agent.post(api(`/topics/${t1.id}/reviews`)).send({ questions: 20, correct: 15 }).expect(201); // 75%
    assert.equal(c.body.outcome, 'consolidated');
    assert.equal(c.body.review.config_version, 1);
    const before = await tx(ctx, (d) => d.one('SELECT * FROM reviews WHERE id = ?', [c.body.review.id]));
    const progressBefore = await tx(ctx, (d) => d.one('SELECT status, consolidated_at, updated_at FROM topic_progress WHERE topic_id = ? AND enrollment_id = ?', [t1.id, eid]));

    // 3. Alterar a configuração para mínimo 30 questões (pela interface/API)
    const upd = await T.teacher.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 30 }, reason: 'Aumentar rigor', confirm: true }).expect(200);
    assert.equal(upd.body.settings.version, 2);
    assert.equal(upd.body.settings.min_questions_per_review, 30);

    // 4. Registrar nova atividade/revisão (em outro conteúdo) — 20 questões agora é recusado; 30 é aceito
    for (const st of ['assimilation', 'production', 'review']) await s.agent.post(api(`/topics/${t2.id}/status`)).send({ status: st }).expect(200);
    const refused = await s.agent.post(api(`/topics/${t2.id}/reviews`)).send({ questions: 20, correct: 20 });
    assert.equal(refused.body.error.code, 'min_questions');
    const n = await s.agent.post(api(`/topics/${t2.id}/reviews`)).send({ questions: 30, correct: 18 }).expect(201); // 60%

    // 5. A consolidação anterior continua exatamente como estava
    const detail1 = (await s.agent.get(api(`/topics/${t1.id}`))).body;
    assert.equal(detail1.topic.status, 'consolidated');
    const progressAfter = await tx(ctx, (d) => d.one('SELECT status, consolidated_at, updated_at FROM topic_progress WHERE topic_id = ? AND enrollment_id = ?', [t1.id, eid]));
    assert.deepEqual(progressAfter, progressBefore);

    // 6. A nova revisão usa a versão 2 da configuração
    assert.equal(n.body.review.config_version, 2);
    assert.equal(n.body.review.min_questions_used, 30);
    assert.equal(n.body.review.threshold_used, 70);

    // 7. No banco, a revisão antiga mantém versão, mínimo e percentual originais (linha idêntica)
    const after = await tx(ctx, (d) => d.one('SELECT * FROM reviews WHERE id = ?', [c.body.review.id]));
    assert.deepEqual(after, before);
    assert.equal(after.config_version, 1);
    assert.equal(after.min_questions_used, 20);
    assert.equal(after.threshold_used, 70);
    assert.equal(after.questions, 20);
    assert.equal(after.consolidated, true);
    // e a regra usada é reproduzível: a versão 1 continua consultável
    const rule = (await s.agent.get(api(`/reviews/${c.body.review.id}/rule`))).body.rule;
    assert.equal(rule.version, 1);
    assert.equal(rule.min_questions_per_review, 20);

    // 8. Tentar alterar ou excluir a configuração antiga: o banco recusa
    await assert.rejects(tx(ctx, (d) => d.run("UPDATE methodology_configs SET params = jsonb_set(params, '{min_questions_per_review}', '5') WHERE tenant_id = ? AND version = 1", [T.tenant.id])), /somente inclusão/);
    await assert.rejects(tx(ctx, (d) => d.run('DELETE FROM methodology_configs WHERE tenant_id = ? AND version = 1', [T.tenant.id])), /somente inclusão/);
    const v1 = await tx(ctx, (d) => d.one('SELECT params FROM methodology_configs WHERE tenant_id = ? AND version = 1', [T.tenant.id]));
    assert.equal(v1.params.min_questions_per_review, 20);
  });
});
