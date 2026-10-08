/** Financeiro da professora (somente ela) e recebimento público de vendas (webhook). */
import { Router } from 'express';
import express from 'express';
import { z } from 'zod';
import { tx } from '../db/index.js';
import { requireRole, isTeacher, rateLimit } from '../security/auth.js';
import { audit } from '../security/access.js';
import { ah, addDays, forbidden, parseId, today, isValidDate, HttpError } from '../lib/util.js';
import { parse } from './auth.js';
import * as F from '../domain/finance.js';

export const financeRouter = Router();
financeRouter.use(requireRole('teacher'));
financeRouter.use((req, _res, next) => {
  if (!isTeacher(req.ctx)) return next(forbidden('Somente a professora acessa o financeiro.'));
  next();
});

const date = z.string().refine(isValidDate, 'Data inválida.');
const FILTER = z.object({
  status: z.enum(['pending', 'approved', 'refunded', 'chargeback', 'canceled']).optional(),
  product_id: z.string().uuid().optional(),
  from: date.optional(), to: date.optional(), q: z.string().max(80).optional(),
});

const periodOf = (req, q) => {
  const t = today(req.ctx.tz);
  const to = q.to || t;
  const from = q.from || addDays(to, -29);
  if (from > to) throw new HttpError(400, 'A data inicial é depois da final.', 'invalid');
  if (from < addDays(to, -800)) throw new HttpError(400, 'Período muito longo (máx. ~2 anos).', 'invalid');
  return { from, to };
};

financeRouter.get('/dashboard', ah(async (req, res) => {
  const q = parse(z.object({ from: date.optional(), to: date.optional() }), req.query);
  const p = periodOf(req, q);
  res.json(await tx(req.ctx, async (d) => ({ ...(await F.dashboard(d, { ...p, tz: req.ctx.tz })), recent: await F.recentPurchases(d, 6), settings: await F.getFinanceSettings(d, req.ctx.tenantId) })));
}));

/** Resumo curto para a Central (compras recentes e total do mês). */
financeRouter.get('/summary', ah(async (req, res) => {
  const t = today(req.ctx.tz);
  const from = `${t.slice(0, 7)}-01`;
  res.json(await tx(req.ctx, async (d) => ({ month: (await F.dashboard(d, { from, to: t, tz: req.ctx.tz })).kpi, recent: await F.recentPurchases(d, 5) })));
}));

financeRouter.get('/sales', ah(async (req, res) => {
  const f = parse(FILTER, req.query);
  res.json({ sales: await tx(req.ctx, (d) => F.listSales(d, f)), statuses: F.STATUS });
}));

financeRouter.get('/sales/export.csv', ah(async (req, res) => {
  const f = parse(FILTER, req.query);
  const rows = await tx(req.ctx, async (d) => {
    const r = await F.listSales(d, { ...f, limit: 5000 });
    await audit(d, req.ctx, 'finance.export', { payload: { rows: r.length } });
    return r;
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vendas-${today(req.ctx.tz)}.csv"`);
  res.send(F.salesCsv(rows, req.ctx.tz));
}));

financeRouter.get('/sales/template.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-vendas.csv"');
  res.send(F.SALES_TEMPLATE);
});

financeRouter.get('/sales/:id', ah(async (req, res) => {
  res.json(await tx(req.ctx, (d) => F.saleDetail(d, parseId(req.params.id, 'venda'))));
}));

financeRouter.post('/sales', ah(async (req, res) => {
  const b = parse(z.object({
    product_id: z.string().uuid().optional().nullable(), product_name: z.string().max(200).optional(),
    buyer_name: z.string().max(160).optional(), buyer_email: z.string().max(200).optional(), buyer_phone: z.string().max(40).optional(), buyer_cpf: z.string().max(20).optional(),
    amount: z.union([z.string(), z.number()]), status: z.enum(['pending', 'approved', 'refunded', 'chargeback', 'canceled']).optional(),
    payment_method: z.string().max(40).optional(), date: date.optional(), grant_access: z.boolean().optional(),
  }), req.body);
  res.status(201).json(await tx(req.ctx, (d) => F.manualSale(d, req.ctx, b)));
}));

financeRouter.post('/sales/:id/status', ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['approved', 'refunded', 'chargeback', 'canceled']), note: z.string().max(300).optional() }), req.body);
  res.json(await tx(req.ctx, (d) => F.changeStatus(d, req.ctx, parseId(req.params.id, 'venda'), b.status, b.note)));
}));

