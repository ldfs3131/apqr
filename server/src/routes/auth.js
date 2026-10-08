import { Router } from 'express';
import { z } from 'zod';
import { tx, SYSTEM } from '../db/index.js';
import {
  SESSION_COOKIE, cookieOptions, createSession, destroySession, destroyUserSessions, hashPassword, verifyPassword,
  sha256, rateLimit, requireAuth, studentAccessState,
} from '../security/auth.js';
import { audit } from '../security/access.js';
import { currentTerms, hasAccepted } from '../domain/termos.js';
import { ah, badRequest, HttpError, now, nowIso, today } from '../lib/util.js';
import { sendMail } from '../lib/mailer.js';
import { getInvite, completeInvite, validatePassword, createResetToken, resetUrl, completeProfile } from '../domain/people.js';
import { formatCpf } from '../lib/cpf.js';

const r = Router();
const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

export function parse(schema, data) {
  const res = schema.safeParse(data ?? {});
  if (!res.success) {
    const first = res.error.issues[0];
    throw badRequest(first.message, 'validation', res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return res.data;
}

const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido.');

/** Dados do usuário para o frontend (sem hashes; CPF só para o próprio aluno). */
export async function publicUser(userId) {
  return tx(SYSTEM, async (d) => {
    const u = await d.one(
      `SELECT u.id, u.email, u.name, u.role, u.timezone, u.tenant_id, u.created_at,
              st.id AS student_id, st.onboarding_done, st.phone, st.goal, st.cpf, st.city, st.state, st.plan_status, st.access_until, st.photo_file_id,
              t.name AS tenant_name, t.slug AS tenant_slug, t.brand AS tenant_brand
         FROM users u LEFT JOIN students st ON st.user_id = u.id LEFT JOIN tenants t ON t.id = u.tenant_id WHERE u.id = ?`,
      [userId]
    );
    if (!u) return null;
    if (u.role === 'student' && u.student_id) {
      const cur = await currentTerms(d, u.tenant_id);
      u.terms_ok = await hasAccepted(d, u.student_id, cur.version);
      u.terms_version = cur.version;
      u.has_consultoria = !!(await d.one("SELECT 1 AS x FROM accesses WHERE student_id = ? AND kind = 'consultoria' AND status = 'active' LIMIT 1", [u.student_id]));
    }
    return { ...u, cpf: formatCpf(u.cpf), profile_complete: u.role !== 'student' || !!u.cpf, terms_pending: u.role === 'student' && !!u.cpf && !!u.student_id && !u.terms_ok, access_state: studentAccessState({ ...u, plan_status: u.plan_status, access_until: u.access_until }), tenant: u.tenant_id ? { id: u.tenant_id, name: u.tenant_name, slug: u.tenant_slug, brand: u.tenant_brand } : null };
  });
}

r.post('/login', ah(async (req, res) => {
  rateLimit(`login:${req.ip}`, 20);
  const body = parse(z.object({ email: emailSchema, password: z.string().min(1, 'Informe a senha.').max(200) }), req.body);
  const u = await tx(SYSTEM, (d) =>
    d.one(
      `SELECT u.*, st.access_until, st.plan_status, t.status AS tenant_status FROM users u LEFT JOIN students st ON st.user_id = u.id
         LEFT JOIN tenants t ON t.id = u.tenant_id WHERE lower(u.email) = lower(?)`,
      [body.email]
    )
  );
  if (u?.locked_until && u.locked_until > nowIso()) {
    throw new HttpError(429, `Muitas tentativas incorretas. Tente novamente em alguns minutos ou redefina sua senha.`, 'locked');
  }
  const ok = await verifyPassword(body.password, u?.password_hash);
  if (!u || !ok) {
    if (u) {
      const failed = u.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? new Date(now().getTime() + LOCK_MINUTES * 60000).toISOString() : null;
      await tx(SYSTEM, async (d) => {
        await d.run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', [lock ? 0 : failed, lock, u.id]);
        if (lock) await audit(d, { userId: u.id, ip: req.ip }, 'auth.locked', { targetType: 'user', targetId: u.id, tenantId: u.tenant_id });
      });
    }
    throw new HttpError(401, 'E-mail ou senha incorretos.', 'invalid_credentials');
  }
  if (u.status === 'invited') throw new HttpError(403, 'Conclua seu cadastro pelo link de convite enviado pela sua professora.', 'invite_pending');
  if (u.status !== 'active') throw new HttpError(403, 'Conta desativada. Fale com a sua professora.', 'inactive');
  if (u.tenant_id && u.tenant_status !== 'active') throw new HttpError(403, 'Ambiente indisponível. Fale com o suporte.', 'tenant_suspended');
  // V3.0: aluno com acesso vencido ou plano pausado ENTRA e vê o aviso (o servidor bloqueia o resto; ver accessGuard).
  await tx(SYSTEM, (d) => d.run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', [nowIso(), u.id]));
  const token = await createSession(u, req);
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.json({ user: await publicUser(u.id) });
}));

r.post('/logout', ah(async (req, res) => {
  await destroySession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
}));

r.get('/me', ah(async (req, res) => {
  res.json({ user: req.user ? await publicUser(req.user.id) : null });
}));

// ───────────── Convite ─────────────
r.get('/invite/:token', ah(async (req, res) => {
  rateLimit(`invite:${req.ip}`, 30);
  res.json({ invite: await getInvite(req.params.token) });
}));

r.post('/invite/:token', ah(async (req, res) => {
  rateLimit(`invite-complete:${req.ip}`, 10);
  const user = await completeInvite(req.params.token, req.body || {}, req.ip);
  const token = await createSession(user, req);
  res.cookie(SESSION_COOKIE, token, cookieOptions());
  res.status(201).json({ user: await publicUser(user.id) });
}));

// ───────────── Senha ─────────────
r.post('/forgot', ah(async (req, res) => {
  rateLimit(`forgot:${req.ip}`, 5);
  const body = parse(z.object({ email: emailSchema }), req.body);
  const u = await tx(SYSTEM, (d) => d.one("SELECT id, email, name, tenant_id FROM users WHERE lower(email) = lower(?) AND status = 'active'", [body.email]));
  if (u) {
    const token = await tx(SYSTEM, (d) => createResetToken(d, u.id, u.tenant_id));
    // Sem SMTP configurado, nada é enviado nem registrado em log (o link é um segredo).
    await sendMail({
      to: u.email,
      subject: 'Redefinição de senha',
      text: `Olá, ${u.name}!\n\nPara criar uma nova senha, acesse o link abaixo (válido por 1 hora):\n${resetUrl(req, token)}\n\nSe você não pediu a redefinição, ignore esta mensagem.`,
    });
  }
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha. Se não chegar, peça o link à sua professora.' });
}));

r.post('/reset', ah(async (req, res) => {
  rateLimit(`reset:${req.ip}`, 10);
  const body = parse(z.object({ token: z.string().min(10).max(200), password: z.string() }), req.body);
  validatePassword(body.password);
  const hash = await hashPassword(body.password);
  await tx(SYSTEM, async (d) => {
    const row = await d.one('SELECT * FROM password_resets WHERE token_hash = ? FOR UPDATE', [sha256(body.token)]);
    if (!row || row.used_at || row.expires_at < nowIso()) throw badRequest('Link inválido ou expirado. Solicite um novo.', 'invalid_token');
    await d.run('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [hash, nowIso(), row.user_id]);
    await d.run('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', [nowIso(), row.token_hash]);
    await destroyUserSessions(d, row.user_id);
    await audit(d, { userId: row.user_id, ip: req.ip }, 'auth.password_reset', { targetType: 'user', targetId: row.user_id, tenantId: row.tenant_id });
  });
  res.json({ ok: true, message: 'Senha alterada. Faça login com a nova senha.' });
}));

r.post('/change-password', requireAuth, ah(async (req, res) => {
  const body = parse(z.object({ current_password: z.string().min(1), new_password: z.string() }), req.body);
  validatePassword(body.new_password);
  const u = await tx(SYSTEM, (d) => d.one('SELECT id, password_hash, tenant_id FROM users WHERE id = ?', [req.user.id]));
  if (!(await verifyPassword(body.current_password, u.password_hash))) throw badRequest('Senha atual incorreta.', 'wrong_password');
  const hash = await hashPassword(body.new_password);
  await tx(SYSTEM, async (d) => {
    await d.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, nowIso(), u.id]);
    await destroyUserSessions(d, u.id, req.cookies[SESSION_COOKIE]);
    await audit(d, req.ctx, 'auth.password_change', { targetType: 'user', targetId: u.id, tenantId: u.tenant_id });
  });
  res.json({ ok: true, message: 'Senha alterada.' });
}));

/** Aluno com cadastro incompleto (importado da V1) informa CPF, endereço e aceita os termos. */
r.post('/complete-profile', requireAuth, ah(async (req, res) => {
  if (req.user.role !== 'student') throw badRequest('Apenas alunos completam este cadastro.');
  await tx(req.ctx, (d) => completeProfile(d, req.ctx, req.body || {}));
  res.json({ user: await publicUser(req.user.id) });
}));

/** Perfil do próprio usuário (nome, objetivo, telefone; onboarding do aluno). CPF não é alterável aqui. */
r.patch('/profile', requireAuth, ah(async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(3).max(120).optional(),
    phone: z.string().trim().max(20).optional(),
    goal: z.string().trim().max(300).nullable().optional(),
    onboarding_done: z.boolean().optional(),
  }), req.body);
  await tx(req.ctx, async (d) => {
    if (body.name) await d.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [body.name, nowIso(), req.user.id]);
    if (req.user.role === 'student') {
      if (body.phone !== undefined) {
        const p = body.phone.replace(/\D/g, '');
        if (p.length < 10 || p.length > 11) throw badRequest('Telefone inválido.');
        await d.run('UPDATE students SET phone = ?, updated_at = ? WHERE id = ?', [p, nowIso(), req.user.student_id]);
      }
      if (body.goal !== undefined) await d.run('UPDATE students SET goal = ?, updated_at = ? WHERE id = ?', [body.goal || null, nowIso(), req.user.student_id]);
      if (body.onboarding_done !== undefined) await d.run('UPDATE students SET onboarding_done = ? WHERE id = ?', [body.onboarding_done, req.user.student_id]);
    }
  });
  res.json({ user: await publicUser(req.user.id) });
}));

export default r;
