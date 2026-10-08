/**
 * Autenticação: senhas, sessões e contexto de segurança da requisição.
 *
 *  - Senhas com bcrypt (assíncrono, não bloqueia o servidor).
 *  - Sessão = token aleatório de 256 bits em cookie httpOnly; no banco só o hash SHA-256.
 *  - Toda requisição autenticada ganha `req.ctx` = contexto usado pela Row-Level Security.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { tx, SYSTEM } from '../db/index.js';
import { HttpError, forbidden, isUuid, now, nowIso, today } from '../lib/util.js';

export const SESSION_COOKIE = 'oneup_session';
const SESSION_DAYS = 30;
const BCRYPT_COST = 11;
// Hash fictício: o login gasta o mesmo tempo exista ou não o e-mail (não revela contas).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const hashPassword = (pw) => bcrypt.hash(pw, BCRYPT_COST);
export async function verifyPassword(pw, hash) {
  return bcrypt.compare(pw, hash || DUMMY_HASH).then((ok) => ok && !!hash);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_INSECURE !== '1',
    path: '/',
    maxAge: SESSION_DAYS * 86400000,
  };
}

export async function createSession(user, req) {
  const token = randomToken();
  const ts = nowIso();
  const expires = new Date(now().getTime() + SESSION_DAYS * 86400000).toISOString();
  await tx(SYSTEM, async (d) => {
    await d.run(
      'INSERT INTO sessions (token_hash, user_id, tenant_id, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)',
      [sha256(token), user.id, user.tenant_id, ts, expires, ts, req.ip || null, String(req.get?.('user-agent') || '').slice(0, 200)]
    );
    // Limpeza oportunista de sessões expiradas do próprio usuário.
    await d.run('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', [user.id, ts]);
  });
  return token;
}

export async function destroySession(token) {
  if (token) await tx(SYSTEM, (d) => d.run('DELETE FROM sessions WHERE token_hash = ?', [sha256(token)]));
}

export async function destroyUserSessions(d, userId, exceptToken = null) {
  if (exceptToken) await d.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', [userId, sha256(exceptToken)]);
  else await d.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

/** Carrega o usuário da sessão em req.user e monta req.ctx. */
export async function loadUser(req, _res, next) {
  req.user = null;
  req.ctx = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    const row = await tx(SYSTEM, (d) =>
      d.one(
        `SELECT u.id, u.tenant_id, u.email, u.name, u.role, u.status, u.timezone, s.expires_at, s.last_seen_at,
                st.id AS student_id, st.onboarding_done, st.access_until, st.plan_status, t.status AS tenant_status, t.slug AS tenant_slug
           FROM sessions s JOIN users u ON u.id = s.user_id
           LEFT JOIN students st ON st.user_id = u.id
           LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE s.token_hash = ?`,
        [sha256(token)]
      )
    );
    const ts = nowIso();
    if (!row || row.expires_at <= ts || row.status !== 'active') return next();
    if (row.tenant_id && row.tenant_status !== 'active') return next();
    req.user = row;
    req.ctx = contextFor(row, req);
    // Atualiza "visto por último" no máximo a cada 10 minutos.
    if (new Date(ts) - new Date(row.last_seen_at) > 600000) {
      tx(SYSTEM, (d) => d.run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', [ts, sha256(token)])).catch(() => {});
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

/**
 * Contexto de segurança. Alunos, professoras e monitores ficam presos ao próprio ambiente.
 * O administrador ONE UP tem contexto global; para operar DENTRO de um ambiente envia
 * o cabeçalho X-Tenant-Id e passa a ser filtrado pela RLS daquele ambiente.
 */
export function contextFor(user, req) {
  const base = {
    userId: user.id,
    role: user.role,
    studentId: user.student_id || null,
    tz: user.timezone || 'America/Sao_Paulo',
    ip: req?.ip || null,
  };
  if (user.role === 'platform_admin') {
    const acting = req?.get?.('x-tenant-id');
    if (acting && isUuid(acting)) return { ...base, tenantId: acting.toLowerCase(), platform: false, actingAsPlatform: true };
    return { ...base, tenantId: null, platform: true };
  }
  return { ...base, tenantId: user.tenant_id, platform: false };
}

// ───────────── Guardas de rota ─────────────
const unauth = () => new HttpError(401, 'Faça login para continuar.', 'unauthenticated');

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauth());
  next();
}

/**
 * Papéis permitidos na rota.
 *  - 'platform_admin' em rotas de plataforma: contexto global.
 *  - rotas de ambiente ('teacher'): o admin ONE UP só entra operando um ambiente (X-Tenant-Id),
 *    e aí age com os poderes da professora daquele ambiente (auditado).
 */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauth());
    const r = req.user.role;
    if (r === 'platform_admin') {
      if (roles.includes('platform_admin') && !req.ctx.actingAsPlatform) return next();
      if (roles.includes('teacher') && req.ctx.actingAsPlatform) return next();
      return next(forbidden(req.ctx.actingAsPlatform ? 'Saia do ambiente para usar o console ONE UP.' : 'Selecione um ambiente para acessar esta área.'));
    }
    if (roles.includes(r)) return next();
    return next(forbidden(r === 'student' ? 'Área exclusiva da mentoria.' : 'Você não tem permissão para acessar este recurso.'));
  };
}

export const isStaff = (ctx) => ['teacher', 'coordinator', 'mentor'].includes(ctx.role) || !!ctx.actingAsPlatform;
export const isTeacher = (ctx) => ctx.role === 'teacher' || !!ctx.actingAsPlatform;

/** Limitador de tentativas por chave (IP). Memória do processo — complementa o bloqueio por conta. */
const attempts = new Map();
export function rateLimit(key, max = 10, windowMs = 60_000) {
  const t = Date.now();
  const list = (attempts.get(key) || []).filter((x) => t - x < windowMs);
  if (list.length >= max) throw new HttpError(429, 'Muitas tentativas. Aguarde um minuto e tente novamente.', 'rate_limited');
  list.push(t);
  attempts.set(key, list);
  if (attempts.size > 50_000) attempts.clear();
}
export const resetRateLimits = () => attempts.clear();

/** Situação de acesso do aluno logado, pelo resumo mantido em students (validade + plano). */
export function studentAccessState(user) {
  if (!user || user.role !== 'student') return 'active';
  if (user.plan_status === 'ended') return 'expired';
  if (user.access_until && String(user.access_until).slice(0, 10) < today(user.timezone || undefined)) return 'expired';
  if (user.plan_status === 'paused') return 'paused';
  return 'active';
}

/** Aluno com acesso vencido/pausado: só vê o aviso, renova e baixa os próprios dados. Tudo o mais responde 403 no servidor. */
const OPEN_WHEN_BLOCKED = [/^\/api\/me\/access$/, /^\/api\/me\/export$/, /^\/api\/me\/terms(\/|$)/];
export function accessGuard(req, _res, next) {
  if (!req.user || req.user.role !== 'student') return next();
  const state = studentAccessState(req.user);
  if (state === 'active') return next();
  const path = req.originalUrl.split('?')[0];
  if (OPEN_WHEN_BLOCKED.some((re) => re.test(path))) return next();
  return next(new HttpError(403, state === 'paused' ? 'Seu plano está pausado.' : 'Seu período de acesso encerrou.', state === 'paused' ? 'access_paused' : 'access_expired'));
}
