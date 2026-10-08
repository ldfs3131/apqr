/** V2.3 — Materiais: PDF com marca d'água do aluno, "já vi" por aluno, isolamento. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { resetRateLimits, setup, createPlatformAdmin, createTenantWithClass } from './helpers.js';
import { watermarkPdf } from '../src/lib/watermark.js';

let admin, A, B, pdfBytes, contentId, fileId;
before(async () => {
  await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'mat-a', students: 2 });
  B = await createTenantWithClass(admin.agent, { slug: 'mat-b', students: 1 });
  const doc = await PDFDocument.create();
  doc.addPage([400, 600]).drawText('Material do curso');
  doc.addPage([400, 600]);
  pdfBytes = Buffer.from(await doc.save());
});
beforeEach(() => resetRateLimits());

describe('materiais', () => {
  test('marca d\'água: PDF válido, mesmas páginas, conteúdo maior; PDF inválido devolve null', async () => {
    const out = await watermarkPdf(pdfBytes, 'Ana Souza · ana@x.test');
    assert.ok(out);
    assert.equal((await PDFDocument.load(out)).getPageCount(), 2);
    assert.notEqual(out.length, pdfBytes.length);
    assert.equal(await watermarkPdf(Buffer.from('não é pdf'), 'x'), null);
  });

  test('professora publica PDF; aluno recebe versão marcada; arquivo não publicado é 404 para aluno', async () => {
    const up = await A.teacher.post('/api/files?name=apostila.pdf').set('Content-Type', 'application/octet-stream').send(pdfBytes);
    assert.equal(up.status, 201);
    fileId = up.body.file.id;
    const c = await A.teacher.post('/api/teacher/contents').send({ kind: 'file', title: 'Apostila de Farmacologia', category: 'PDF', file_id: fileId, published: false });
    assert.equal(c.status, 201);
    contentId = c.body.item.id;
    assert.equal((await A.students[0].agent.get(`/api/files/${fileId}`)).status, 404);
    assert.equal((await A.teacher.patch(`/api/teacher/contents/${contentId}`).send({ published: true })).status, 200);
    const r = await A.students[0].agent.get(`/api/files/${fileId}`).buffer(true).parse((res, cb) => { const ch = []; res.on('data', (x) => ch.push(x)); res.on('end', () => cb(null, Buffer.concat(ch))); });
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /pdf/);
    assert.notEqual(r.body.length, pdfBytes.length);
    assert.match(r.headers['cache-control'], /no-store/);
    // a professora recebe o original
    const t = await A.teacher.get(`/api/files/${fileId}`).buffer(true).parse((res, cb) => { const ch = []; res.on('data', (x) => ch.push(x)); res.on('end', () => cb(null, Buffer.concat(ch))); });
    assert.equal(t.body.length, pdfBytes.length);
  });

  test('"já vi" é por aluno e some ao desmarcar', async () => {
    const [s1, s2] = A.students;
    const get = async (s) => (await s.agent.get('/api/me/contents')).body.items.find((i) => i.id === contentId);
    assert.equal((await get(s1)).done, false);
    assert.equal((await s1.agent.post(`/api/me/contents/${contentId}/done`).send({ done: true })).status, 200);
    assert.equal((await get(s1)).done, true);
    assert.equal((await get(s2)).done, false);
    await s1.agent.post(`/api/me/contents/${contentId}/done`).send({ done: false });
    assert.equal((await get(s1)).done, false);
  });

  test('aluno de outro ambiente não marca nem vê', async () => {
    const r = await B.students[0].agent.post(`/api/me/contents/${contentId}/done`).send({ done: true });
    assert.equal(r.status, 404);
    assert.equal((await B.students[0].agent.get(`/api/files/${fileId}`)).status, 404);
  });
});
