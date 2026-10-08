/** V3.0 — Acessos (vigências), pausa, consultoria, perfis (coordenadora/monitor) e bloqueio de aluno vencido. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, agent, login, tokenFromUrl, profile, PASSWORD, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { addDays, advanceClock, today } from '../src/lib/util.js';

let T, S, coord, mentor;
const mk = async (role, name) => {
  const email = `${role}-${Math.random().toString(36).slice(2, 8)}@oneup.test`;
  const r = await T.teacher.post('/api/teacher/team').send({ name, email, role }).expect(201);
  const a = agent();
  await a.post(`/api/auth/invite/${tokenFromUrl(r.body.invite.url)}`).send({ password: PASSWORD }).expect(201);
  return a;
};
before(async () => {
  await setup();
  const admin = await createPlatformAdmin();
  T = await createTenantWithClass(admin.agent, { slug: 'acc-a', students: 1 });
  S = T.students[0];
  coord = await mk('coordinator', 'Marcela Coordenadora');
  mentor = await mk('mentor', 'Monitor Teste');
});

describe('acessos', () => {
  test('conceder acesso plataforma; resumo do aluno e do Raio-X', async () => {
    const t = today();
    const g = await T.teacher.post(`/api/teacher/students/${S.studentId}/accesses`).send({ kind: 'plataforma', label: 'Plano semestral', days: 180 }).expect(201);
    assert.equal(g.body.access.ends_on, addDays(t, 180));
    const list = (await T.teacher.get(`/api/teacher/students/${S.studentId}/accesses`).expect(200)).body.accesses;
    assert.equal(list.length, 1); assert.equal(list[0].long, true); assert.equal(list[0].can_pause, true);
    assert.equal((await S.agent.get('/api/me/access').expect(200)).body.access.state, 'active');
  });

  test('pausa: 1 por acesso; segunda só com liberação da professora; retomar soma os dias parados', async () => {
    const id = (await T.teacher.get(`/api/teacher/students/${S.studentId}/accesses`)).body.accesses[0].id;
    const before = (await T.teacher.get(`/api/teacher/students/${S.studentId}/accesses`)).body.accesses[0].ends_on;
    await coord.post(`/api/teacher/accesses/${id}/pause`).expect(200);
    assert.equal((await S.agent.get('/api/me/enrollments')).body.error.code, 'access_paused');
    assert.equal((await S.agent.get('/api/me/access')).body.access.state, 'paused');
    advanceClock(10 * 86400000);
    const r = (await coord.post(`/api/teacher/accesses/${id}/resume`).expect(200)).body;
    assert.equal(r.paused_days, 10); assert.equal(r.ends_on, addDays(before, 10));
    assert.equal((await S.agent.get('/api/me/enrollments')).status, 200);
    // segunda pausa: recusada
    assert.equal((await coord.post(`/api/teacher/accesses/${id}/pause`)).body.error.code, 'pause_used');
    // coordenadora não libera extra; professora libera
    await coord.post(`/api/teacher/accesses/${id}/extra-pause`).send({}).expect(403);
    await T.teacher.post(`/api/teacher/accesses/${id}/extra-pause`).send({}).expect(200);
    await coord.post(`/api/teacher/accesses/${id}/pause`).expect(200);
    await coord.post(`/api/teacher/accesses/${id}/resume`).expect(200);
    assert.equal((await coord.post(`/api/teacher/accesses/${id}/pause`)).status, 400);
  });

  test('acesso curto (consultoria) não pausa; prazo de 30 dias conta do encontro realizado', async () => {
    const c = (await T.teacher.post(`/api/teacher/students/${S.studentId}/accesses`).send({ kind: 'consultoria', label: 'Consultoria' }).expect(201)).body.access;
    assert.equal(c.ends_on, null);
    assert.equal((await T.teacher.post(`/api/teacher/accesses/${c.id}/pause`)).status, 400);
    const m = (await T.teacher.post(`/api/teacher/accesses/${c.id}/meeting`).send({ date: today() }).expect(200)).body;
    assert.equal(m.ends_on, addDays(today(), 30));
  });

  test('cancelar exige motivo; vencido/cancelado bloqueia o aluno e mantém o aviso', async () => {
    const s2 = await createActiveStudent(T.teacher, { edital_ids: [T.edital.id] });
    const g = (await T.teacher.post(`/api/teacher/students/${s2.studentId}/accesses`).send({ kind: 'turma', days: 100 }).expect(201)).body.access;
    await T.teacher.post(`/api/teacher/accesses/${g.id}/cancel`).send({ reason: '' }).expect(400);
    await T.teacher.post(`/api/teacher/accesses/${g.id}/cancel`).send({ reason: 'Pedido do aluno' }).expect(200);
    assert.equal((await s2.agent.get('/api/me/enrollments')).body.error.code, 'access_expired');
    const sum = (await s2.agent.get('/api/me/access').expect(200)).body.access;
    assert.equal(sum.state, 'expired'); assert.equal(sum.accesses[0].situation, 'canceled');
    // legado bloqueado quando há acessos cadastrados
    assert.equal((await T.teacher.patch(`/api/teacher/students/${s2.studentId}`).send({ access_until: '2030-01-01' })).body.error.code, 'use_accesses');
  });
});

describe('perfis', () => {
  test('coordenadora vê alunos e edita CPF, mas não vê financeiro, equipe nem regras', async () => {
    const list = (await coord.get('/api/teacher/students').expect(200)).body.students;
    assert.ok(list.length >= 1);
    await coord.get('/api/teacher/finance/summary').expect(403);
    await coord.get('/api/teacher/team').expect(403);
    await coord.put('/api/teacher/settings').send({}).expect(403);
    const { nextCpf } = await import('./helpers.js');
    await coord.patch(`/api/teacher/students/${S.studentId}/cadastro`).send({ fields: { cpf: nextCpf() } }).expect(200);
  });

  test('monitor edita edital mas não vê dado de aluno', async () => {
    await mentor.get('/api/teacher/students').expect(403);
    await mentor.get(`/api/teacher/students/${S.studentId}`).expect(403);
    await mentor.post('/api/teacher/editais').send({ name: 'Edital do monitor' }).expect(201);
  });

  test('segunda conta de professora/administrador (e-mail próprio) com os mesmos poderes', async () => {
    const t2 = await mk('teacher', 'Lucas Administrador');
    await t2.get('/api/teacher/team').expect(200);
    await t2.get('/api/teacher/students').expect(200);
    assert.equal((await mentor.post('/api/teacher/team').send({ name: 'X Y Z', email: 'x@y.test', role: 'teacher' })).status, 403);
  });
});
