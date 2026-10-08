/**
 * Camada de dados — PostgreSQL.
 *
 *  - Produção / CI: `DATABASE_URL` → node-postgres (pool).
 *  - Desenvolvimento local (inclusive Windows, sem instalar nada): sem DATABASE_URL, usa
 *    PGlite (Postgres real compilado para WebAssembly) gravando em ./data/pglite.
 *
 * TODA consulta passa por `tx(ctx, fn)`: abre transação e define o contexto de segurança
 * usado pela Row-Level Security (app.tenant_id / app.platform). O código NUNCA consulta
 * fora de um contexto — é isso que torna o isolamento entre ambientes verificável.
 *
 * Placeholders: pode-se escrever `?` (convertido para $1, $2...) ou `$n` diretamente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let impl = null;

const PARSERS = {
  1082: (v) => v, // date → 'YYYY-MM-DD' (sem conversão de fuso)
  1184: (v) => new Date(v).toISOString(), // timestamptz → ISO UTC
  20: (v) => Number(v), // bigint (COUNT/SUM) → number
  1700: (v) => Number(v), // numeric → number
};

/** Converte `?` em `$n`, ignorando trechos entre aspas simples. */
export function toPg(sql) {
  if (!sql.includes('?')) return sql;
  let n = 0;
  let out = '';
  let inStr = false;
  for (const ch of sql) {
    if (ch === "'") inStr = !inStr;
    if (ch === '?' && !inStr) out += `$${++n}`;
    else out += ch;
  }
  return out;
}

function wrap(raw) {
  const query = async (sql, params = []) => {
    const r = await raw.query(toPg(sql), params);
    return r.rows;
  };
  return {
    query,
    all: query,
    one: async (sql, params) => (await query(sql, params))[0] || null,
    run: async (sql, params = []) => {
      const r = await raw.query(toPg(sql), params);
      return r.affectedRows ?? r.rowCount ?? 0;
    },
    exec: (sql) => raw.exec ? raw.exec(sql) : raw.query(sql),
  };
}

async function openPg(url) {
  const pg = (await import('pg')).default;
  for (const [oid, fn] of Object.entries(PARSERS)) pg.types.setTypeParser(Number(oid), fn);
  const ssl = process.env.DATABASE_SSL === '0' || /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === '1' };
  // Superusuário (ou BYPASSRLS) ignora a Row-Level Security. Se a conexão vier com um usuário assim
  // (ex.: POSTGRES_USER da imagem oficial do Docker), a aplicação passa a operar como um papel comum.
  const probe = new pg.Client({ connectionString: url, ssl });
  await probe.connect();
  const privileged = (await probe.query('SELECT rolsuper OR rolbypassrls AS p FROM pg_roles WHERE rolname = current_user')).rows[0]?.p;
  if (privileged) {
    await probe.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apqr_owner') THEN CREATE ROLE apqr_owner NOLOGIN; END IF;
      END $$;
      GRANT CREATE, USAGE ON SCHEMA public TO apqr_owner;
    `);
    console.log('Aviso: o usuário do banco é privilegiado; a aplicação opera como o papel "apqr_owner" para que a RLS valha.');
  }
  await probe.end();
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX || 10), ssl });
  // 'connect' dispara antes de a conexão ser entregue; as consultas de um cliente são executadas em ordem.
  if (privileged) pool.on('connect', (client) => { client.query('SET ROLE apqr_owner').catch(() => {}); });
  return {
    kind: 'postgres',
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* conexão perdida */ }
        throw e;
      } finally {
        client.release();
      }
    },
    async raw(sql) { await pool.query(sql); },
    close: () => pool.end(),
  };
}

async function openPglite(dir) {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir && dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir || 'memory://', { parsers: PARSERS });
  await db.waitReady;
  // O usuário padrão do PGlite é superusuário (ignora RLS). Trabalhamos com um papel comum,
  // dono das tabelas, para que a Row-Level Security valha também em desenvolvimento.
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apqr_owner') THEN CREATE ROLE apqr_owner NOLOGIN; END IF;
    END $$;
    GRANT CREATE, USAGE ON SCHEMA public TO apqr_owner;
    SET ROLE apqr_owner;
  `);
  return {
    kind: 'pglite',
    transaction: (fn) => db.transaction((t) => fn(t)),
    async raw(sql) { await db.exec(sql); },
    close: () => db.close(),
  };
}

