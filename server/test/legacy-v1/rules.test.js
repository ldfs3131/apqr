/**
 * Regras adicionais e brechas fechadas.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freshApp, loginAdmin, newStudent, examWithTopics, toReview, client } from './helpers.js';
import { advanceClock, today, addDays } from '../src/lib/util.js';
import { isConsolidating } from '../src/domain/apqr.js';

let app, admin, aluno;
beforeEach(async () => {
  app = freshApp();
  admin = await loginAdmin(app);
  aluno = await newStudent(app, admin);
});

describe('Regras do APQR', () => {
  test('consolidação exata em inteiros (> 70%, nunca = 70%)', () => {
    assert.equal(isConsolidating(21, 30, 70), false); // 70%
    assert.equal(isConsolidating(7, 10, 70), false);
    assert.equal(isConsolidating(71, 100, 70), true);  // 71%
    assert.equal(isConsolidating(351, 500, 70), true); // 70,2%
    assert.equal(isConsolidating(350, 500, 70), false);
    assert.equal(isConsolidating(22, 30, 70), true);   // 73,33%
  });

  test('mínimo de 20 questões por revisão', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    await toReview(aluno, examId, topics[0].id);
    const r = await aluno.post(`/api/exams/${examId}/topics/${topics[0].id}/reviews`, { questions: 19, correct: 19 }).expect(400);
    assert.equal(r.body.error.code, 'min_questions');
    await aluno.post(`/api/exams/${examId}/topics/${topics[0].id}/reviews`, { questions: 20, correct: 21 }).expect(400); // acertos > questões
  });

  test('revisão só na etapa verde; consolidação nunca manual', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 20 }).expect(400);
    assert.equal(r.body.error.code, 'not_in_review');
    const m = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'consolidated' }).expect(400);
    assert.equal(m.body.error.code, 'manual_consolidation');
  });

  test('aluno não volta etapa em nenhum momento', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'assimilation' }).expect(200);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'not_started' }).expect(400);
    assert.equal(r.body.error.code, 'no_regression');
  });

  test('mentor corrige etapa (com motivo) apenas sem revisões; aluno não pode', async () => {
    const { examId, topics } = await examWithTopics(aluno, ['A', 'B']);
    const [a, b] = topics;
    await aluno.post(`/api/exams/${examId}/topics/${a.id}/status`, { status: 'production' }).expect(200);
    await aluno.post(`/api/exams/${examId}/topics/${a.id}/correct-status`, { status: 'assimilation', reason: 'engano' }).expect(403);
    const c = await admin.post(`/api/exams/${examId}/topics/${a.id}/correct-status`, { status: 'assimilation', reason: 'Aluno marcou por engano' }).expect(200);
    assert.equal(c.body.topic.status, 'assimilation');
    assert.equal(c.body.topic.material_done_at, null);
    await toReview(aluno, examId, b.id);
    await aluno.post(`/api/exams/${examId}/topics/${b.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    const x = await admin.post(`/api/exams/${examId}/topics/${b.id}/correct-status`, { status: 'production', reason: 'teste' }).expect(400);
    assert.equal(x.body.error.code, 'has_reviews');
    const hist = (await aluno.get(`/api/exams/${examId}/topics/${a.id}`).expect(200)).body.history;
    assert.ok(hist.some((h) => h.event_type === 'correction'));
  });

  test('pular etapas (migração da planilha) com data retroativa, nunca futura', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    const past = addDays(today(), -10);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/status`, { status: 'review', date: past }).expect(200);
    assert.equal(r.body.topic.started_at, past);
    assert.equal(r.body.topic.material_done_at, past);
    assert.equal(r.body.topic.review_started_at, past);
    const { topics: t2 } = await examWithTopics(aluno, ['X']);
    await aluno.post(`/api/exams/${examId}/topics/${t2[0].id}/status`, { status: 'assimilation' }).expect(404); // outro edital
    const f = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 10, date: addDays(today(), 1) }).expect(400);
    assert.equal(f.body.error.code, 'future_date');
    const before = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 10, date: addDays(past, -1) }).expect(400);
    assert.equal(before.body.error.code, 'date_before_previous');
  });

  test('desfazer revisão: aluno só em 30 min; mentor depois, com motivo — e desfaz consolidação', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 19 }).expect(201);
    const u = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews/undo`, {}).expect(200);
    assert.equal(u.body.topic.status, 'review');
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    advanceClock(31 * 60_000);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews/undo`, {}).expect(403);
    await admin.post(`/api/exams/${examId}/topics/${t.id}/reviews/undo`, {}).expect(400); // sem motivo
    await admin.post(`/api/exams/${examId}/topics/${t.id}/reviews/undo`, { reason: 'Aluno digitou errado' }).expect(200);
  });

  test('R4 travada: ciclo não reinicia por mudança de status; rodízio manual (mentor libera)', async () => {
    const { examId, topics } = await examWithTopics(aluno, ['Travado', 'O1', 'O2', 'O3']);
    const t = topics[0];
    await toReview(aluno, examId, t.id);
    for (let i = 0; i < 4; i++) await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    const d1 = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body;
    assert.equal(d1.rotation.locked, true);
    assert.equal(d1.rotation.mode, 'manual');
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/release-cycle`).expect(403);
    const rel = await admin.post(`/api/exams/${examId}/topics/${t.id}/release-cycle`).expect(200);
    assert.equal(rel.body.topic.current_cycle, 2);
    const r = await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 15 }).expect(201);
    assert.equal(r.body.review.number, 1);
    assert.equal(r.body.review.cycle, 2);
    assert.equal(r.body.topic.status, 'consolidated');
    // histórico do ciclo 1 preservado
    const d2 = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body;
    assert.equal(d2.reviews.length, 5);
  });

  test('rodízio automático: libera só depois de revisar os demais tópicos em Q+R (mínimo configurável)', async () => {
    await admin.put('/api/admin/settings', { settings: { rotation_mode: 'auto', rotation_min_other_topics: 2 }, confirm: true }).expect(200);
    const { examId, topics } = await examWithTopics(aluno, ['Travado', 'O1', 'O2']);
    const [t, o1, o2] = topics;
    await toReview(aluno, examId, t.id);
    for (let i = 0; i < 4; i++) await aluno.post(`/api/exams/${examId}/topics/${t.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    let rot = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body.rotation;
    assert.equal(rot.fulfilled, false); // não há outros tópicos em revisão — não libera "no vazio"
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/release-cycle`).expect(403);
    await toReview(aluno, examId, o1.id);
    await toReview(aluno, examId, o2.id);
    await aluno.post(`/api/exams/${examId}/topics/${o1.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    rot = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body.rotation;
    assert.equal(rot.reviewed_count, 1);
    assert.equal(rot.fulfilled, false);
    await aluno.post(`/api/exams/${examId}/topics/${o2.id}/reviews`, { questions: 20, correct: 10 }).expect(201);
    rot = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body.rotation;
    assert.equal(rot.fulfilled, true);
    await aluno.post(`/api/exams/${examId}/topics/${t.id}/release-cycle`).expect(200);
  });

  test('configurações têm faixa segura e exigem confirmação', async () => {
    await admin.put('/api/admin/settings', { settings: { consolidation_threshold: 10 }, confirm: true }).expect(400);
    await admin.put('/api/admin/settings', { settings: { max_reviews_per_cycle: 30 }, confirm: true }).expect(400);
    await admin.put('/api/admin/settings', { settings: { consolidation_threshold: 75 } }).expect(400);
    await aluno.put('/api/admin/settings', { settings: { consolidation_threshold: 75 }, confirm: true }).expect(403);
  });

  test('questões avulsas contam no desempenho mas não mudam etapa', async () => {
    const { examId, topics } = await examWithTopics(aluno);
    const t = topics[0];
    await aluno.post(`/api/exams/${examId}/practice`, { topic_id: t.id, date: today(), questions: 10, correct: 10 }).expect(201);
    const d = (await aluno.get(`/api/exams/${examId}/dashboard`).expect(200)).body.summary;
    assert.equal(d.questions, 10);
    const row = (await aluno.get(`/api/exams/${examId}/topics/${t.id}`).expect(200)).body;
    assert.equal(row.topic.status, 'not_started');
    assert.equal(row.row.last_percent, null); // ranking continua "sem avaliação"
  });

  test('cronômetro guardado no servidor: um por vez, <1 min não salva, ajuste só para menos', async () => {
    const { examId, topics } = await examWithTopics(aluno, ['A', 'B']);
    await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: topics[0].id }).expect(201);
    const c = await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: topics[1].id }).expect(409);
    assert.equal(c.body.error.code, 'timer_active');
    advanceClock(30_000);
    const f = await aluno.post('/api/me/timer/finish', {}).expect(200);
    assert.equal(f.body.saved, false);
    await aluno.post('/api/me/timer/start', { exam_id: examId, topic_id: topics[0].id }).expect(201);
    advanceClock(5 * 3600_000);
    await aluno.post('/api/me/timer/finish', { adjusted_seconds: 6 * 3600 }).expect(400);
    const ok = await aluno.post('/api/me/timer/finish', { adjusted_seconds: 2 * 3600 }).expect(200);
    assert.equal(ok.body.session.duration_seconds, 7200);
  });
});

describe('Autenticação, convite e permissões', () => {
  test('cadastro exige convite válido e de uso limitado', async () => {
    const c = client(app);
    await c.post('/api/auth/register', { name: 'Intruso', email: 'x@x.com', password: 'senha12345', invite_code: 'APQR-NAOEXISTE' }).expect(400);
    const inv = (await admin.post('/api/admin/invites', { max_uses: 1 }).expect(201)).body.invite;
    await client(app).post('/api/auth/register', { name: 'Um', email: 'um@x.com', password: 'senha12345', invite_code: inv.code }).expect(201);
    await client(app).post('/api/auth/register', { name: 'Dois', email: 'dois@x.com', password: 'senha12345', invite_code: inv.code }).expect(400);
  });

  test('CSRF: mutação sem cabeçalho é recusada', async () => {
    await aluno.agent.post('/api/exams').send({ name: 'X' }).expect(403);
  });

  test('recuperação de senha com link do mentor', async () => {
    const link = (await admin.post(`/api/admin/students/${aluno.user.student_id}/reset-link`).expect(200)).body.url;
    const token = new URL(link).searchParams.get('token');
    await client(app).post('/api/auth/reset', { token, password: 'novaSenha123' }).expect(200);
    await client(app).post('/api/auth/reset', { token, password: 'outraSenha123' }).expect(400); // uso único
    await client(app).post('/api/auth/login', { email: aluno.user.email, password: 'novaSenha123' }).expect(200);
    const forgot = await client(app).post('/api/auth/forgot', { email: 'naoexiste@x.com' }).expect(200);
    assert.ok(forgot.body.message);
  });

  test('mentor só enxerga alunos atribuídos; owner enxerga todos', async () => {
    await admin.post('/api/admin/mentors', { name: 'Mentora', email: 'mentora@apqr.test', password: 'mentora123', level: 'mentor' }).expect(201);
    const mentor = client(app);
    await mentor.post('/api/auth/login', { email: 'mentora@apqr.test', password: 'mentora123' }).expect(200);
    const { examId } = await examWithTopics(aluno);
    await mentor.get(`/api/exams/${examId}/dashboard`).expect(404);
    assert.equal((await mentor.get('/api/admin/students').expect(200)).body.students.length, 0);
    const mentors = (await admin.get('/api/admin/mentors').expect(200)).body.mentors;
    const m = mentors.find((x) => x.email === 'mentora@apqr.test');
    await admin.put(`/api/admin/mentors/${m.id}/students`, { student_ids: [aluno.user.student_id] }).expect(200);
    await mentor.get(`/api/exams/${examId}/dashboard`).expect(200);
    await admin.get(`/api/exams/${examId}/dashboard`).expect(200);
    await mentor.put('/api/admin/settings', { settings: { consolidation_threshold: 75 }, confirm: true }).expect(403);
  });
});

describe('Editais da mentoria (modelo → cópias)', () => {
  async function template(policy = 'locked') {
    const tpl = (await admin.post('/api/admin/templates', { name: 'SES-GO 2026', role_title: 'Farmacêutico', edit_policy: policy }).expect(201)).body.exam;
    await admin.post(`/api/exams/${tpl.id}/subjects`, { name: 'Legislação SUS', topics: ['Lei 8.080', 'Controle Social'] }).expect(201);
    await admin.post(`/api/exams/${tpl.id}/subjects`, { name: 'Farmacologia', topics: ['Antibióticos'] }).expect(201);
    return tpl;
  }

  test('aluno se matricula, recebe a estrutura e não acessa o modelo diretamente', async () => {
    const tpl = await template();
    await aluno.get(`/api/exams/${tpl.id}/structure`).expect(404);
    const cat = (await aluno.get('/api/exams/catalog').expect(200)).body.templates;
    assert.equal(cat[0].topics_count, 3);
    const copy = (await aluno.post('/api/exams/enroll', { template_id: tpl.id }).expect(201)).body.exam;
    const st = (await aluno.get(`/api/exams/${copy.id}/structure`).expect(200)).body.subjects;
    assert.deepEqual(st.map((s) => s.name), ['Legislação SUS', 'Farmacologia']);
    await aluno.post('/api/exams/enroll', { template_id: tpl.id }).expect(400);
  });

  test('política locked / complement / free', async () => {
    const tpl = await template('locked');
    const copy = (await aluno.post('/api/exams/enroll', { template_id: tpl.id }).expect(201)).body.exam;
    const st = (await aluno.get(`/api/exams/${copy.id}/structure`).expect(200)).body.subjects;
    await aluno.post(`/api/exams/${copy.id}/subjects`, { name: 'Minha' }).expect(403);
    await aluno.patch(`/api/exams/${copy.id}/topics/${st[0].topics[0].id}`, { name: 'x' }).expect(403);
    await admin.patch(`/api/exams/${tpl.id}`, { edit_policy: 'complement' }).expect(200);
    await aluno.post(`/api/exams/${copy.id}/topics`, { subject_id: st[0].id, names: ['Meu tópico extra'] }).expect(201);
    await aluno.patch(`/api/exams/${copy.id}/topics/${st[0].topics[0].id}`, { name: 'x' }).expect(403);
    await aluno.put(`/api/exams/${copy.id}/plan`, { items: [] }).expect(403);
    await admin.patch(`/api/exams/${tpl.id}`, { edit_policy: 'free' }).expect(200);
    await aluno.patch(`/api/exams/${copy.id}/topics/${st[0].topics[0].id}`, { name: 'Lei Orgânica da Saúde' }).expect(200);
  });

  test('retificação do edital propaga para os alunos sem perder progresso', async () => {
    const tpl = await template('locked');
    const copy = (await aluno.post('/api/exams/enroll', { template_id: tpl.id }).expect(201)).body.exam;
    let st = (await aluno.get(`/api/exams/${copy.id}/structure`).expect(200)).body.subjects;
    const lei = st[0].topics[0];
    await toReview(aluno, copy.id, lei.id);
    await aluno.post(`/api/exams/${copy.id}/topics/${lei.id}/reviews`, { questions: 20, correct: 12 }).expect(201);
    const tst = (await admin.get(`/api/exams/${tpl.id}/structure`).expect(200)).body.subjects;
    await admin.patch(`/api/exams/${tpl.id}/topics/${tst[0].topics[0].id}`, { name: 'Lei 8.080/1990' }).expect(200);
    await admin.post(`/api/exams/${tpl.id}/topics`, { subject_id: tst[0].id, names: ['Lei 8.142/1990'] }).expect(201);
    await admin.patch(`/api/exams/${tpl.id}/topics/${tst[1].topics[0].id}`, { archived: true }).expect(200);
    st = (await aluno.get(`/api/exams/${copy.id}/structure`).expect(200)).body.subjects;
    const renamed = st[0].topics.find((x) => x.id === lei.id);
    assert.equal(renamed.name, 'Lei 8.080/1990');
    assert.equal(renamed.status, 'review'); // progresso mantido
    assert.ok(st[0].topics.some((x) => x.name === 'Lei 8.142/1990'));
    assert.equal(st[1].topics.length, 0); // Antibióticos arquivado
    const detail = (await aluno.get(`/api/exams/${copy.id}/topics/${lei.id}`).expect(200)).body;
    assert.equal(detail.reviews.length, 1);
    assert.ok(detail.history.some((h) => h.event_type === 'renamed'));
  });
});

describe('Análises', () => {
  test('dashboard, análises, sugestões, insights e relatório respondem só com dados reais', async () => {
    const { examId, topics } = await examWithTopics(aluno, ['A', 'B', 'C']);
    const empty = (await aluno.get(`/api/exams/${examId}/dashboard`).expect(200)).body;
    assert.equal(empty.summary.study_seconds, 0);
    assert.equal(empty.summary.accuracy, null);
    assert.ok(empty.insights.every((i) => !/estudou em média/.test(i.text)));
    await aluno.post(`/api/exams/${examId}/sessions`, { topic_id: topics[0].id, date: today(), duration_minutes: 120 }).expect(201);
    await toReview(aluno, examId, topics[0].id);
    await aluno.post(`/api/exams/${examId}/topics/${topics[0].id}/reviews`, { questions: 20, correct: 12 }).expect(201);
    const dash = (await aluno.get(`/api/exams/${examId}/dashboard`).expect(200)).body;
    assert.equal(dash.summary.accuracy, 60);
    assert.equal(dash.summary.apqr_progress, 25); // (75 + 0 + 0) / 3
    assert.equal(dash.suggestions.items[0].title, 'Revisão prioritária');
    const an = (await aluno.get(`/api/exams/${examId}/analytics?period=30d`).expect(200)).body;
    assert.equal(an.daily.length, 30);
    assert.equal(an.apqr_series[an.apqr_series.length - 1].progress, 25);
    assert.equal(an.review_evolution[0].accuracy, 60);
    const rep = (await aluno.get(`/api/exams/${examId}/report?period=7d`).expect(200)).body;
    assert.equal(rep.summary.study_seconds, 7200);
    assert.equal(rep.student.name, aluno.user.name);
  });
});
