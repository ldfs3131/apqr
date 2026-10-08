import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadUser, accessGuard } from './security/auth.js';
import { HttpError } from './lib/util.js';
import { log, requestLogger, routeOf } from './lib/log.js';
import { dbHealth } from './db/index.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import platformRoutes from './routes/platform.js';
import teacherRoutes from './routes/teacher.js';
import enrollmentRoutes from './routes/enrollments.js';
import meRoutes from './routes/me.js';
import fileRoutes from './routes/files.js';
import { financeRouter, webhookRouter } from './routes/finance.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Só confie em X-Forwarded-For quando houver proxy à frente (Render/Railway/Cloudflare: TRUST_PROXY=1).
  const tp = process.env.TRUST_PROXY;
  if (tp) app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp);

  app.use(requestLogger);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; " +
        "connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // CSRF: toda mutação exige X-Requested-With: apqr (outro site não consegue enviar sem CORS, que não habilitamos).
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !req.path.startsWith('/webhooks/') && req.get('X-Requested-With') !== 'apqr') {
      return next(new HttpError(403, 'Requisição inválida.', 'csrf'));
    }
    next();
  });

  app.use('/api', loadUser);
  // Saúde: o processo responde E o banco responde E todas as migrações do código estão aplicadas.
  app.get('/api/health', async (_req, res) => {
    const h = await dbHealth();
    res.status(h.ok ? 200 : 503).json({ ...h, version: process.env.APP_VERSION || null });
  });
  // Vivacidade simples (só o processo), para orquestradores que reiniciam contêineres.
  app.get('/api/health/live', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/platform', platformRoutes);
  app.use('/api/webhooks', webhookRouter);
  app.use('/api/teacher/finance', financeRouter);
  app.use('/api/teacher', teacherRoutes);
  app.use(['/api/enrollments', '/api/me', '/api/files'], accessGuard);
  app.use('/api/enrollments', enrollmentRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api/files', fileRoutes);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Rota não encontrada.', 'not_found')));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = process.env.WEB_DIST || path.resolve(here, '../../web/dist');
  if (fs.existsSync(dist)) {
    // O service worker e o manifesto precisam revalidar sempre (senão uma versão antiga do app fica presa no aparelho).
    app.get(['/sw.js', '/manifest.webmanifest', '/offline.html'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-cache'); next(); });
    app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '365d' }));
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'JSON inválido.' } });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: { message: 'Envio muito grande.' } });
    // Erros do Postgres traduzidos sem vazar detalhes internos
    if (err?.code === '22P02') return res.status(404).json({ error: { message: 'Registro não encontrado.', code: 'not_found' } });
    if (err?.code === '42501') return res.status(404).json({ error: { message: 'Registro não encontrado.', code: 'not_found' } });
    if (err?.code === '23505') return res.status(409).json({ error: { message: 'Registro duplicado.', code: 'duplicate' } });
    if (err?.code === '23514' || err?.code === '23502') return res.status(400).json({ error: { message: 'Dados inválidos.', code: 'invalid' } });
    log('error', 'unhandled', { rid: req.id, route: routeOf(req), err: err?.message, code: err?.code, user: req.user?.id || null, tenant: req.ctx?.tenantId || null, stack: err?.stack?.split('\n').slice(0, 5) });
    res.status(500).json({ error: { message: 'Erro interno. Tente novamente em instantes.', request_id: req.id } });
  });
  return app;
}
