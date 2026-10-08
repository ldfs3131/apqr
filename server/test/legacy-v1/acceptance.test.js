/**
 * CRITÉRIOS DE ACEITAÇÃO (seção 34 do briefing) — cenários 1 a 12.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, loginAdmin, newStudent, examWithTopics, toReview } from './helpers.js';
import { advanceClock, today } from '../src/lib/util.js';

let app, admin, aluno;

beforeEach(async () => {
  app = freshApp();
  admin = await loginAdmin(app);
  aluno = await newStudent(app, admin);
});

describe('Cenários de aceitação', () => {
  test('CENÁRIO 1 — tópico vermelho → iniciar estudo → laranja', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    assert.equal(t.status, 'not_started');
    const start = await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: t.id }).expect(201);
    // Iniciar estudo NÃO muda status sozinho, apenas sugere
    assert.equal(start.body.suggest_status, 'assimilation');
    const before = await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200);
    assert.equal(before.body.topic.status, 'not_started');
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'assimilation' }).expect(200);
    assert.equal(r.body.topic.status, 'assimilation');
    assert.equal(r.body.topic.started_at, today());
  });

  test('CENÁRIO 2 — finalizar material → amarelo', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'assimilation' }).expect(200);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'production' }).expect(200);
    assert.equal(r.body.topic.status, 'production');
    assert.ok(r.body.topic.material_done_at);
  });

  test('CENÁRIO 3 — verde, 30 questões / 21 acertos = 70% → NÃO consolida', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 30, correct: 21 }).expect(201);
    assert.equal(r.body.review.percent, 70);
    assert.equal(r.body.outcome, 'continue');
    assert.equal(r.body.topic.status, 'review');
    assert.equal(r.body.review.number, 1);
  });

  test('CENÁRIO 4 — 30 questões / 22 acertos = 73,33% → consolida automaticamente', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 30, correct: 21 }).expect(201);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 30, correct: 22 }).expect(201);
    assert.equal(r.body.review.percent, 73.33);
    assert.equal(r.body.outcome, 'consolidated');
    assert.equal(r.body.topic.status, 'consolidated');
    // Consolidado encerra o ciclo: nova revisão é recusada
    const again = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 30, correct: 10 }).expect(409);
    assert.equal(again.body.error.code, 'already_consolidated');
  });

  test('CENÁRIO 5 — R1 50%, R2 55%, R3 62%, R4 68% → bloqueia R5', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    for (const [q, c] of [[20, 10], [20, 11], [50, 31], [25, 17]]) {
      await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: q, correct: c }).expect(201);
    }
    const detail = await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200);
    assert.deepEqual(detail.body.reviews.map((r) => r.percent), [50, 55, 62, 68]);
    assert.equal(detail.body.topic.status, 'review');
    assert.ok(detail.body.topic.cycle_locked_at);
    const r5 = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 20 }).expect(409);
    assert.equal(r5.body.error.message, 'Limite de 4 revisões atingido. Avance para os demais tópicos do edital.');
    assert.equal(detail.body.row.next_review_number, null);
  });

  test('CENÁRIO 6 — atualizar o resumo na fase verde mantém o verde', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 12 }).expect(201);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/material-update`, { note: 'Acrescentei exceções da crase' }).expect(200);
    assert.equal(r.body.topic.status, 'review');
    assert.equal(r.body.topic.material_updates, 1);
    // E o aluno não consegue voltar para amarelo
    const back = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'production' }).expect(400);
    assert.equal(back.body.error.code, 'no_regression');
  });

  test('CENÁRIO 7 — aluno não acessa edital/dados de outro aluno', async () => {
    const outro = await newStudent(app, admin);
    const { examId, topics } = await examWithTopics(outro, ['Segredo']);
    const t = topics[0];
    const urls = [
      `/api/exams/${examId}`, `/api/exams/${examId}/structure`, `/api/exams/${examId}/topics`, `/api/exams/${examId}/topics/${t.id}`,
      `/api/exams/${examId}/dashboard`, `/api/exams/${examId}/analytics`, `/api/exams/${examId}/ranking`, `/api/exams/${examId}/sessions`,
      `/api/exams/${examId}/history`, `/api/exams/${examId}/report`, `/api/exams/${examId}/plan`,
    ];
    for (const u of urls) await aluno.get(u).expect(404);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'assimilation' }).expect(404);
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: t.id, date: today(), duration_minutes: 30 }).expect(404);
    await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: t.id }).expect(404);
    // Tentar usar tópico de outro aluno dentro do PRÓPRIO edital também falha
    const mine = await examWithTopics(aluno);
    await aluno.post(`/api/exams/${mine.examId}/topics/${t.id}/status`, { status: 'assimilation' }).expect(404);
    await aluno.post(`/api/exams/${mine.examId}/sessions`, { topic_id: t.id, date: today(), duration_minutes: 30 }).expect(404);
    // Listagem não vaza editais alheios; área admin bloqueada
    const list = await aluno.get('/api/exams').expect(200);
    assert.ok(list.body.exams.every((e) => e.id !== examId));
    await aluno.get('/api/admin/students').expect(403);
    // Sem login: 401
    const anon = (await import('supertest')).default(app);
    await anon.get(`/api/exams/${examId}`).expect(401);
  });

  test('CENÁRIO 8 — cronômetro: iniciar, pausar, continuar, finalizar', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: t.id }).expect(201);
    advanceClock(25 * 60_000); // 25 min estudando
    const p = await aluno.post('/api/me/timer/pause').expect(200);
    assert.equal(p.body.timer.state, 'paused');
    assert.equal(p.body.timer.elapsed_seconds, 1500);
    advanceClock(10 * 60_000); // 10 min pausado (não conta)
    const still = await aluno.get('/api/me/timer').expect(200);
    assert.equal(still.body.timer.elapsed_seconds, 1500);
    await aluno.post('/api/me/timer/resume').expect(200);
    advanceClock(20 * 60_000); // +20 min
    const f = await aluno.post('/api/me/timer/finish', {}).expect(200);
    assert.equal(f.body.saved, true);
    assert.equal(f.body.session.duration_seconds, 45 * 60);
    assert.equal(f.body.session.source, 'timer');
    assert.equal(f.body.session.topic_id, t.id);
    assert.equal(f.body.session.exam_id, examId);
    assert.ok(f.body.session.started_at && f.body.session.ended_at);
    const after = await aluno.get('/api/me/timer').expect(200);
    assert.equal(after.body.timer, null);
    const row = (await aluno.get(`/api/exams/${examId}/topics`).expect(200)).body.topics[0];
    assert.equal(row.study_seconds, 2700);
  });

  test('CENÁRIO 9 — registro manual aparece no histórico e soma às horas', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: t.id, date: today(), duration_minutes: 90 }).expect(201);
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: t.id, date: today(), duration_minutes: 30, start_time: '19:00' }).expect(201);
    const s = await aluno.get(`/api/exams/${examId}/sessions`).expect(200);
    assert.equal(s.body.sessions.length, 2);
    assert.equal(s.body.summary.study_seconds, 120 * 60);
    const detail = await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200);
    assert.equal(detail.body.row.study_seconds, 7200);
    assert.equal(detail.body.history.filter((h) => h.event_type === 'study_session').length, 2);
    const hist = await aluno.get(`/api/exams/${examId}/history`).expect(200);
    assert.ok(hist.body.history.some((h) => h.event_type === 'study_session' && h.payload.source === 'manual'));
    // Validações: data futura e duração inválida
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: t.id, date: '2999-01-01', duration_minutes: 30 }).expect(400);
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: t.id, date: today(), duration_minutes: 0 }).expect(400);
  });

  test('CENÁRIO 10 — dois editais do mesmo aluno com dados separados', async () => {
    const a = await examWithTopics(aluno, ['Crase'], 'Português', 'SES-GO');
    const b = await examWithTopics(aluno, ['Regência', 'Concordância'], 'Português', 'CRF-DF');
    await aluno.post(`/api/exams/${a.examId}/sessions`, { topic_id: a.topics[0].id, date: today(), duration_minutes: 60 }).expect(201);
    await toReview(aluno, a.examId, a.topics[0].id);
    await aluno.post(`/api/exams/${a.examId}/topics/${a.topics[0].id}/reviews`, { questions: 20, correct: 18 }).expect(201);
    const da = (await aluno.get(`/api/exams/${a.examId}/dashboard`).expect(200)).body.summary;
    const db = (await aluno.get(`/api/exams/${b.examId}/dashboard`).expect(200)).body.summary;
    assert.equal(da.study_seconds, 3600);
    assert.equal(db.study_seconds, 0);
    assert.equal(da.counts.consolidated, 1);
    assert.equal(db.counts.consolidated, 0);
    assert.equal(db.total_topics, 2);
    assert.equal(da.questions, 20);
    assert.equal(db.questions, 0);
    // Tópico de um edital não pode ser usado em outro
    await aluno.post(`/api/exams/${b.examId}/sessions`, { topic_id: a.topics[0].id, date: today(), duration_minutes: 10 }).expect(404);
  });

  test('CENÁRIO 11 — alterar a rotina semanal atualiza o mapa', async () => {
    await aluno.put('/api/me/routine', { blocks: [
      { weekday: 0, start_min: 19 * 60, end_min: 21 * 60, category: 'estudo' },
      { weekday: 0, start_min: 8 * 60, end_min: 17 * 60, category: 'trabalho' },
      { weekday: 5, start_min: 8 * 60, end_min: 11 * 60, category: 'estudo' },
    ] }).expect(200);
    let r = (await aluno.get('/api/me/routine').expect(200)).body.routine;
    assert.equal(r.weekly_study_minutes, 300);
    assert.equal(r.study_minutes_per_day[0], 120);
    await aluno.put('/api/me/routine', { blocks: [
      { weekday: 0, start_min: 19 * 60, end_min: 20 * 60, category: 'estudo' },
      { weekday: 6, start_min: 9 * 60, end_min: 11 * 60, category: 'estudo' },
    ] }).expect(200);
    r = (await aluno.get('/api/me/routine').expect(200)).body.routine;
    assert.equal(r.weekly_study_minutes, 180);
    assert.equal(r.study_minutes_per_day[0], 60);
    assert.equal(r.study_minutes_per_day[5], 0);
    assert.equal(r.study_minutes_per_day[6], 120);
    // Sobreposição é recusada
    const bad = await aluno.put('/api/me/routine', { blocks: [
      { weekday: 1, start_min: 600, end_min: 700, category: 'estudo' },
      { weekday: 1, start_min: 650, end_min: 800, category: 'trabalho' },
    ] }).expect(400);
    assert.equal(bad.body.error.code, 'overlap');
  });

  test('CENÁRIO 12 — ranking ordena pelo percentual atual; sem avaliação fica separado', async () => {
    const { examId, topics } = await examWithTopics(aluno, ['T1', 'T2', 'T3', 'T4 sem questões', 'T5 sem questões']);
    const results = { T1: [20, 13], T2: [20, 9], T3: [20, 11] }; // 65%, 45%, 55%
    for (const t of topics.slice(0, 3)) {
      await toReview(aluno, examId, t.id);
      await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: results[t.name][0], correct: results[t.name][1] }).expect(201);
    }
    const rk = (await aluno.get(`/api/exams/${examId}/ranking`).expect(200)).body;
    assert.deepEqual(rk.evaluated.map((x) => x.name), ['T2', 'T3', 'T1']);
    assert.deepEqual(rk.evaluated.map((x) => x.last_percent), [45, 55, 65]);
    assert.deepEqual(rk.unevaluated.map((x) => x.name).sort(), ['T4 sem questões', 'T5 sem questões']);
    assert.ok(rk.unevaluated.every((x) => x.last_percent === null));
  });
});
