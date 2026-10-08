/**
 * Registro estruturado (uma linha JSON por evento), lido direto pelos painéis de hospedagem (Render, Railway, Fly…).
 * Nunca registra corpo de requisição, senha, token, CPF ou e-mail. Caminhos são registrados como o padrão da rota
 * (ex.: /api/auth/invite/:token), nunca com o valor real.
 *   LOG_LEVEL=debug|info|warn|error (padrão info; em testes, silencioso)
 */
import { randomUUID } from 'node:crypto';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = () => LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')] ?? 20;

export function log(level, msg, fields = {}) {
  if ((LEVELS[level] ?? 20) < threshold()) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

/** Padrão da rota sem valores (ids, tokens): usa a rota do Express; sem ela, mascara segmentos longos. */
export function routeOf(req) {
  if (req.route?.path) return `${req.baseUrl || ''}${req.route.path}`;
  return String(req.path || '').replace(/\/[^/]{16,}/g, '/:x');
}

export const SLOW_MS = () => Number(process.env.LOG_SLOW_MS) || 1000;

/** Identificador por requisição (aceita X-Request-Id de um proxy) + log de acesso da API com duração. */
export function requestLogger(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && /^[\w.-]{8,80}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  if (!req.path.startsWith('/api/')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
    const fields = {
      rid: req.id, method: req.method, route: routeOf(req), status: res.statusCode, ms,
      user: req.user?.id || null, role: req.user?.role || null, tenant: req.ctx?.tenantId || null,
    };
    const level = res.statusCode >= 500 ? 'error' : ms >= SLOW_MS() ? 'warn' : 'info';
    log(level, level === 'warn' ? 'request.slow' : 'request', fields);
  });
  next();
}
