/** V3.0 — Consultoria (jornada, diagnóstico, plano, relatório, bônus), Fila, turmas e Ajuste de Rota. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, agent, tokenFromUrl, PASSWORD, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { addDays, advanceClock, today } from '../src/lib/util.js';

let A, coord, mentor;
const topicsOf = (T) => T.structure.flatMap((s) => s.topics);
const mk = async (role, name) => {
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@oneup.test`;
  const r = await A.teacher.post('/api/teacher/team').send({ name, email, role }).expect(201);
  const a = agent();
  await a.post(`/api/auth/invite/${tokenFromUrl(r.body.invite.url)}`).send({ password: PASSWORD }).expect(201);
  return a;
};
before(async () => {
  await setup();
  const admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'cons-a', students: 1, topicsPerSubject: 4 });
  coord = await mk('coordinator', 'Marcela');
  mentor = await mk('mentor', 'Monitor');
});

const answers = { goal: 'SES-GO', hours_week: '15', time_studying: 'Estou começando', weak_subjects: 'Farmacologia', how_study: 'Aulas e PDFs', main_difficulty: 'Constância', expectation: 'Organizar a rotina' };

describe('consultoria: jornada completa e bônus', () => {
  let s, eid;
  before(async () => {
    s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Aluna Consultoria' });
    eid = s.enrollments[0].id;
  });

  test('sem acesso de consultoria não há aba; com acesso aparece a jornada', async () => {
    assert.equal((await s.agent.get('/api/me/consultoria').expect(200)).body.consultoria, null);
    await coord.post(`/api/teacher/students/${s.studentId}/accesses`).send({ kind: 'consultoria', label: 'Consultoria individual' }).expect(201);
    const c = (await s.agent.get('/api/me/consultoria').expect(200)).body.consultoria;
    assert.equal(c.journey.steps.find((x) => x.state === 'current').key, 'diagnostic');
    assert.equal(c.needs_diagnostic, true);
  });

  test('diagnóstico exige a caixa de consentimento e as respostas obrigatórias', async () => {
    const r1 = await s.agent.post('/api/me/consultoria/diagnostic').send({ answers, consent: false });
    assert.equal(r1.status, 400); assert.equal(r1.body.error.code, 'consent_required');
    assert.equal((await s.agent.post('/api/me/consultoria/diagnostic').send({ answers: { goal: 'x' }, consent: true })).status, 400);
    await s.agent.post('/api/me/consultoria/diagnostic').send({ answers, consent: true }).expect(201);
    const view = (await T_staff(s)).body.consultoria;
    assert.equal(view.diagnostic.answers.goal, 'SES-GO');
    assert.ok(view.diagnostic.terms_version);
  });
  const T_staff = (st) => coord.get(`/api/teacher/students/${st.studentId}/consultoria`).expect(200);

  test('monitor não vê a consultoria; encontro realizado abre 30 dias a partir da data', async () => {
    assert.equal((await mentor.get(`/api/teacher/students/${s.studentId}/consultoria`)).status, 403);
    const t = today();
    await coord.patch(`/api/teacher/students/${s.studentId}/consultoria`).send({ scheduled_on: t, session_link: 'https://meet.google.com/abc-defg-hij' }).expect(200);
    const j = (await coord.patch(`/api/teacher/students/${s.studentId}/consultoria`).send({ done_on: t }).expect(200)).body.journey;
    assert.equal(j.ends_on, addDays(t, 30));
    assert.equal(j.report_due_on, addDays(t, 30));
    assert.equal((await coord.patch(`/api/teacher/students/${s.studentId}/consultoria`).send({ session_link: 'http://x.com' })).status, 400);
  });

  test('plano de ação: só aparece ao aluno depois de publicado; aluno marca as ações', async () => {
    await coord.put(`/api/teacher/students/${s.studentId}/consultoria/plan`).send({ title: 'Plano', items: [{ text: 'Revisar 3 tópicos' }, { text: 'Resolver 60 questões' }, { text: 'Cumprir o pacto' }] }).expect(200);
    assert.equal((await s.agent.get('/api/me/consultoria')).body.consultoria.plan, null);
    const pub = (await coord.put(`/api/teacher/students/${s.studentId}/consultoria/plan`).send({ title: 'Plano', items: [{ text: 'Revisar 3 tópicos' }, { text: 'Resolver 60 questões' }, { text: 'Cumprir o pacto' }], publish: true }).expect(200)).body.plan;
    assert.equal(pub.total, 3);
    const first = pub.items[0].id;
    const plan = (await s.agent.post(`/api/me/consultoria/items/${first}`).send({ done: true }).expect(200)).body.plan;
    assert.equal(plan.done, 1); assert.equal(plan.pct, 33);
    // reeditar mantém o que já foi feito
    const again = (await coord.put(`/api/teacher/students/${s.studentId}/consultoria/plan`).send({ title: 'Plano', items: [{ text: 'Revisar 3 tópicos' }, { text: 'Resolver 60 questões' }, { text: 'Cumprir o pacto' }, { text: 'Nova ação' }] }).expect(200)).body.plan;
    assert.equal(again.done, 1); assert.equal(again.total, 4);
  });

  test('bônus: só conta questões lançadas no mesmo dia, até 150 por dia; lançamento retroativo não conta', async () => {
    const t = today();
    const tp = topicsOf(A)[0];
    await s.agent.post(`/api/enrollments/${eid}/questions`).send({ kind: 'topic', topic_id: tp.id, date: t, questions: 200, correct: 150 }).expect(201);
    await s.agent.post(`/api/enrollments/${eid}/questions`).send({ kind: 'simulado', date: addDays(t, 0), questions: 20, correct: 10 }).expect(201);
    // retroativo: data de ontem lançada hoje não entra
    await s.agent.post(`/api/enrollments/${eid}/questions`).send({ kind: 'simulado', date: addDays(t, -1), questions: 100, correct: 80 }).expect(201);
    const b = (await s.agent.get('/api/me/consultoria')).body.consultoria.bonus;
    assert.equal(b.goals.questions.value, 150);         // 220 no mesmo dia → limite de 150; retroativo fora
    assert.equal(b.goals.questions.met, false);
    assert.equal(b.medal, null);                        // nenhuma meta cumprida ainda: sem medalha e sem bônus
    assert.equal(b.issued, null);
  });

  test('relatório: só a professora aprova; com 1 meta (plano ≥ 70%) emite Bronze com validade de 15 dias', async () => {
    const items = (await s.agent.get('/api/me/consultoria')).body.consultoria.plan.items;
    for (const it of items.slice(1, 3)) await s.agent.post(`/api/me/consultoria/items/${it.id}`).send({ done: true }).expect(200);   // 3 de 4 = 75%
    const live = (await s.agent.get('/api/me/consultoria')).body.consultoria;
    assert.equal(live.bonus.goals.plan.met, true); assert.equal(live.bonus.medal, 'bronze');
    assert.equal(live.journey.note, undefined);                               // observação interna nunca vai ao aluno
    const rep = (await coord.post(`/api/teacher/students/${s.studentId}/consultoria/report`).send({ body: 'Boa evolução.' }).expect(201)).body.report;
    assert.equal(rep.status, 'draft');
    const subj = rep.facts.questions.subjects;
    assert.ok(subj.every((x) => x.level === 'insuficiente' ? x.accuracy === null : x.accuracy !== null));   // credibilidade
    assert.equal((await s.agent.get('/api/me/consultoria')).body.consultoria.report, null);
    assert.equal((await coord.post(`/api/teacher/consult-reports/${rep.id}/approve`)).status, 403);
    const ok = (await A.teacher.post(`/api/teacher/consult-reports/${rep.id}/approve`).expect(200)).body;
    assert.equal(ok.bonus.medal, 'bronze');
    const c = (await s.agent.get('/api/me/consultoria')).body.consultoria;
    assert.equal(c.report.body, 'Boa evolução.');
    assert.equal(c.bonus.issued.discount_cents, 2500);
    assert.equal(c.bonus.issued.valid_until, addDays(today(), 14));     // 15 dias contando o dia da emissão
  });

  test('fila: bônus aparece para aplicar; "feito" registra quem e quando; baixa manual uma só vez', async () => {
    const fila = (await coord.get('/api/teacher/fila').expect(200)).body;
    const bonusGroup = fila.groups.find((g) => g.kind === 'bonus_open');
    assert.ok(bonusGroup && bonusGroup.items[0].whatsapp_text.includes('bônus'));
    const item = bonusGroup.items[0];
    await coord.post('/api/teacher/fila/done').send({ student_id: item.student_id, kind: item.kind, ref: item.ref }).expect(200);
    assert.equal((await coord.get('/api/teacher/fila')).body.groups.find((g) => g.kind === 'bonus_open'), undefined);
    const withDone = (await coord.get('/api/teacher/fila?done=1')).body.groups.find((g) => g.kind === 'bonus_open').items[0];
    assert.equal(withDone.done.by, 'Marcela');
    assert.equal((await mentor.get('/api/teacher/fila')).status, 403);
    const bid = (await s.agent.get('/api/me/consultoria')).body.consultoria.bonus.issued.id;
    await coord.post(`/api/teacher/bonuses/${bid}/apply`).send({ note: 'Link gerado' }).expect(200);
    assert.equal((await coord.post(`/api/teacher/bonuses/${bid}/apply`).send({})).status, 400);
  });

  test('aluno com acesso encerrado vê o bônus emitido na tela de renovação', async () => {
    const s2 = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Aluna Bonus' });
    const t = today();
    await coord.post(`/api/teacher/students/${s2.studentId}/accesses`).send({ kind: 'consultoria' }).expect(201);
    await coord.patch(`/api/teacher/students/${s2.studentId}/consultoria`).send({ done_on: addDays(t, -29) }).expect(200);
    const pl = (await coord.put(`/api/teacher/students/${s2.studentId}/consultoria/plan`).send({ items: [{ text: 'Única ação' }], publish: true }).expect(200)).body.plan;
    await s2.agent.post(`/api/me/consultoria/items/${pl.items[0].id}`).send({ done: true }).expect(200);
    const rep = (await coord.post(`/api/teacher/students/${s2.studentId}/consultoria/report`).send({}).expect(201)).body.report;
    await A.teacher.post(`/api/teacher/consult-reports/${rep.id}/approve`).expect(200);
    advanceClock(2 * 86400000);
    const acc = (await s2.agent.get('/api/me/access').expect(200)).body.access;
    assert.equal(acc.state, 'expired');
    assert.equal(acc.bonus.medal, 'bronze');
    assert.equal((await s2.agent.get('/api/me/consultoria')).body.error.code, 'access_expired');
  });
});

describe('configurações privadas', () => {
  test('somente a professora altera; valida limites; aluno só vê as chaves públicas', async () => {
    assert.equal((await coord.put('/api/teacher/config').send({ route_adjust_enabled: false })).status, 403);
    assert.equal((await A.teacher.put('/api/teacher/config').send({ bonus: { values_cents: { prata: -5 } } })).status, 400);
    const cfg = (await A.teacher.put('/api/teacher/config').send({ bonus: { values_cents: { prata: 9000 } }, faco_questao_url: 'https://www.questaodefarmacia.com.br/' }).expect(200)).body.config;
    assert.equal(cfg.bonus.values_cents.prata, 9000);
    assert.equal((await coord.get('/api/teacher/config').expect(200)).body.config.bonus, undefined);
    const s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id] });
    const pub = (await s.agent.get('/api/me/config').expect(200)).body.config;
    assert.deepEqual(Object.keys(pub).sort(), ['faco_questao_url', 'route_adjust_enabled']);
  });
});

describe('turmas: WhatsApp e materiais por turma', () => {
  test('links só do WhatsApp; aluno vê os da sua turma; material de turma só para ela', async () => {
    const a = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Turma X' });
    const b = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Turma Y' });
    await A.teacher.patch(`/api/teacher/students/${a.studentId}`).send({ cohort: 'ANVISA' }).expect(200);
    await A.teacher.patch(`/api/teacher/students/${b.studentId}`).send({ cohort: 'SES-GO' }).expect(200);
    assert.equal((await A.teacher.put('/api/teacher/cohorts').send({ name: 'ANVISA', whatsapp_notices_url: 'https://evil.com/x' })).status, 400);
    await coord.put('/api/teacher/cohorts').send({ name: 'ANVISA', whatsapp_notices_url: 'https://chat.whatsapp.com/AAA', whatsapp_students_url: 'https://chat.whatsapp.com/BBB' }).expect(200);
    assert.equal((await mentor.put('/api/teacher/cohorts').send({ name: 'ANVISA' })).status, 403);
    const mine = (await a.agent.get('/api/me/cohort').expect(200)).body.cohort;
    assert.equal(mine.name, 'ANVISA'); assert.equal(mine.notices_url, 'https://chat.whatsapp.com/AAA'); assert.equal(mine.students_url, 'https://chat.whatsapp.com/BBB');
    assert.equal((await b.agent.get('/api/me/cohort')).body.cohort.notices_url, null);
    const item = (await mentor.post('/api/teacher/contents').send({ kind: 'link', title: 'Material ANVISA', url: 'https://exemplo.com/x', published: true, cohort: 'ANVISA' }).expect(201)).body.item;
    assert.ok((await a.agent.get('/api/me/contents')).body.items.some((x) => x.id === item.id));
    assert.ok(!(await b.agent.get('/api/me/contents')).body.items.some((x) => x.id === item.id));
    assert.equal((await b.agent.post(`/api/me/contents/${item.id}/done`).send({ done: true })).status, 404);
  });
});

describe('Ajuste de Rota', () => {
  test('quinzena só fecha depois de 15 dias; retrato é gravado; credibilidade; aceitar aplica o pacto', async () => {
    const s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Aluna Rota' });
    const eid = s.enrollments[0].id;
    const first = (await s.agent.get(`/api/enrollments/${eid}/route`).expect(200)).body.route;
    assert.equal(first.ready, false); assert.ok(first.days_left > 0);
    // 2 sessões em 2 dias, mas pouca carga: dados insuficientes
    const tp = topicsOf(A)[1];
    await s.agent.post(`/api/enrollments/${eid}/sessions`).send({ topic_id: tp.id, date: today(), duration_minutes: 30 }).expect(201);
    advanceClock(16 * 86400000);
    const r = (await s.agent.get(`/api/enrollments/${eid}/route`).expect(200)).body.route;
    assert.equal(r.ready, true);
    assert.equal(r.facts.enough_data, false);
    assert.deepEqual(r.suggestions, []);
    assert.ok(r.achievement);
    const again = (await s.agent.get(`/api/enrollments/${eid}/route`)).body.route;
    assert.equal(again.id, r.id);
    // flag desligada: some
    await A.teacher.put('/api/teacher/config').send({ route_adjust_enabled: false }).expect(200);
    assert.equal((await s.agent.get(`/api/enrollments/${eid}/route`)).body.route.enabled, false);
    await A.teacher.put('/api/teacher/config').send({ route_adjust_enabled: true }).expect(200);
    await s.agent.post(`/api/enrollments/${eid}/route/${r.id}/accept`).expect(200);
    assert.equal((await s.agent.post(`/api/enrollments/${eid}/route/${r.id}/accept`)).status, 400);
  });
});

describe('Ajuste de Rota: catálogo de ajustes (regras puras)', () => {
  test('quinzena: pronta só após 15 dias; credibilidade bloqueia ajustes; máximo de 3, com a base do número', async () => {
    const { periodFor, suggest, achievement } = await import('../src/domain/rota.js');
    assert.equal(periodFor('2026-10-01T10:00:00Z', '2026-10-10').ready, false);
    const p = periodFor('2026-10-01T10:00:00Z', '2026-10-17');
    assert.deepEqual([p.ready, p.from, p.to], [true, '2026-10-01', '2026-10-15']);
    const facts = {
      enough_data: true, placar: { done_seconds: 20 * 3600, study_days: 9 }, questions: { total: 120, subjects: [
        { subject: 'Farmacotécnica', questions: 48, accuracy: 45, level: 'inicial' }, { subject: 'Legislação', questions: 41, accuracy: 58, level: 'inicial' },
        { subject: 'Farmacologia', questions: 8, accuracy: null, level: 'insuficiente', missing: 22 } ] },
      reviews: { backlog: 2, consolidated: 1, done: 8 }, hours_by_subject: [],
      pacto: { chama: 2, shields: 0, weeks: [{ percent: 110, promised_minutes: 600, done_minutes: 660 }, { percent: 40, promised_minutes: 600, done_minutes: 240 }] },
    };
    const s = suggest(facts);
    assert.equal(s.length, 3);
    assert.deepEqual(s.map((x) => x.code), ['review_before_practice', 'reinforce_subject', 'pacto_lower']);
    assert.ok(s.every((x) => x.base.startsWith('Base:')));
    assert.ok(s[2].apply.minutes < 600);
    assert.deepEqual(suggest({ ...facts, enough_data: false }), []);
    assert.ok(achievement(facts).includes('consolidou'));
  });
});

describe('adaptador Pagar.me (pronto, sem ligar nada)', () => {
  test('order.paid e charge.refunded viram venda neutra, valores em centavos', async () => {
    const { normalizePayload } = await import('../src/domain/finance.js');
    const paid = normalizePayload({ type: 'order.paid', data: { id: 'or_1', amount: 49700, status: 'paid', customer: { name: 'Ana', email: 'ANA@x.com', document: '11144477735' }, items: [{ description: 'Consultoria', code: 'CONS' }], charges: [{ payment_method: 'pix', paid_at: '2026-10-07T10:00:00Z' }] } }).sale;
    assert.equal(paid.status, 'approved'); assert.equal(paid.amount_cents, 49700); assert.equal(paid.buyer_email, 'ana@x.com'); assert.equal(paid.product_ref, 'CONS');
    const ref = normalizePayload({ type: 'charge.refunded', data: { id: 'ch_1', amount: 49700, status: 'refunded', order: { id: 'or_1' }, customer: { email: 'ana@x.com' } } }).sale;
    assert.equal(ref.status, 'refunded'); assert.equal(ref.external_id, 'or_1');
    assert.ok(normalizePayload({ type: 'order.created', data: {} }).error);
  });
});
