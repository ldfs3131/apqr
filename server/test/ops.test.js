/**
 * V2.1 — Operação: saúde real, identificador de requisição e backup → destruição → restauração verificada.
 */
import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { resetRateLimits, setup, agent, login, createPlatformAdmin, createTenantWithClass, PASSWORD } from './helpers.js';
import { truncateAll } from '../src/db/index.js';
import { backupTo, restoreFrom } from '../src/ops/backup.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apqr-ops-'));
process.env.FILES_DIR = path.join(tmp, 'files');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

let admin, A;
before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'ops-a', students: 2 });
});
beforeEach(() => resetRateLimits());

describe('saúde e rastreabilidade', () => {
  test('/api/health confere banco e migrações; /api/health/live só o processo', async () => {
    const h = await agent().get('/api/health').expect(200);
    assert.equal(h.body.ok, true);
    assert.equal(h.body.schema, 'ok');
    assert.equal(h.body.migrations.missing.length, 0);
    assert.ok(h.body.migrations.applied >= 1);
    assert.ok('version' in h.body, 'o /api/health informa a versão em execução');
    await agent().get('/api/health/live').expect(200);
  });

  test('toda resposta traz X-Request-Id; um id válido vindo do proxy é mantido', async () => {
    const r = await agent().get('/api/auth/me');
    assert.match(r.headers['x-request-id'], /^[\w.-]{8,}$/);
    const r2 = await agent().raw.get('/api/auth/me').set('X-Request-Id', 'proxy-abc-12345');
    assert.equal(r2.headers['x-request-id'], 'proxy-abc-12345');
    const r3 = await agent().raw.get('/api/auth/me').set('X-Request-Id', 'x y <script>');
    assert.notEqual(r3.headers['x-request-id'], 'x y <script>');
  });
});

describe('backup e restauração', () => {
  test('backup → banco e arquivos destruídos → restauração verificada → plataforma funcionando igual', async () => {
    // Dados variados: revisão consolidadora, nova versão de regras, arquivo publicado, anotação.
    const s = A.students[0];
    const eid = s.enrollments[0].id;
    const topic = A.structure[0].topics[0];
    await s.agent.post(`/api/enrollments/${eid}/topics/${topic.id}/status`).send({ status: 'review' }).expect(200);
    await s.agent.post(`/api/enrollments/${eid}/topics/${topic.id}/reviews`).send({ questions: 30, correct: 25 }).expect(201);
    await A.teacher.put('/api/teacher/settings').send({ settings: { min_questions_per_review: 25 }, reason: 'teste de backup', confirm: true }).expect(200);
    const up = await A.teacher.raw.post('/api/files?purpose=content&name=guia.pdf').set('X-Requested-With', 'apqr').set('Content-Type', 'application/octet-stream').send(PDF).expect(201);
    await A.teacher.post('/api/teacher/contents').send({ kind: 'file', title: 'Guia', file_id: up.body.file.id, published: true }).expect(201);
    await A.teacher.post(`/api/teacher/students/${s.studentId}/notes`).send({ body: 'Anotação que precisa voltar' }).expect(201);
    const before = (await A.teacher.get('/api/teacher/central').expect(200)).body;
    const settingsBefore = (await A.teacher.get('/api/teacher/settings').expect(200)).body;

    const dir = path.join(tmp, 'backup-1');
    const manifest = await backupTo(dir);
    assert.equal(manifest.tables.reviews.rows, 1);
    assert.equal(manifest.tables.methodology_configs.rows, 2);
    assert.equal(manifest.files.copied, 1);

    // Desastre: banco zerado e arquivos apagados.
    await truncateAll();
    fs.rmSync(process.env.FILES_DIR, { recursive: true, force: true });
    await agent().post('/api/auth/login').send({ email: A.teacherEmail, password: PASSWORD }).expect(401);

    const r = await restoreFrom(dir);
    assert.equal(r.files_missing.length, 0);
    assert.equal(r.tables.reviews, 1);

    // Tudo de volta: login com a mesma senha, mesmos números, regras versionadas, arquivo e anotação.
    const t = agent();
    await login(t, A.teacherEmail);
    const after = (await t.get('/api/teacher/central').expect(200)).body;
    const key = (list) => list.map((x) => [x.student_id, x.editais.map((e) => e.consolidation_pct)]).sort((a, b) => a[0].localeCompare(b[0]));
    assert.deepEqual(key(after.students), key(before.students));
    assert.deepEqual((await t.get('/api/teacher/settings').expect(200)).body.versions.map((v) => v.version), settingsBefore.versions.map((v) => v.version));
    const st = agent();
    await login(st, s.email);
    const rv = (await st.get(`/api/enrollments/${eid}/topics/${topic.id}`).expect(200)).body.reviews[0];
    assert.equal(rv.min_questions_used, 20, 'a revisão mantém a regra da época');
    const dl = await st.get(`/api/files/${up.body.file.id}`).expect(200);
    assert.equal(dl.headers['content-type'], 'application/pdf');
    const notes = (await t.get(`/api/teacher/students/${s.studentId}/notes`).expect(200)).body.notes;
    assert.equal(notes[0].body, 'Anotação que precisa voltar');
  });

  test('restauração recusa banco que não está vazio e backup corrompido (sem gravar nada)', async () => {
    const dir = path.join(tmp, 'backup-2');
    await backupTo(dir);
    await assert.rejects(() => restoreFrom(dir), /não está vazio/);
    // corrompe uma tabela
    const p = path.join(dir, 'tables', 'users.ndjson.gz');
    const body = zlib.gunzipSync(fs.readFileSync(p)).toString().replace('"student"', '"teacher"');
    fs.writeFileSync(p, zlib.gzipSync(Buffer.from(body)));
    await truncateAll();
    await assert.rejects(() => restoreFrom(dir), /corrompido/);
    const h = await agent().get('/api/health').expect(200);
    assert.equal(h.body.ok, true);
  });

  test('backup não sobrescreve pasta existente com conteúdo', async () => {
    const dir = path.join(tmp, 'backup-3');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'x.txt'), 'x');
    await assert.rejects(() => backupTo(dir), /não está vazia/);
  });
});
