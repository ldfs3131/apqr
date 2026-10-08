// Cria um administrador ONE UP (acesso global à plataforma).
// Uso: node scripts/create-admin.js email@dominio.com "SenhaForte123" "Nome"
import { openDb, closeDb, tx, SYSTEM } from '../src/db/index.js';
import { hashPassword } from '../src/security/auth.js';
import { nowIso } from '../src/lib/util.js';

const [email, password, name = 'Administrador ONE UP'] = process.argv.slice(2);
if (!email || !password || password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('Uso: node scripts/create-admin.js <email> <senha (mín. 10, letras e números)> [nome]');
  process.exit(1);
}
await openDb();
const hash = await hashPassword(password);
const ok = await tx(SYSTEM, async (d) => {
  if (await d.one('SELECT 1 FROM users WHERE lower(email) = lower(?)', [email])) return false;
  await d.run(`INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at) VALUES (?,?,?,'platform_admin','active',?,?)`, [email.toLowerCase(), hash, name, nowIso(), nowIso()]);
  return true;
});
console.log(ok ? `Administrador ONE UP criado: ${email}` : 'Já existe um usuário com este e-mail.');
await closeDb();
process.exit(ok ? 0 : 1);
