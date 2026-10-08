/**
 * Backup completo (banco + arquivos enviados).
 *   npm run backup                      → cria ./backups/oneup-AAAA-MM-DD-HHMM
 *   npm run backup -- C:\caminho\pasta  → cria na pasta indicada
 * Com PGlite (uso local), pare o sistema antes (Ctrl + C). Com PostgreSQL, pode rodar com o sistema no ar.
 */
import path from 'node:path';
import { openDb, closeDb } from '../src/db/index.js';
import { backupTo } from '../src/ops/backup.js';

const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
const dir = path.resolve(process.argv[2] || path.join('backups', `oneup-${stamp}`));
try {
  await openDb();
  const m = await backupTo(dir);
  const total = Object.values(m.tables).reduce((a, t) => a + t.rows, 0);
  console.log(`Backup criado em ${dir}`);
  console.log(`  ${total} registros em ${Object.keys(m.tables).length} tabelas · ${m.files.copied} arquivo(s) · banco ${m.database} · migração ${m.migrations.at(-1)}`);
  await closeDb();
} catch (e) {
  console.error(`Falha no backup: ${e.message}`);
  process.exit(1);
}
