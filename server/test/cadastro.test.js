/** V3.0 — Cadastro: prévia antes→depois, nascimento, CPF só equipe, auditoria com valor anterior e novo. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createPlatformAdmin, createTenantWithClass, nextCpf } from './helpers.js';
import { tx, SYSTEM } from '../src/db/index.js';

let T, S, other;
before(async () => {
  await setup();
  const admin = await createPlatformAdmin();
  T = await createTenantWithClass(admin.agent, { slug: 'cad-a', students: 2 });
  S = T.students[0]; other = T.students[1];
});

describe('cadastro', () => {
  test('aluno: prévia não grava; confirmar grava; audit guarda anterior e novo', async () => {
    const fields = { phone: '(61) 98888-7777', birth_date: '1992-04-15' };
    const prev = await S.agent.patch('/api/me/cadastro').send({ fields, dry_run: true });
    assert.equal(prev.status, 200);
    assert.equal(prev.body.applied, false);
    const ph = prev.body.changes.find((c) => c.field === 'phone');
    assert.equal(ph.from, '61999998888'); assert.equal(ph.to, '61988887777');
    assert.equal((await S.agent.get('/api/me/cadastro')).body.cadastro.birth_date, null);
    const ok = await S.agent.patch('/api/me/cadastro').send({ fields });
    assert.equal(ok.body.applied, true);
    const c = (await S.agent.get('/api/me/cadastro')).body.cadastro;
    assert.equal(c.birth_date, '1992-04-15'); assert.equal(c.phone, '61988887777');
    const log = await tx(SYSTEM, (d) => d.all("SELECT payload FROM audit_log WHERE action = 'student.cadastro_self_update'"));
    const txt = JSON.stringify(log.map((l) => l.payload));
    assert.match(txt, /anterior/); assert.match(txt, /61999998888/); assert.match(txt, /61988887777/);
  });

  test('aluno não altera CPF nem e-mail; data futura e CPF inválido são recusados', async () => {
    assert.equal((await S.agent.patch('/api/me/cadastro').send({ fields: { cpf: nextCpf() } })).status, 403);
    assert.equal((await S.agent.patch('/api/me/cadastro').send({ fields: { email: 'x@y.test' } })).status, 403);
    assert.equal((await S.agent.patch('/api/me/cadastro').send({ fields: { birth_date: '2999-01-01' } })).status, 400);
    assert.equal((await T.teacher.patch(`/api/teacher/students/${S.studentId}/cadastro`).send({ fields: { cpf: '11111111111' } })).status, 400);
  });

  test('professora altera CPF; CPF duplicado é recusado; sem mudança não grava', async () => {
    const cpf = nextCpf();
    const r = await T.teacher.patch(`/api/teacher/students/${S.studentId}/cadastro`).send({ fields: { cpf } });
    assert.equal(r.status, 200); assert.equal(r.body.applied, true);
    const dup = await T.teacher.patch(`/api/teacher/students/${other.studentId}/cadastro`).send({ fields: { cpf } });
    assert.equal(dup.status, 409);
    const same = await T.teacher.patch(`/api/teacher/students/${S.studentId}/cadastro`).send({ fields: { cpf } });
    assert.equal(same.body.applied, false); assert.deepEqual(same.body.changes, []);
  });

  test('professora troca e-mail (derruba sessões); e-mail já usado é recusado', async () => {
    const dup = await T.teacher.patch(`/api/teacher/students/${other.studentId}/cadastro`).send({ fields: { email: T.teacherEmail } });
    assert.equal(dup.status, 409);
    const ok = await T.teacher.patch(`/api/teacher/students/${other.studentId}/cadastro`).send({ fields: { email: 'novo-email@oneup.test' } });
    assert.equal(ok.body.applied, true);
    assert.equal((await other.agent.get('/api/me/cadastro')).status, 401);
  });
});
