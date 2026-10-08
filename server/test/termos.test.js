/** V3.0 — Termos versionados: aceite no cadastro, nova versão exige novo aceite, PDF. */
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { setup, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { tx, SYSTEM } from '../src/db/index.js';

let T, S;
before(async () => {
  await setup();
  const admin = await createPlatformAdmin();
  T = await createTenantWithClass(admin.agent, { slug: 'ter-a', students: 1 });
  S = T.students[0];
});

describe('termos', () => {
  test('cadastro por convite já registra o aceite (versão 1.0, data/hora, IP)', async () => {
    const rows = await tx(SYSTEM, (d) => d.all('SELECT version, accepted_at, ip FROM terms_acceptances WHERE student_id = ?', [S.studentId]));
    assert.equal(rows.length, 1); assert.equal(rows[0].version, '1.0'); assert.ok(rows[0].accepted_at);
    const me = (await S.agent.get('/api/auth/me')).body.user;
    assert.equal(me.terms_pending, false);
  });

  test('nova versão: aluno fica pendente, lê, aceita; versão antiga é recusada', async () => {
    const cur = (await T.teacher.get('/api/teacher/terms').expect(200)).body.current;
    await T.teacher.post('/api/teacher/terms').send({ title: 'Termos', body: cur.body + '\n\n11. Novidade\n' + 'Texto novo. '.repeat(10) }).expect(201);
    assert.equal((await S.agent.get('/api/auth/me')).body.user.terms_pending, true);
    const t = (await S.agent.get('/api/me/terms').expect(200)).body;
    assert.equal(t.terms.version, '2.0'); assert.equal(t.accepted, false);
    await S.agent.post('/api/me/terms/accept').send({ version: '1.0' }).expect(400);
    await S.agent.post('/api/me/terms/accept').send({ version: '2.0' }).expect(200);
    assert.equal((await S.agent.get('/api/auth/me')).body.user.terms_pending, false);
    const list = (await T.teacher.get('/api/teacher/terms')).body;
    assert.equal(list.documents.find((x) => x.version === '2.0').accepted, 1);
  });

  test('PDF é gerado e só a professora publica', async () => {
    const pdf = await S.agent.get('/api/me/terms/pdf').expect(200);
    assert.match(pdf.headers['content-type'], /pdf/);
    await S.agent.post('/api/teacher/terms').send({ body: 'x'.repeat(300) }).expect(403);
  });

  test('aluno novo (convite) com data de nascimento', async () => {
    const s2 = await createActiveStudent(T.teacher, { edital_ids: [T.edital.id], overrides: { birth_date: '1990-05-20' } });
    assert.equal((await s2.agent.get('/api/me/cadastro')).body.cadastro.birth_date, '1990-05-20');
  });
});
