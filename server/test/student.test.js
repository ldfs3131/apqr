/**
 * FASE 3 — Experiência do aluno: cadastro complementar (alunos migrados), relatório,
 * área "Estudar com IA" (somente publicados, isolada por ambiente) e desempenho por conteúdo.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, agent, login, createPlatformAdmin, createTenantWithClass, createActiveStudent, nextCpf, profile, PASSWORD } from './helpers.js';
import { tx, SYSTEM } from '../src/db/index.js';
import { hashPassword } from '../src/security/auth.js';
import { nowIso, today } from '../src/lib/util.js';

let admin, A, B;
before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'amb-a', students: 0 });
  B = await createTenantWithClass(admin.agent, { slug: 'amb-b', students: 0 });
});
beforeEach(() => resetRateLimits());

describe('cadastro complementar (aluno importado da V1 sem CPF)', () => {
  test('aluno sem CPF recebe profile_complete=false e completa o cadastro', async () => {
    const email = `v1-${Date.now()}@oneup.test`;
    const hash = await hashPassword(PASSWORD);
    await tx(SYSTEM, async (d) => {
      const u = await d.one(`INSERT INTO users (tenant_id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?,?,?,?, 'student','active',?,?) RETURNING id`, [A.tenant.id, email, hash, 'Aluno V1', nowIso(), nowIso()]);
      await d.run('INSERT INTO students (tenant_id, user_id, created_at, updated_at) VALUES (?,?,?,?)', [A.tenant.id, u.id, nowIso(), nowIso()]);
    });
    const a = agent();
    const u = await login(a, email);
    assert.equal(u.profile_complete, false);
    // termos obrigatórios
    await a.post('/api/auth/complete-profile').send({ ...profile(), terms_accepted: false }).expect(400);
    // dados inválidos retornam erros por campo
    const bad = await a.post('/api/auth/complete-profile').send({ ...profile(), cpf: '11111111111', state: 'XX' }).expect(400);
    assert.ok(bad.body.error.details.cpf && bad.body.error.details.state);
    const ok = await a.post('/api/auth/complete-profile').send(profile()).expect(200);
    assert.equal(ok.body.user.profile_complete, true);
    // professora/mentor não usam esta rota
    await A.teacher.post('/api/auth/complete-profile').send(profile()).expect(400);
  });

  test('CPF já usado por outro aluno do ambiente é recusado', async () => {
    const cpf = nextCpf();
    await createActiveStudent(A.teacher, { overrides: { cpf } });
    const email = `v1b-${Date.now()}@oneup.test`;
    const hash = await hashPassword(PASSWORD);
    await tx(SYSTEM, async (d) => {
      const u = await d.one(`INSERT INTO users (tenant_id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?,?,?,?, 'student','active',?,?) RETURNING id`, [A.tenant.id, email, hash, 'Aluno V1 B', nowIso(), nowIso()]);
      await d.run('INSERT INTO students (tenant_id, user_id, created_at, updated_at) VALUES (?,?,?,?)', [A.tenant.id, u.id, nowIso(), nowIso()]);
    });
    const a = agent();
    await login(a, email);
    await a.post('/api/auth/complete-profile').send(profile({ cpf })).expect(409);
  });
});

describe('relatório e desempenho do aluno', () => {
  test('relatório traz edital, período padrão de 30 dias e a configuração vigente', async () => {
    const s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id] });
    const eid = s.enrollments[0].id;
    const r = await s.agent.get(`/api/enrollments/${eid}/report`).expect(200);
    assert.equal(r.body.exam.name, A.edital.name);
    assert.ok(r.body.period.from && r.body.period.to);
    assert.equal(r.body.settings.min_questions_per_review, 20);
    assert.equal(r.body.settings.consolidation_threshold, 70);
    const perf = await s.agent.get(`/api/enrollments/${eid}/performance`).expect(200);
    assert.equal(perf.body.settings.consolidation_threshold, 70);
    // outro aluno não acessa o relatório
    const other = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id] });
    await other.agent.get(`/api/enrollments/${eid}/report`).expect(404);
    // professora de outro ambiente também não
    await B.teacher.get(`/api/enrollments/${eid}/report`).expect(404);
    // professora do ambiente acessa (e fica auditado)
    await A.teacher.get(`/api/enrollments/${eid}/report`).expect(200);
  });

  test('sessão manual guarda a atividade APQR informada', async () => {
    const s = await createActiveStudent(A.teacher, { edital_ids: [A.edital.id] });
    const eid = s.enrollments[0].id;
    const topic = A.structure[0].topics[0];
    const res = await s.agent.post(`/api/enrollments/${eid}/sessions`).send({ topic_id: topic.id, date: today('America/Sao_Paulo'), duration_minutes: 30, activity: 'production' }).expect(201);
    assert.equal(res.body.session.activity, 'production');
  });
});

describe('Estudar com IA — conteúdos', () => {
  test('aluno vê só conteúdos publicados do próprio ambiente', async () => {
    await tx(SYSTEM, async (d) => {
      const ins = 'INSERT INTO content_items (tenant_id, kind, title, published, created_at, updated_at) VALUES (?,?,?,?,?,?)';
      await d.run(ins, [A.tenant.id, 'text', 'Publicado A', true, nowIso(), nowIso()]);
      await d.run(ins, [A.tenant.id, 'text', 'Rascunho A', false, nowIso(), nowIso()]);
      await d.run(ins, [B.tenant.id, 'text', 'Publicado B', true, nowIso(), nowIso()]);
    });
    const s = await createActiveStudent(A.teacher, {});
    const r = await s.agent.get('/api/me/contents').expect(200);
    assert.deepEqual(r.body.items.map((i) => i.title), ['Publicado A']);
    await A.teacher.get('/api/me/contents').expect(403);
  });
});
