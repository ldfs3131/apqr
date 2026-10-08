/** V2.3 — Financeiro: webhook genérico, idempotência, status só avança, acesso, reembolso, importação, permissões e isolamento. */
import { test, describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resetRateLimits, setup, agent, createPlatformAdmin, createTenantWithClass, createActiveStudent } from './helpers.js';
import { createApp } from '../src/app.js';
import { addDays, today } from '../src/lib/util.js';
import { normalizePayload, toCents, mapStatus } from '../src/domain/finance.js';

const T = today();
let admin, A, B, app, uid = 0;
const post = (url, body) => request(app).post(url).send(body);

before(async () => {
  app = await setup();
  admin = await createPlatformAdmin();
  A = await createTenantWithClass(admin.agent, { slug: 'fin-a', students: 1 });
  B = await createTenantWithClass(admin.agent, { slug: 'fin-b', students: 1 });
});
beforeEach(() => resetRateLimits());

async function endpoint(t, label = 'Checkout X') {
  const r = await t.teacher.post('/api/teacher/finance/endpoints').send({ label });
  assert.equal(r.status, 201);
  return new URL(r.body.url).pathname;
}
const sale = (o = {}) => ({ transaction_id: `T${++uid}`, status: 'approved', amount: 197, product_name: 'Mentoria APQR', email: `c${uid}@compra.test`, name: 'Cliente Teste', ...o });

describe('leitura genérica', () => {
  test('valores, status e nomes de campo em português/inglês', () => {
    assert.equal(toCents('1.234,56'), 123456);
    assert.equal(toCents('R$ 197,00'), 19700);
    assert.equal(toCents(197.9), 19790);
    assert.equal(toCents(19700, true), 19700);
    assert.equal(toCents('-5'), null);
    assert.deepEqual(['Aprovado', 'PURCHASE_APPROVED', 'Reembolsado', 'chargeback', 'Aguardando pagamento', 'boleto_impresso', 'Cancelado', 'xyz'].map(mapStatus),
      ['approved', 'approved', 'refunded', 'chargeback', 'pending', 'pending', 'canceled', null]);
    const n = normalizePayload({ evento: 'compra_aprovada', pedido: { id: 77, valor: '1.997,00' }, cliente: { nome: 'Ana', email: 'ANA@X.COM', cpf: '000.000.000-00' }, produto: { nome: 'Mentoria' } });
    assert.equal(n.sale.external_id, '77');
    assert.equal(n.sale.amount_cents, 199700);
    assert.equal(n.sale.buyer_email, 'ana@x.com');
    assert.equal(n.sale.buyer_cpf, null); // CPF inválido é descartado
    assert.equal(n.sale.product_name, 'Mentoria');
    assert.match(normalizePayload({ foo: 1 }).error, /identificar/);
  });
});

describe('recebimento por webhook', () => {
  test('endereço inválido → 404; vale sem cabeçalho CSRF; venda aparece com produto criado sozinho', async () => {
    assert.equal((await post('/api/webhooks/sales/abcdefghijklmnopqrstuvwxyz', sale())).status, 404);
    const url = await endpoint(A);
    const r = await post(url, sale({ transaction_id: 'W1', amount: '297,00' }));
    assert.equal(r.status, 200);
    assert.equal(r.body.result, 'processed');
    const list = (await A.teacher.get('/api/teacher/finance/sales')).body.sales;
    const s = list.find((x) => x.external_id === 'W1');
    assert.equal(s.amount_cents, 29700);
    assert.equal(s.status, 'approved');
    const prods = (await A.teacher.get('/api/teacher/finance/products')).body.products;
    assert.ok(prods.find((p) => p.name === 'Mentoria APQR' && p.auto_created));
  });

  test('repetição não duplica; status só avança; evento atrasado é ignorado', async () => {
    const url = await endpoint(A, 'Repete');
    const base = sale({ transaction_id: 'R1', status: 'pending' });
    await post(url, base);
    await post(url, { ...base, status: 'approved' });
    await post(url, { ...base, status: 'approved' });
    await post(url, { ...base, status: 'pending' }); // atrasado
    const mine = (await A.teacher.get('/api/teacher/finance/sales')).body.sales.filter((x) => x.external_id === 'R1');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].status, 'approved');
    const det = (await A.teacher.get(`/api/teacher/finance/sales/${mine[0].id}`)).body;
    assert.deepEqual(det.events.map((e) => e.status), ['pending', 'approved']);
    await post(url, { ...base, status: 'refunded' });
    const after = (await A.teacher.get('/api/teacher/finance/sales')).body.sales.find((x) => x.external_id === 'R1');
    assert.equal(after.status, 'refunded');
    await post(url, { ...base, status: 'approved' }); // voltar não pode
    assert.equal((await A.teacher.get('/api/teacher/finance/sales')).body.sales.find((x) => x.external_id === 'R1').status, 'refunded');
  });

  test('carga não entendida fica guardada e pode ser vista na caixa de entrada', async () => {
    const url = await endpoint(A, 'Estranho');
    const r = await post(url, { coisa: 'sem sentido' });
    assert.equal(r.status, 200);
    assert.equal(r.body.result, 'ignored');
    const inbox = (await A.teacher.get('/api/teacher/finance/integration')).body.inbox;
    assert.ok(inbox.find((i) => i.result === 'ignored' && i.payload.includes('sem sentido')));
  });

  test('formulário (x-www-form-urlencoded) também é aceito', async () => {
    const url = await endpoint(A, 'Form');
    const r = await request(app).post(url).type('form').send({ transaction_id: 'F1', status: 'paid', amount: '99.90', email: 'f1@x.test', product_name: 'Curso Y' });
    assert.equal(r.body.result, 'processed');
  });

  test('endereço revogado deixa de receber', async () => {
    const url = await endpoint(A, 'Revogar');
    const eps = (await A.teacher.get('/api/teacher/finance/integration')).body.endpoints;
    const ep = eps.find((e) => e.url.endsWith(url.split('/').pop()));
    assert.equal((await A.teacher.post(`/api/teacher/finance/endpoints/${ep.id}/revoke`).send({})).status, 200);
    assert.equal((await post(url, sale())).status, 404);
  });
});