financeRouter.post('/sales/import', ah(async (req, res) => {
  const b = parse(z.object({ csv: z.string().min(1, 'Envie o arquivo.').max(5_000_000, 'Arquivo grande demais (máx. 5 MB).'), dry_run: z.boolean().optional() }), req.body);
  res.json(await F.importSales(req.ctx, b.csv, { dryRun: !!b.dry_run }));
}));

// Produtos
const PRODUCT = z.object({
  name: z.string().max(200), kind: z.enum(['curso', 'mentoria', 'outro']).optional(), external_ref: z.string().max(120).optional().nullable(),
  price_cents: z.number().int().min(0).max(100_000_000).optional().nullable(), grants_access: z.boolean().optional(), plan_days: z.number().int().min(1).max(3650).optional().nullable(),
  edital_id: z.string().uuid().optional().nullable(), cohort: z.string().max(120).optional().nullable(), active: z.boolean().optional(),
});
financeRouter.get('/products', ah(async (req, res) => {
  res.json(await tx(req.ctx, async (d) => ({ products: await F.listProducts(d), editais: await d.all('SELECT id, name FROM editais WHERE archived_at IS NULL ORDER BY name') })));
}));
financeRouter.post('/products', ah(async (req, res) => {
  res.status(201).json(await tx(req.ctx, (d) => F.saveProduct(d, req.ctx, null, parse(PRODUCT, req.body))));
}));
financeRouter.put('/products/:id', ah(async (req, res) => {
  res.json(await tx(req.ctx, (d) => F.saveProduct(d, req.ctx, parseId(req.params.id, 'produto'), parse(PRODUCT, req.body))));
}));

// Integração
financeRouter.get('/integration', ah(async (req, res) => {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const out = await tx(req.ctx, async (d) => ({
    endpoints: (await F.listEndpoints(d)).map((e) => ({ ...e, url: `${base}/api/webhooks/sales/${e.token}`, token: undefined })),
    inbox: (await F.listInbox(d, 40)).map((i) => ({ ...i, payload: i.payload.slice(0, 4000) })),
    settings: await F.getFinanceSettings(d, req.ctx.tenantId),
  }));
  res.json(out);
}));
financeRouter.post('/endpoints', ah(async (req, res) => {
  const { label } = parse(z.object({ label: z.string().max(60) }), req.body);
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const e = await tx(req.ctx, (d) => F.createEndpoint(d, req.ctx, label));
  res.status(201).json({ id: e.id, label: e.label, url: `${base}/api/webhooks/sales/${e.token}` });
}));
financeRouter.post('/endpoints/:id/revoke', ah(async (req, res) => {
  await tx(req.ctx, (d) => F.revokeEndpoint(d, req.ctx, parseId(req.params.id, 'endereço')));
  res.json({ ok: true });
}));
financeRouter.post('/inbox/:id/reprocess', ah(async (req, res) => {
  res.json(await tx(req.ctx, (d) => F.reprocessInbox(d, req.ctx, parseId(req.params.id, 'item'))));
}));
financeRouter.put('/settings', ah(async (req, res) => {
  const b = parse(z.object({ auto_access: z.boolean().optional(), end_on_refund: z.boolean().optional(), notify_email: z.string().max(200).nullable().optional() }), req.body);
  res.json(await tx(req.ctx, (d) => F.saveFinanceSettings(d, req.ctx, b)));
}));

/**
 * Recebimento público: POST /api/webhooks/sales/:token (JSON ou formulário).
 * Sem login e sem cabeçalho CSRF (quem chama é o servidor do checkout). O segredo é o próprio endereço.
 * Responde 200 mesmo quando o conteúdo não é entendido (fica na caixa de entrada); endereço inválido → 404.
 */
export const webhookRouter = Router();
webhookRouter.use(express.urlencoded({ extended: true, limit: '200kb' }));
webhookRouter.use(express.text({ type: ['text/*'], limit: '200kb' }));
webhookRouter.post('/sales/:token', ah(async (req, res) => {
  rateLimit(`wh:${req.ip}`, 300, 60_000);
  const ep = await F.findEndpoint(req.params.token);
  if (!ep) throw new HttpError(404, 'Endereço inválido.', 'not_found');
  rateLimit(`wh:${ep.id}`, 120, 60_000);
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const result = await F.receiveWebhook(ep, typeof req.body === 'object' ? req.body : null, raw);
  res.json({ ok: true, result });
}));
webhookRouter.get('/sales/:token', ah(async (req, res) => {
  const ep = await F.findEndpoint(req.params.token);
  if (!ep) throw new HttpError(404, 'Endereço inválido.', 'not_found');
  res.json({ ok: true, message: 'Endereço de recebimento ativo. Envie as vendas por POST.' });
}));
