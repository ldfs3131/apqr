/** Console do administrador ONE UP (acesso global, auditado). */
import { Router } from 'express';
import { z } from 'zod';
import { tx, dbKind } from '../db/index.js';
import { requireRole } from '../security/auth.js';
import { audit } from '../security/access.js';
import { ah, badRequest, notFound, nowIso, parseId, addDays, today } from '../lib/util.js';
import { parse } from './auth.js';
import { createTenant, createInvite } from '../domain/people.js';
import { aiStatus } from '../domain/ai/provider.js';

const r = Router();
r.use(requireRole('platform_admin'));

r.get('/overview', ah(async (req, res) => {
  const t = today();
  const data = await tx(req.ctx, async (d) => ({
    tenants: await d.all(
      `SELECT t.id, t.slug, t.name, t.status, t.created_at,
              (SELECT count(*) FROM students s WHERE s.tenant_id = t.id) AS students,
              (SELECT count(*) FROM users u WHERE u.tenant_id = t.id AND u.role = 'student' AND u.status = 'active') AS active_students,
              (SELECT count(DISTINCT student_id) FROM daily_activity a WHERE a.tenant_id = t.id AND a.date >= ?) AS active_7d,
              (SELECT count(*) FROM editais e WHERE e.tenant_id = t.id AND e.archived_at IS NULL) AS editais,
              (SELECT u.name FROM users u WHERE u.tenant_id = t.id AND u.role = 'teacher' ORDER BY u.created_at LIMIT 1) AS teacher_name
         FROM tenants t ORDER BY t.created_at`,
      [addDays(t, -6)]
    ),
    totals: await d.one(
      `SELECT (SELECT count(*) FROM tenants) AS tenants, (SELECT count(*) FROM students) AS students,
              (SELECT count(*) FROM ai_reports WHERE created_at >= ?) AS ai_reports_30d,
              (SELECT COALESCE(sum(cost_usd), 0) FROM ai_reports WHERE created_at >= ?) AS ai_cost_30d`,
      [new Date(Date.now() - 30 * 86400000).toISOString(), new Date(Date.now() - 30 * 86400000).toISOString()]
    ),
  }));
  res.json({ ...data, system: { database: dbKind(), ai: aiStatus(), node: process.version } });
}));

r.post('/tenants', ah(async (req, res) => {
  const body = parse(z.object({ slug: z.string(), name: z.string(), teacher_name: z.string(), teacher_email: z.string(), primary_color: z.string().optional() }), req.body);
  res.status(201).json(await createTenant(req.ctx, body, req));
}));

r.patch('/tenants/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ambiente');
  const body = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), status: z.enum(['active', 'suspended']).optional() }), req.body);
  const out = await tx(req.ctx, async (d) => {
    const t = await d.one('SELECT * FROM tenants WHERE id = ?', [id]);
    if (!t) throw notFound('Ambiente não encontrado.');
    if (body.name) await d.run('UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?', [body.name, nowIso(), id]);
    if (body.status) await d.run('UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?', [body.status, nowIso(), id]);
    await audit(d, req.ctx, 'platform.tenant_update', { targetType: 'tenant', targetId: id, tenantId: id, payload: body });
    return d.one('SELECT * FROM tenants WHERE id = ?', [id]);
  });
  res.json({ tenant: out });
}));

/** Novo convite para a professora do ambiente (ex.: perdeu o link antes de concluir o cadastro). */
r.post('/tenants/:id/teacher-invite', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ambiente');
  const invite = await tx(req.ctx, async (d) => {
    const u = await d.one("SELECT id, email, name, role, status FROM users WHERE tenant_id = ? AND role = 'teacher' ORDER BY created_at LIMIT 1", [id]);
    if (!u) throw notFound('Professora não encontrada.');
    if (u.status !== 'invited') throw badRequest('A professora já concluiu o cadastro. Para trocar a senha, use "Esqueci minha senha".');
    const inv = await createInvite(d, req.ctx, u, id, req);
    await audit(d, req.ctx, 'platform.teacher_invite', { targetType: 'user', targetId: u.id, tenantId: id });
    return inv;
  });
  res.json({ invite });
}));

/** Registra a entrada do admin ONE UP num ambiente (as requisições seguintes usam X-Tenant-Id). */
r.post('/tenants/:id/enter', ah(async (req, res) => {
  const id = parseId(req.params.id, 'ambiente');
  const t = await tx(req.ctx, async (d) => {
    const row = await d.one('SELECT id, name, slug, brand FROM tenants WHERE id = ?', [id]);
    if (!row) throw notFound('Ambiente não encontrado.');
    await audit(d, req.ctx, 'platform.enter_tenant', { targetType: 'tenant', targetId: id, tenantId: id });
    return row;
  });
  res.json({ tenant: t });
}));

r.get('/users', ah(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const rows = await tx(req.ctx, (d) =>
    d.all(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.created_at, t.name AS tenant_name
         FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE (? = '' OR u.name ILIKE '%' || ? || '%' OR u.email ILIKE '%' || ? || '%')
          AND (? = '' OR u.role = ?)
        ORDER BY u.created_at DESC LIMIT 100`,
      [q, q, q, String(req.query.role || ''), String(req.query.role || '')]
    )
  );
  res.json({ users: rows });
}));

r.patch('/users/:id', ah(async (req, res) => {
  const id = parseId(req.params.id, 'usuário');
  const body = parse(z.object({ status: z.enum(['active', 'disabled']) }), req.body);
  await tx(req.ctx, async (d) => {
    const u = await d.one('SELECT id, tenant_id, role, status FROM users WHERE id = ?', [id]);
    if (!u) throw notFound('Usuário não encontrado.');
    if (id === req.ctx.userId) throw badRequest('Você não pode desativar a própria conta.');
    if (u.status === 'invited') throw badRequest('Este usuário ainda não concluiu o cadastro.');
    await d.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [body.status, nowIso(), id]);
    if (body.status === 'disabled') await d.run('DELETE FROM sessions WHERE user_id = ?', [id]);
    await audit(d, req.ctx, 'platform.user_status', { targetType: 'user', targetId: id, tenantId: u.tenant_id, payload: body });
  });
  res.json({ ok: true });
}));

r.get('/audit', ah(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.tenant_id) { where.push('a.tenant_id = ?'); params.push(parseId(req.query.tenant_id, 'ambiente')); }
  if (req.query.action) { where.push('a.action LIKE ?'); params.push(`${String(req.query.action).replace(/[%_]/g, '').slice(0, 40)}%`); }
  const rows = await tx(req.ctx, (d) =>
    d.all(
      `SELECT a.*, u.name AS actor_name, u.role AS actor_role, t.name AS tenant_name FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id LEFT JOIN tenants t ON t.id = a.tenant_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY a.created_at DESC LIMIT 300`,
      params
    )
  );
  res.json({ audit: rows });
}));

export default r;