describe('acesso do aluno', () => {
  test('não libera acesso sem ligar a opção; ligando, cria o aluno com plano e renova no segundo pagamento', async () => {
    const p = (await A.teacher.post('/api/teacher/finance/products').send({ name: 'Mentoria 90 dias', kind: 'mentoria', grants_access: true, plan_days: 90, cohort: 'ANVISA', edital_id: A.edital.id })).body;
    assert.ok(p.id);
    const url = await endpoint(A, 'Acesso');
    const e1 = `novo1@compra.test`;
    await post(url, sale({ transaction_id: 'G1', email: e1, product_name: 'Mentoria 90 dias' }));
    let roster = (await A.teacher.get('/api/teacher/roster')).body.students;
    assert.equal(roster.find((s) => s.email === e1), undefined, 'opção desligada: nada criado');

    assert.equal((await A.teacher.put('/api/teacher/finance/settings').send({ auto_access: true })).status, 200);
    const e2 = `novo2@compra.test`;
    await post(url, sale({ transaction_id: 'G2', email: e2, product_name: 'Mentoria 90 dias' }));
    roster = (await A.teacher.get('/api/teacher/roster')).body.students;
    const st = roster.find((s) => s.email === e2);
    assert.ok(st);
    assert.equal(st.plan_end, addDays(T, 90));
    assert.equal(st.cohort, 'ANVISA');
    // segundo pagamento soma a partir do fim atual
    await post(url, sale({ transaction_id: 'G3', email: e2, product_name: 'Mentoria 90 dias' }));
    roster = (await A.teacher.get('/api/teacher/roster')).body.students;
    assert.equal(roster.find((s) => s.email === e2).plan_end, addDays(T, 180));
  });

  test('reembolso encerra o plano concedido; manter plano se outra venda o sustenta', async () => {
    const url = await endpoint(A, 'Reembolso');
    const e = 'reemb@compra.test';
    await post(url, sale({ transaction_id: 'X1', email: e, product_name: 'Mentoria 90 dias' }));
    let st = (await A.teacher.get('/api/teacher/roster')).body.students.find((s) => s.email === e);
    assert.equal(st.plan, 'active');
    await post(url, sale({ transaction_id: 'X1', email: e, status: 'refunded', product_name: 'Mentoria 90 dias' }));
    st = (await A.teacher.get('/api/teacher/roster')).body.students.find((s) => s.email === e);
    assert.equal(st.plan, 'ended');
  });

  test('vincula compra a aluno existente pelo e-mail', async () => {
    const url = await endpoint(A, 'Vinculo');
    const stu = A.students[0];
    await post(url, sale({ transaction_id: 'V1', email: stu.email }));
    const s = (await A.teacher.get('/api/teacher/finance/sales')).body.sales.find((x) => x.external_id === 'V1');
    assert.equal(s.student_id, stu.studentId);
  });
});

