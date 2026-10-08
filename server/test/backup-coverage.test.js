/** Garante que o backup cobre TODAS as tabelas (nenhuma tabela nova pode ficar de fora) e que financeiro, agenda e "visto" voltam na restauração. */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { setup, agent, login, createPlatformAdmin, createTenantWithClass, PASSWORD } from './helpers.js';
import { tx, SYSTEM, truncateAll } from '../src/db/index.js';
import { TABLES, backupTo, restoreFrom } from '../src/ops/backup.js';
import { addDays, today } from '../src/lib/util.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'apqr-cov-'));
process.env.FILES_DIR = path.join(tmp, 'files');
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const TEMPORARY = ['schema_migrations', 'sessions', 'password_resets']; // temporários por decisão (ver ops/backup.js)

describe('cobertura do backup', () => {
  let A;
  before(async () => {
    const app = await setup();
    const admin = await createPlatformAdmin();
    A = await createTenantWithClass(admin.agent, { slug: 'cov-a', students: 1 });
    A.app = app;
  });

  test('toda tabela do banco está no backup (exceto as temporárias)', async () => {
    const all = (await tx(SYSTEM, (d) => d.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"))).map((r) => r.table_name);
    const covered = new Set(TABLES.map(([t]) => t));
    const missing = all.filter((t) => !TEMPORARY.includes(t) && !covered.has(t));
    assert.deepEqual(missing, [], `tabelas fora do backup: ${missing.join(', ')}`);
  });

  test('vendas, produtos, endereço de webhook, agenda e "visto" sobrevivem a backup → destruição → restauração', async () => {
    const ep = (await A.teacher.post('/api/teacher/finance/endpoints').send({ label: 'Checkout Backup' })).body;
    const hook = new URL(ep.url).pathname;
    await request(A.app).post(hook).send({ transaction_id: 'BK1', status: 'aprovado', amount: '297,00', email: 'bk@x.test', name: 'Compradora Backup', product_name: 'Curso Backup' }).expect(200);
    await A.teacher.post('/api/teacher/agenda').send({ kind: 'aula', title: 'Aula que precisa voltar', date: addDays(today(), 2), start_time: '19:00' }).expect(201);
    const item = (await A.teacher.post('/api/teacher/contents').send({ kind: 'link', title: 'Material com visto', url: 'https://example.com', published: true }).expect(201)).body.item;
    await A.students[0].agent.post(`/api/me/contents/${item.id}/done`).send({ done: true }).expect(200);

    // foto de perfil: students.photo_file_id aponta para files (a restauração precisa respeitar essa ordem)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await A.students[0].agent.post('/api/me/photo?name=eu.png').set('Content-Type', 'application/octet-stream').send(png).expect(201);

    const dir = path.join(tmp, 'b');
    const m = await backupTo(dir);
    for (const t of ['sales', 'sale_events', 'products', 'webhook_endpoints', 'webhook_inbox', 'agenda_events', 'content_progress']) assert.ok(m.tables[t].rows >= 1, `${t} sem linhas no backup`);

    await truncateAll();
    await restoreFrom(dir);

    const t = agent();
    await login(t, A.teacherEmail);
    const sales = (await t.get('/api/teacher/finance/sales').expect(200)).body.sales;
    assert.ok(sales.find((s) => s.external_id === 'BK1' && s.amount_cents === 29700));
    assert.ok((await t.get('/api/teacher/agenda').expect(200)).body.events.find((e) => e.title === 'Aula que precisa voltar'));
    assert.equal((await t.get('/api/teacher/finance/integration').expect(200)).body.endpoints.length, 1);
    const st = agent();
    await login(st, A.students[0].email);
    assert.equal((await st.get('/api/me/contents').expect(200)).body.items.find((i) => i.id === item.id).done, true);
    // o endereço de webhook antigo continua valendo depois de restaurar
    await request(A.app).post(hook).send({ transaction_id: 'BK2', status: 'aprovado', amount: '10', email: 'bk2@x.test', name: 'Outro', product_name: 'Curso Backup' }).expect(200);
  });
});
