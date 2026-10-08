/**
 * FASE 1 — Fundação: autenticação, convite/cadastro, permissões e isolamento.
 * Hipóteses exigidas pelo produto (seção 18):
 *   Aluno A nunca acessa dados do aluno B · Professora nunca acessa outro ambiente ·
 *   Aluno nunca acessa área administrativa · Professora não tem acesso global ·
 *   Administrador ONE UP tem acesso global autorizado.
 */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetRateLimits, setup, agent, login, createPlatformAdmin, createTenantWithClass, createActiveStudent, profile, nextCpf, tokenFromUrl, PASSWORD } from './helpers.js';
import { tx, SYSTEM } from '../src/db/index.js';

let admin, A, B;
const FIXED_CPF = (() => { const c = nextCpf(); return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`; })();
const DUP_CPF = nextCpf();

before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'pollyana', students: 2 });
  B = await createTenantWithClass(admin.agent, { slug: 'outra-prof', students: 1 });
});

beforeEach(() => resetRateLimits());

describe('Autenticação', () => {
  test('login inválido tem mensagem genérica; sessão em cookie httpOnly', async () => {
    const a = agent();
    const bad = await a.post('/api/auth/login').send({ email: A.teacherEmail, password: 'errada123' });
    assert.equal(bad.status, 401);
    const none = await a.post('/api/auth/login').send({ email: 'naoexiste@x.com', password: 'errada123' });
    assert.equal(none.status, 401);
    assert.equal(bad.body.error.message, none.body.error.message);
    const ok = await a.raw.post('/api/auth/login').set('X-Requested-With', 'apqr').send({ email: A.teacherEmail, password: PASSWORD });
    assert.equal(ok.status, 200);
    const cookie = ok.headers['set-cookie'].join(';');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.equal(ok.body.user.password_hash, undefined);
  });

  test('conta bloqueia após 10 senhas erradas, mesmo com a senha certa depois', async () => {
    const s = await createActiveStudent(A.teacher);
    const a = agent();
    for (let i = 0; i < 10; i++) await a.post('/api/auth/login').send({ email: s.email, password: 'errada123' });
    const locked = await a.post('/api/auth/login').send({ email: s.email, password: PASSWORD });
    assert.equal(locked.status, 429);
    assert.equal(locked.body.error.code, 'locked');
  });

  test('mutação sem cabeçalho anti-CSRF é recusada', async () => {
    const res = await A.teacher.raw.post('/api/teacher/editais').send({ name: 'X' });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf');
  });

  test('aluno com acesso vencido entra, vê o aviso e o servidor bloqueia o resto', async () => {
    const s = await createActiveStudent(A.teacher);
    await A.teacher.patch(`/api/teacher/students/${s.studentId}`).send({ access_until: '2020-01-01' }).expect(200);
    const a = agent();
    const res = await a.post('/api/auth/login').send({ email: s.email, password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.access_state, 'expired');
    assert.equal((await a.get('/api/me/enrollments')).body.error.code, 'access_expired');
    assert.equal((await a.get('/api/me/access')).status, 200);
    assert.equal((await a.get('/api/me/export')).status, 200);
  });
});

describe('Convite e cadastro do aluno', () => {
  test('professora convida → aluno conclui com CPF, endereço e aceite; convite não reutilizável', async () => {
    const email = 'novo.aluno@oneup.test';
    const c = await A.teacher.post('/api/teacher/students').send({ name: 'Novo Aluno Silva', email, edital_ids: [A.edital.id] });
    assert.equal(c.status, 201);
    const token = tokenFromUrl(c.body.invite.url);
    const info = await agent().get(`/api/auth/invite/${token}`);
    assert.equal(info.status, 200);
    assert.equal(info.body.invite.email, email);
    assert.equal(info.body.invite.requires_profile, true);

    // usuário convidado ainda não entra
    const early = await agent().post('/api/auth/login').send({ email, password: PASSWORD });
    assert.equal(early.status, 401); // sem senha ainda: credencial inválida

    const a = agent();
    const badCpf = await a.post(`/api/auth/invite/${token}`).send(profile({ cpf: '12345678900' }));
    assert.equal(badCpf.status, 400);
    assert.ok(badCpf.body.error.details.cpf);
    const noTerms = await a.post(`/api/auth/invite/${token}`).send(profile({ terms_accepted: false }));
    assert.equal(noTerms.body.error.code, 'terms_required');
    const weak = await a.post(`/api/auth/invite/${token}`).send(profile({ password: 'curta' }));
    assert.equal(weak.body.error.code, 'weak_password');

    const ok = await a.post(`/api/auth/invite/${token}`).send(profile({ cpf: FIXED_CPF }));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.user.role, 'student');
    assert.equal(ok.body.user.cpf.replace(/\D/g, ''), FIXED_CPF.replace(/\D/g, ''));
    const enr = await a.get('/api/me/enrollments');
    assert.equal(enr.body.enrollments.length, 1);

    const again = await agent().post(`/api/auth/invite/${token}`).send(profile());
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'invalid_invite');
  });

  test('CPF duplicado no mesmo ambiente é recusado; e-mail duplicado também', async () => {
    const c1 = await A.teacher.post('/api/teacher/students').send({ name: 'Maria Um', email: 'maria1@oneup.test' });
    await agent().post(`/api/auth/invite/${tokenFromUrl(c1.body.invite.url)}`).send(profile({ cpf: DUP_CPF })).expect(201);
    const c2 = await A.teacher.post('/api/teacher/students').send({ name: 'Maria Dois', email: 'maria2@oneup.test' });
    const dup = await agent().post(`/api/auth/invite/${tokenFromUrl(c2.body.invite.url)}`).send(profile({ cpf: DUP_CPF }));
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'cpf_taken');
    const dupEmail = await A.teacher.post('/api/teacher/students').send({ name: 'Maria Três', email: 'MARIA1@oneup.test' });
    assert.equal(dupEmail.status, 409);
  });

  test('lista de alunos mostra CPF mascarado; perfil completo é auditado', async () => {
    const list = await A.teacher.get('/api/teacher/students');
    const withCpf = list.body.students.find((s) => s.cpf);
    assert.match(withCpf.cpf, /^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    const prof = await A.teacher.get(`/api/teacher/students/${withCpf.id}/profile`);
    assert.match(prof.body.student.cpf, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    const audit = await A.teacher.get('/api/teacher/audit');
    assert.ok(audit.body.audit.some((x) => x.action === 'student.view_profile'));
  });

  test('link de nova senha: uso único e derruba sessões antigas', async () => {
    const s = A.students[0];
    const link = await A.teacher.post(`/api/teacher/students/${s.studentId}/reset-link`);
    assert.equal(link.status, 200);
    const token = tokenFromUrl(link.body.url);
    await agent().post('/api/auth/reset').send({ token, password: 'NovaSenha999' }).expect(200);
    assert.equal((await s.agent.get('/api/me/enrollments')).status, 401, 'sessão antiga deve cair');
    await agent().post('/api/auth/reset').send({ token, password: 'OutraSenha999' }).expect(400);
    await login(s.agent, s.email, 'NovaSenha999');
    const audit = await A.teacher.get('/api/teacher/audit');
    assert.ok(audit.body.audit.some((x) => x.action === 'student.reset_link'));
  });
});

describe('Permissões por papel', () => {
  test('aluno nunca acessa área administrativa nem console ONE UP', async () => {
    const s = A.students[1].agent;
    for (const url of ['/api/teacher/students', '/api/teacher/editais', '/api/teacher/settings', '/api/teacher/audit', '/api/platform/overview']) {
      const res = await s.get(url);
      assert.equal(res.status, 403, url);
    }
    assert.equal((await s.post('/api/teacher/editais').send({ name: 'x' })).status, 403);
  });

  test('professora não tem acesso global e não cria professoras', async () => {
    assert.equal((await A.teacher.get('/api/platform/overview')).status, 403);
    assert.equal((await A.teacher.post('/api/platform/tenants').send({ slug: 'x-y', name: 'X', teacher_name: 'Y Z', teacher_email: 'y@z.com' })).status, 403);
  });

  test('monitor só edita editais e materiais: nenhum dado de aluno; não altera regras', async () => {
    const m = await A.teacher.post('/api/teacher/team').send({ name: 'Monitor Um', email: 'monitor@oneup.test' });
    assert.equal(m.status, 201);
    const mon = agent();
    await mon.post(`/api/auth/invite/${tokenFromUrl(m.body.invite.url)}`).send({ password: PASSWORD }).expect(201);
    assert.equal((await mon.get('/api/teacher/students')).status, 403);
    assert.equal((await mon.patch(`/api/teacher/students/${A.students[1].studentId}`).send({ name: 'Hack' })).status, 403);
    assert.equal((await mon.post('/api/teacher/editais').send({ name: 'Edital do monitor' })).status, 201);
    assert.equal((await mon.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 5 }, reason: 'teste', confirm: true })).status, 403);
  });
});

describe('Isolamento de dados', () => {
  test('professora A não enxerga nem altera nada do ambiente B', async () => {
    const listA = (await A.teacher.get('/api/teacher/students')).body.students.map((s) => s.id);
    assert.ok(!listA.includes(B.students[0].studentId));
    const edB = B.edital.id;
    assert.equal((await A.teacher.get(`/api/teacher/editais/${edB}`)).status, 404);
    assert.equal((await A.teacher.patch(`/api/teacher/editais/${edB}`).send({ name: 'hack' })).status, 404);
    assert.equal((await A.teacher.post(`/api/teacher/editais/${edB}/subjects`).send({ name: 'hack' })).status, 404);
    assert.equal((await A.teacher.patch(`/api/teacher/students/${B.students[0].studentId}`).send({ name: 'Hackeado' })).status, 404);
    assert.equal((await A.teacher.get(`/api/teacher/students/${B.students[0].studentId}/profile`)).status, 404);
    assert.equal((await A.teacher.post(`/api/teacher/students/${B.students[0].studentId}/reset-link`)).status, 404);
    assert.equal((await A.teacher.post(`/api/teacher/students/${A.students[0].studentId}/enrollments`).send({ edital_id: edB })).status, 404);
    assert.equal((await A.teacher.get(`/api/enrollments/${B.students[0].enrollments[0].id}`)).status, 404);
    const edB2 = await tx(SYSTEM, (d) => d.one('SELECT name FROM editais WHERE id = ?', [edB]));
    assert.notEqual(edB2.name, 'hack');
  });

  test('aluno A nunca acessa dados do aluno B (mesmo ambiente ou outro)', async () => {
    const [s1, s2] = A.students;
    assert.equal((await s1.agent.get(`/api/enrollments/${s1.enrollments[0].id}`)).status, 200);
    assert.equal((await s1.agent.get(`/api/enrollments/${s2.enrollments[0].id}`)).status, 404);
    assert.equal((await s1.agent.get(`/api/enrollments/${B.students[0].enrollments[0].id}`)).status, 404);
  });

  test('identificador inválido ou inexistente responde 404 (sem revelar nada)', async () => {
    assert.equal((await A.teacher.get('/api/teacher/editais/123')).status, 404);
    assert.equal((await A.teacher.get('/api/teacher/editais/00000000-0000-4000-8000-000000000000')).status, 404);
    assert.equal((await A.students[0].agent.get("/api/enrollments/1' OR '1'='1")).status, 404);
  });

  test('admin ONE UP: acesso global auditado; operando um ambiente vê só aquele ambiente', async () => {
    const ov = await admin.agent.get('/api/platform/overview');
    assert.equal(ov.status, 200);
    assert.equal(ov.body.tenants.length, 2);
    assert.equal((await admin.agent.get(`/api/enrollments/${B.students[0].enrollments[0].id}`)).status, 200);
    // área de professora sem escolher ambiente → recusado
    assert.equal((await admin.agent.get('/api/teacher/students')).status, 403);
    await admin.agent.post(`/api/platform/tenants/${A.tenant.id}/enter`).expect(200);
    const asA = await admin.agent.raw.get('/api/teacher/students').set('X-Tenant-Id', A.tenant.id);
    assert.equal(asA.status, 200);
    assert.ok(asA.body.students.every((s) => !B.students.some((b) => b.studentId === s.id)));
    const asAonB = await admin.agent.raw.get(`/api/teacher/editais/${B.edital.id}`).set('X-Tenant-Id', A.tenant.id);
    assert.equal(asAonB.status, 404);
    const audit = await admin.agent.get('/api/platform/audit');
    assert.ok(audit.body.audit.some((x) => x.action === 'platform.enter_tenant'));
  });

  test('banco recusa gravação cruzada mesmo que o código erre (RLS)', async () => {
    const { tx: t } = await import('../src/db/index.js');
    await assert.rejects(
      t({ tenantId: A.tenant.id }, (d) => d.run("INSERT INTO editais (tenant_id, name, created_at, updated_at) VALUES (?, 'x', now(), now())", [B.tenant.id])),
      /row-level security/
    );
    const seen = await t({ tenantId: A.tenant.id }, (d) => d.all('SELECT tenant_id FROM students'));
    assert.ok(seen.every((r) => r.tenant_id === A.tenant.id));
  });
});

describe('Editais e regras', () => {
  test('estrutura, Plano Global, arquivamento e duplicação', async () => {
    const t = A.teacher;
    const ed = (await t.post('/api/teacher/editais').send({ name: 'EBSERH 2027', board: 'IBFC' })).body.edital;
    const s = (await t.post(`/api/teacher/editais/${ed.id}/subjects`).send({ name: 'Farmácia Hospitalar', topics: ['1. Gestão', '- Gestão', 'Logística', ''] })).body.subject;
    let full = (await t.get(`/api/teacher/editais/${ed.id}`)).body;
    assert.deepEqual(full.subjects[0].topics.map((x) => x.name), ['Gestão', 'Logística']);
    await t.put(`/api/teacher/editais/${ed.id}/plan`).send({ items: [{ subject_id: s.id, relevance: 'alta' }] }).expect(200);
    await t.patch(`/api/teacher/editais/${ed.id}/topics/${full.subjects[0].topics[0].id}`).send({ archived: true }).expect(200);
    full = (await t.get(`/api/teacher/editais/${ed.id}`)).body;
    assert.equal(full.subjects[0].topics.length, 1);
    assert.equal(full.plan.items[0].relevance, 'alta');
    const dup = await t.post(`/api/teacher/editais/${ed.id}/duplicate`);
    assert.equal(dup.status, 201);
    assert.match(dup.body.edital.name, /cópia/);
  });

  test('regras do método: alteração pela interface cria versão, exige motivo e confirmação', async () => {
    const t = A.teacher;
    const s0 = (await t.get('/api/teacher/settings')).body;
    assert.equal(s0.settings.min_questions_per_review, 20);
    assert.equal(s0.settings.consolidation_threshold, 70);
    assert.equal(s0.settings.version, 1);
    assert.equal((await t.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 30 }, confirm: true })).status, 400);
    const ok = await t.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 30 }, reason: 'Turma avançada', confirm: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.settings.version, 2);
    const s1 = (await t.get('/api/teacher/settings')).body;
    assert.deepEqual(s1.versions.map((v) => v.version), [2, 1]);
    // ambiente B não foi afetado
    assert.equal((await B.teacher.get('/api/teacher/settings')).body.settings.min_questions_per_review, 20);
  });
});