describe('painel, manual e importação', () => {
  test('indicadores: bruto, reembolso, líquido, ticket', async () => {
    const t = await createTenantWithClass(admin.agent, { slug: 'fin-c', students: 0 });
    const url = await endpoint(t);
    await post(url, sale({ transaction_id: 'K1', amount: 100 }));
    await post(url, sale({ transaction_id: 'K2', amount: 300 }));
    await post(url, sale({ transaction_id: 'K3', amount: 200 }));
    await post(url, sale({ transaction_id: 'K3', amount: 200, status: 'refunded' }));
    await post(url, sale({ transaction_id: 'K4', amount: 50, status: 'pending' }));
    const d = (await t.teacher.get('/api/teacher/finance/dashboard')).body;
    assert.equal(d.kpi.gross_cents, 60000);
    assert.equal(d.kpi.refunded_cents, 20000);
    assert.equal(d.kpi.net_cents, 40000);
    assert.equal(d.kpi.sales_paid, 3);
    assert.equal(d.kpi.pending, 1);
    assert.equal(d.kpi.ticket_cents, 20000);
    assert.equal(d.series.at(-1).date, T);
    assert.equal(d.series.at(-1).cents, 60000);
  });

  test('lançamento manual e mudança de status só para frente', async () => {
    const r = await A.teacher.post('/api/teacher/finance/sales').send({ buyer_name: 'Pagou no Pix', buyer_email: 'pix@x.test', amount: '500,00', product_name: 'Aula avulsa' });
    assert.equal(r.status, 201);
    const id = r.body.sale_id;
    assert.equal((await A.teacher.post(`/api/teacher/finance/sales/${id}/status`).send({ status: 'refunded' })).status, 200);
    const back = await A.teacher.post(`/api/teacher/finance/sales/${id}/status`).send({ status: 'approved' });
    assert.equal(back.status, 400);
  });

  test('importa CSV (simulação não grava; reimportar não duplica; nunca libera acesso)', async () => {
    const csv = `id;data;status;produto;valor;nome;email\r\nP1;10/09/2026;aprovado;Mentoria;1.997,00;Bia;bia@imp.test\r\nP2;11/09/2026;reembolsado;Mentoria;1.997,00;Caio;caio@imp.test\r\nP3;xx;aprovado;Mentoria;10;Dani;d@imp.test\r\n`;
    const dry = (await A.teacher.post('/api/teacher/finance/sales/import').send({ csv, dry_run: true })).body;
    assert.equal(dry.created, 2);
    assert.equal(dry.skipped, 1);
    assert.equal((await A.teacher.get('/api/teacher/finance/sales')).body.sales.some((s) => s.external_id === 'P1'), false);
    const real = (await A.teacher.post('/api/teacher/finance/sales/import').send({ csv })).body;
    assert.equal(real.created, 2);
    const again = (await A.teacher.post('/api/teacher/finance/sales/import').send({ csv })).body;
    assert.equal(again.created, 0);
    assert.equal(again.unchanged, 2);
    const roster = (await A.teacher.get('/api/teacher/roster')).body.students;
    assert.equal(roster.some((s) => s.email === 'bia@imp.test'), false);
    const csvOut = await A.teacher.get('/api/teacher/finance/sales/export.csv');
    assert.equal(csvOut.status, 200);
    assert.match(csvOut.text, /bia@imp\.test/);
  });
});

describe('permissões e isolamento', () => {
  test('aluno e visitante não acessam; outro ambiente não vê as vendas', async () => {
    assert.equal((await A.students[0].agent.get('/api/teacher/finance/sales')).status, 403);
    assert.equal((await agent().get('/api/teacher/finance/sales')).status, 401);
    const bSales = (await B.teacher.get('/api/teacher/finance/sales')).body.sales;
    assert.equal(bSales.length, 0);
    const bUrl = await endpoint(B, 'Checkout B');
    await post(bUrl, sale({ transaction_id: 'ISO1' }));
    assert.equal((await A.teacher.get('/api/teacher/finance/sales')).body.sales.some((s) => s.external_id === 'ISO1'), false);
    assert.equal((await B.teacher.get('/api/teacher/finance/sales')).body.sales.some((s) => s.external_id === 'ISO1'), true);
  });

  test('monitor não acessa o financeiro', async () => {
    const m = await A.teacher.post('/api/teacher/team').send({ name: 'Monitor Teste', email: 'mon-fin@oneup.test' });
    assert.equal(m.status, 201);
    const a = agent();
    await a.post(`/api/auth/invite/${m.body.invite.url.split('/').pop()}`).send({ password: 'Senha12345' });
    assert.equal((await a.get('/api/teacher/finance/dashboard')).status, 403);
  });
});
