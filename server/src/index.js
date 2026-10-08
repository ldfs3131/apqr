import { openDb, closeDb, tx, SYSTEM, dbKind } from './db/index.js';
import { log } from './lib/log.js';
import { createApp } from './app.js';
import { hashPassword } from './security/auth.js';
import { nowIso } from './lib/util.js';

await openDb();

// Primeira execução: cria o administrador ONE UP a partir das variáveis de ambiente.
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  const exists = await tx(SYSTEM, (d) => d.one("SELECT 1 FROM users WHERE role = 'platform_admin' LIMIT 1"));
  if (!exists) {
    if (ADMIN_PASSWORD.length < 10) {
      console.error('ADMIN_PASSWORD precisa ter pelo menos 10 caracteres.');
    } else {
      const hash = await hashPassword(ADMIN_PASSWORD);
      await tx(SYSTEM, (d) =>
        d.run(`INSERT INTO users (tenant_id, email, password_hash, name, role, status, created_at, updated_at) VALUES (NULL, ?, ?, ?, 'platform_admin', 'active', ?, ?)`, [
          ADMIN_EMAIL.trim().toLowerCase(), hash, ADMIN_NAME || 'Administrador ONE UP', nowIso(), nowIso(),
        ])
      );
      console.log(`Administrador ONE UP criado: ${ADMIN_EMAIL}`);
    }
  }
}

const hasAdmin = await tx(SYSTEM, (d) => d.one("SELECT 1 FROM users WHERE role = 'platform_admin' LIMIT 1"));
if (!hasAdmin) {
  console.log('\nNenhum administrador ONE UP ainda. Crie o primeiro com:');
  console.log('  npm run create-admin -- seu@email.com "SuaSenhaForte123" "Seu Nome"\n');
}

const port = Number(process.env.PORT) || 3000;
const server = createApp().listen(port, () => console.log(`ONE UP · Método APQR rodando em http://localhost:${port} (banco: ${dbKind()})`));

// Erros fora de requisição também vão para o log estruturado.
process.on('unhandledRejection', (e) => log('error', 'unhandledRejection', { err: String(e?.message || e), stack: e?.stack?.split('\n').slice(0, 5) }));
// Desligamento limpo (deploys e reinícios): para de aceitar conexões, termina as em andamento e fecha o banco.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => {
    log('info', 'shutdown', { signal: sig });
    server.close(async () => { await closeDb().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
