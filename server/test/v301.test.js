/** v3.0.1 — endurecimento pós-auditoria: bônus anti-manipulação, atomicidade, LGPD, perfis, rota e ranking. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, agent, login, tokenFromUrl, PASSWORD, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { addDays, advanceClock, today, weekdayMon0 } from '../src/lib/util.js';

let A, coord, coordEmail;
const topicsOf = (T) => T.structure.flatMap((s) => s.topics);
before(async () => {
  await setup();
  const admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'v301-a', students: 1, topicsPerSubject: 4 });
  const email = `coord-${Math.random().toString(36).slice(2, 8)}@oneup.test`;
  const r = await A.teacher.post('/api/teacher/team').send({ name: 'Marcela', email, role: 'coordinator' }).expect(201);
  coord = agent(); coordEmail = email;
  await coord.post(`/api/auth/invite/${tokenFromUrl(r.body.invite.url)}`).send({ password: PASSWORD }).expect(201);
});

const withConsultoria = async (name) => {
  const st = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name });
  await coord.post(`/api/teacher/students/${st.studentId}/accesses`).send({ kind: 'consultoria' }).expect(201);
  return st;
};
const live = async (st) => (await A.teacher.get(`/api/teacher/students/${st.studentId}/consultoria`).expect(200)).body.consultoria;

describe('bônus: constância não é manipulável', () => {
  test('estudo manual retroativo e pacto muito baixo não geram semana válida; estudo no próprio dia gera', async () => {
    const retro = await withConsultoria('Retroativa');
    const control = await withConsultoria('Controle');
    const low = await withConsultoria('Pacto baixo');
    // vai para uma quarta-feira (a semana seguinte é totalmente futura e o pacto "próximo" pode ser definido)
    while (weekdayMon0(today()) !== 2) advanceClock(86400000);
    const t0 = today();
    for (const st of [retro, control, low]) await coord.patch(`/api/teacher/students/${st.studentId}/consultoria`).send({ done_on: t0 }).expect(200);
    await retro.agent.put('/api/me/pacto').send({ week: 'next', minutes: 600, days: [0, 1, 2, 3, 4] }).expect(200);
    await control.agent.put('/api/me/pacto').send({ week: 'next', minutes: 600, days: [0, 1, 2, 3, 4] }).expect(200);
    await low.agent.put('/api/me/pacto').send({ week: 'next', minutes: 60, days: [0, 1, 2, 3, 4] }).expect(200);
    advanceClock(7 * 86400000);                           // quarta da semana do pacto
    const t1 = today(); const monday = addDays(t1, -2);
    const tp = (st) => topicsOf(A)[0].id;
    const log = (st, date, min) => st.agent.post(`/api/enrollments/${st.enrollments[0].id}/sessions`).send({ topic_id: tp(st), date, duration_minutes: min }).expect(201);
    await log(retro, monday, 330); await log(retro, monday, 330);       // 11 h lançadas hoje para a segunda (retroativo)
    await log(control, t1, 330); await log(control, t1, 330);           // 11 h lançadas no próprio dia
    await log(low, t1, 120);                                            // pacto de 1 h cumprido, mas abaixo do mínimo
    advanceClock(7 * 86400000);                           // a semana do pacto agora está encerrada
    assert.equal((await live(retro)).bonus_live.goals.constancy.value, 0);
    assert.equal((await live(control)).bonus_live.goals.constancy.value, 1);
    assert.equal((await live(low)).bonus_live.goals.constancy.value, 0);
  });
});

describe('bônus: emissão única e medalha', () => {
  test('aprovação concorrente emite um só bônus; novo rascunho depois de aprovado é recusado; sem meta não há bônus', async () => {
    const st = await withConsultoria('Aprovação dupla');
    await coord.patch(`/api/teacher/students/${st.studentId}/consultoria`).send({ done_on: addDays(today(), -5) }).expect(200);
    const pl = (await coord.put(`/api/teacher/students/${st.studentId}/consultoria/plan`).send({ items: [{ text: 'A' }, { text: 'B' }], publish: true }).expect(200)).body.plan;
    // sem metas cumpridas ainda: não há medalha
    const r0 = (await coord.post(`/api/teacher/students/${st.studentId}/consultoria/report`).send({ body: 'Sem metas ainda.' }).expect(201)).body.report;
    assert.equal((await live(st)).bonus_live.medal, null);
    for (const it of pl.items) await st.agent.post(`/api/me/consultoria/items/${it.id}`).send({ done: true }).expect(200);
    const a = await Promise.all([A.teacher.post(`/api/teacher/consult-reports/${r0.id}/approve`), A.teacher.post(`/api/teacher/consult-reports/${r0.id}/approve`)]);
    const sts = a.map((x) => x.status).sort();
    assert.equal(sts[0], 200); assert.ok([404, 409].includes(sts[1]));      // o segundo clique perde, nunca emite outro bônus
    assert.equal((await live(st)).bonus_issued.medal_label, 'Bronze');
    assert.equal((await coord.post(`/api/teacher/students/${st.studentId}/consultoria/report`).send({})).status, 400);
    const bid = (await live(st)).bonus_issued.id;
    const ap = await Promise.all([A.teacher.post(`/api/teacher/bonuses/${bid}/apply`).send({}), A.teacher.post(`/api/teacher/bonuses/${bid}/apply`).send({})]);
    assert.deepEqual(ap.map((x) => x.status).sort(), [200, 400]);
  });

  test('a coordenadora não vê valores em R$ do bônus (nem na ficha, nem na Fila)', async () => {
    const st = await withConsultoria('Sigilo de valores');
    await coord.patch(`/api/teacher/students/${st.studentId}/consultoria`).send({ done_on: addDays(today(), -5) }).expect(200);
    const pl = (await coord.put(`/api/teacher/students/${st.studentId}/consultoria/plan`).send({ items: [{ text: 'A' }], publish: true }).expect(200)).body.plan;
    await st.agent.post(`/api/me/consultoria/items/${pl.items[0].id}`).send({ done: true }).expect(200);
    const r = (await coord.post(`/api/teacher/students/${st.studentId}/consultoria/report`).send({ body: 'Texto.' }).expect(201)).body.report;
    await A.teacher.post(`/api/teacher/consult-reports/${r.id}/approve`).expect(200);
    const view = (await coord.get(`/api/teacher/students/${st.studentId}/consultoria`).expect(200)).body.consultoria;
    assert.equal(view.bonus_values_cents, undefined); assert.equal(view.bonus_issued.discount_cents, undefined);
    const fila = JSON.stringify((await coord.get('/api/teacher/fila').expect(200)).body);
    assert.ok(!/R\$/.test(fila));
    assert.ok(/R\$/.test(JSON.stringify((await A.teacher.get('/api/teacher/fila').expect(200)).body)));
  });
});

describe('plano de ação pertence à jornada', () => {
  test('plano de outra jornada não vaza para a nova', async () => {
    const st = await withConsultoria('Renovação');
    await coord.put(`/api/teacher/students/${st.studentId}/consultoria/plan`).send({ items: [{ text: 'Antiga' }], publish: true }).expect(200);
    assert.equal((await st.agent.get('/api/me/consultoria')).body.consultoria.plan.total, 1);
    // nova consultoria (renovação) cria nova jornada
    await coord.post(`/api/teacher/students/${st.studentId}/accesses`).send({ kind: 'consultoria', starts_on: addDays(today(), 1) }).expect(201);
    assert.equal((await st.agent.get('/api/me/consultoria')).body.consultoria.plan, null);
  });
});

describe('LGPD e permissões', () => {
  test('exportação inclui os dados da consultoria; datas impossíveis dão 400, não 500', async () => {
    const st = await withConsultoria('Exporta');
    await st.agent.post('/api/me/consultoria/diagnostic').send({ consent: true, answers: { goal: 'SES-GO', hours_week: '10', time_studying: 'Estou começando', weak_subjects: 'x', how_study: 'y', main_difficulty: 'Constância', expectation: 'z' } }).expect(201);
    const ex = (await st.agent.get('/api/me/export').expect(200)).body;
    assert.equal(ex.consultoria.diagnostics.length, 1);
    assert.equal(ex.consultoria.diagnostics[0].consent, true);
    assert.ok(Array.isArray(ex.accesses) && Array.isArray(ex.route_adjustments) && 'photo' in ex);
    assert.equal((await coord.patch(`/api/teacher/students/${st.studentId}/consultoria`).send({ scheduled_on: '2026-02-31' })).status, 400);
  });

  test('configuração: só booleano de verdade; links do Drive e da renovação exigem https', async () => {
    assert.equal((await A.teacher.put('/api/teacher/config').send({ route_adjust_enabled: 'false' })).status, 400);
    assert.equal((await A.teacher.put('/api/teacher/config').send({ campo_inventado: 1 })).status, 400);
    assert.equal((await A.teacher.put('/api/teacher/terms').send({}).catch(() => ({ status: 0 }))).status === 200, false);
    assert.equal((await A.teacher.put('/api/teacher/branding').send({ renew_url: 'http://x.com' })).status, 400);
  });

  test('remover a foto apaga o registro do arquivo', async () => {
    const st = await withConsultoria('Foto');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const up = await st.agent.post('/api/me/photo?name=eu.png').set('Content-Type', 'application/octet-stream').send(png).expect(201);
    const id = up.body.photo_file_id;
    await st.agent.get(`/api/files/${id}`).expect(200);
    await st.agent.delete('/api/me/photo').expect(200);
    assert.equal((await st.agent.get(`/api/files/${id}`)).status, 404);
  });
});

describe('Ajuste de Rota: equipe só visualiza', () => {
  test('a coordenadora vê sem gravar e não aceita pelo aluno', async () => {
    const st = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id], name: 'Rota equipe' });
    const eid = st.enrollments[0].id;
    advanceClock(16 * 86400000);
    await login(coord, coordEmail);                      // as sessões antigas expiraram com o relógio adiantado
    await login(st.agent, st.email);
    const pre = (await coord.get(`/api/enrollments/${eid}/route`).expect(200)).body.route;
    assert.equal(pre.ready, true); assert.equal(pre.id, null);
    const mine = (await st.agent.get(`/api/enrollments/${eid}/route`).expect(200)).body.route;
    assert.ok(mine.id);
    assert.equal((await coord.post(`/api/enrollments/${eid}/route/${mine.id}/accept`)).status, 403);
  });
});

describe('ranking de acerto e regras puras', () => {
  test('quem não tem amostra mínima fica sem posição (não em último lugar)', async () => {
    const { rank } = await import('../src/domain/indicators.js');
    const row = (name, q, acc) => ({ name, is_new: false, questions_28: q, accuracy_28: acc, study_seconds_28: 0, consolidation_pct: 0 });
    const out = rank([row('Ana', 100, 80), row('Bia', 10, 100), row('Caio', 60, 70)], 'accuracy');
    assert.deepEqual(out.ranked.map((r) => r.name), ['Ana', 'Caio']);
    assert.deepEqual(out.unranked.map((r) => r.name), ['Bia']);
  });
});
