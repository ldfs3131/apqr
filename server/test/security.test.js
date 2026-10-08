/**
 * FASE 7 — Revisão de segurança: vetores adicionais às suítes de fundação.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, agent, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';

let admin, A, B;
before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'sec-a', students: 2 });
  B = await createTenantWithClass(admin.agent, { slug: 'sec-b', students: 1 });
});
beforeEach(() => resetRateLimits());

describe('segurança', () => {
  test('cabeçalho X-Tenant-Id é ignorado para quem não é admin ONE UP', async () => {
    const r = await A.teacher.raw.get('/api/teacher/students').set('X-Tenant-Id', B.tenant.id).expect(200);
    const ids = r.body.students.map((s) => s.id);
    assert.ok(!ids.includes(B.students[0].studentId));
    await A.students[0].agent.raw.get(`/api/enrollments/${B.students[0].enrollments[0].id}/dashboard`).set('X-Tenant-Id', B.tenant.id).expect(404);
  });

  test('aluno não grava nada na matrícula de outro aluno', async () => {
    const other = A.students[1];
    const eid = other.enrollments[0].id;
    const topic = A.structure[0].topics[0];
    const s = A.students[0].agent;
    await s.post(`/api/enrollments/${eid}/topics/${topic.id}/status`).send({ status: 'assimilation' }).expect(404);
    await s.post(`/api/enrollments/${eid}/sessions`).send({ topic_id: topic.id, date: new Date().toISOString().slice(0, 10), duration_minutes: 30 }).expect(404);
    await s.post(`/api/enrollments/${eid}/practice`).send({ topic_id: topic.id, date: new Date().toISOString().slice(0, 10), questions: 10, correct: 5 }).expect(404);
  });

  test('conteúdo de outro edital não é aceito na matrícula', async () => {
    const s = A.students[0];
    const foreignTopic = B.structure[0].topics[0];
    await s.agent.post(`/api/enrollments/${s.enrollments[0].id}/topics/${foreignTopic.id}/status`).send({ status: 'assimilation' }).expect(404);
  });

  test('admin ONE UP não desativa a própria conta; professora não usa o console', async () => {
    const me = (await admin.agent.get('/api/auth/me')).body.user;
    await admin.agent.patch(`/api/platform/users/${me.id}`).send({ status: 'disabled' }).expect(400);
    await A.teacher.get('/api/platform/audit').expect(403);
    await A.teacher.post(`/api/platform/tenants/${A.tenant.id}/enter`).expect(403);
  });

  test('ambiente suspenso bloqueia login de professora e alunos; reativação libera', async () => {
    const extra = await createActiveStudent(A.teacher, {});
    await admin.agent.patch(`/api/platform/tenants/${A.tenant.id}`).send({ status: 'suspended' }).expect(200);
    const s = agent();
    const r = await s.post('/api/auth/login').send({ email: extra.email, password: 'Senha12345' });
    assert.equal(r.status, 403);
    assert.equal(r.body.error.code, 'tenant_suspended');
    // sessão já aberta também para de funcionar
    await extra.agent.get('/api/me/enrollments').expect(401);
    await admin.agent.patch(`/api/platform/tenants/${A.tenant.id}`).send({ status: 'active' }).expect(200);
    await s.post('/api/auth/login').send({ email: extra.email, password: 'Senha12345' }).expect(200);
  });

  test('cabeçalhos de segurança nas respostas', async () => {
    const r = await agent().get('/api/auth/me');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(r.headers['x-frame-options'], 'DENY');
    assert.match(r.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-powered-by'], undefined);
  });

  test('aluno não lê anotações da professora nem relatórios de IA', async () => {
    const s = A.students[0];
    await s.agent.get(`/api/teacher/students/${s.studentId}/notes`).expect(403);
    await s.agent.get(`/api/teacher/enrollments/${s.enrollments[0].id}/ai-reports`).expect(403);
  });
});