export async function openDb({ url = process.env.DATABASE_URL, pgliteDir = process.env.PGLITE_DIR } = {}) {
  if (impl) return impl;
  impl = url ? await openPg(url) : await openPglite(pgliteDir || path.resolve(process.cwd(), 'data/pglite'));
  await migrate();
  return impl;
}

export function dbKind() {
  return impl?.kind || null;
}

export async function closeDb() {
  if (impl) await impl.close();
  impl = null;
}

/** Contexto de sistema (autenticação, migrações, scripts). Usar com parcimônia. */
export const SYSTEM = Object.freeze({ platform: true, tenantId: null, system: true });

/**
 * Executa `fn(db)` numa transação com o contexto de segurança aplicado.
 * ctx = { tenantId, platform } — vem da sessão do usuário (ver security/context.js).
 */
export async function tx(ctx, fn, { snapshot = false } = {}) {
  if (!impl) throw new Error('Banco não inicializado (chame openDb).');
  if (!ctx) throw new Error('Contexto de segurança obrigatório.');
  return impl.transaction(async (raw) => {
    // snapshot: leitura consistente de todas as tabelas no mesmo instante (backup com o sistema no ar).
    if (snapshot) await raw.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await raw.query("SELECT set_config('app.tenant_id', $1, true), set_config('app.platform', $2, true)", [
      ctx.tenantId || '',
      ctx.platform ? 'on' : 'off',
    ]);
    return fn(wrap(raw));
  });
}

/** Atalho para leituras simples. */
export const q = (ctx, sql, params) => tx(ctx, (d) => d.all(sql, params));
export const q1 = (ctx, sql, params) => tx(ctx, (d) => d.one(sql, params));

async function migrate() {
  const dir = path.join(here, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  await impl.transaction(async (raw) => {
    await raw.query("SELECT pg_advisory_xact_lock(hashtext('apqr_migrations'))");
    await raw.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL)');
    const done = new Set((await raw.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      if (raw.exec) await raw.exec(sql);
      else await raw.query(sql);
      await raw.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, now())', [f]);
    }
  });
}

/** Saúde do banco: conexão, contexto de segurança e migrações do código todas aplicadas. Nunca lança. */
export async function dbHealth() {
  const t0 = Date.now();
  try {
    if (!impl) return { ok: false, database: 'down', error: 'banco não inicializado' };
    const expected = fs.readdirSync(path.join(here, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
    const applied = await tx(SYSTEM, async (d) => (await d.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version));
    const missing = expected.filter((f) => !applied.includes(f));
    return {
      ok: missing.length === 0,
      database: impl.kind,
      schema: missing.length ? 'pending' : 'ok',
      migrations: { applied: applied.length, expected: expected.length, latest: applied[applied.length - 1] || null, missing },
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, database: 'down', error: 'sem resposta do banco', ms: Date.now() - t0 };
  }
}

/** Apenas testes: apaga todos os dados mantendo o schema. */
export async function truncateAll() {
  await impl.transaction(async (raw) => {
    await raw.query(`TRUNCATE tenants, methodology_configs, users, students, staff_assignments, sessions, password_resets, invites, editais, subjects, topics,
      enrollments, topic_progress, study_sessions, active_timers, reviews, question_logs, production_logs, learning_events,
      routine_blocks, teacher_notes, files, content_items, ai_reports, audit_log,
      finance_settings, products, webhook_endpoints, sales, sale_events, webhook_inbox, agenda_events, content_progress, accesses, terms_documents, terms_acceptances, pactos, access_pauses, cohorts, consult_journeys, diagnostics, action_plans, action_items, consult_reports, bonuses, coord_actions, route_adjustments CASCADE`);
  });
}
