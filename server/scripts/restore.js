/**
 * Restauração de um backup num banco NOVO (vazio), com verificação completa.
 *   npm run restore -- C:\caminho\oneup-2026-10-01-0930
 * Com PGlite: pare o sistema e aponte para uma pasta de banco nova (renomeie server\data\pglite antes).
 * Com PostgreSQL: crie um banco vazio e defina DATABASE_URL para ele.
 */
import path from 'node:path';
import { openDb, closeDb } from '../src/db/index.js';
import { restoreFrom } from '../src/ops/backup.js';

if (!process.argv[2]) {
  console.error('Uso: npm run restore -- <pasta do backup>');
  process.exit(1);
}
try {
  await openDb();
  const r = await restoreFrom(path.resolve(process.argv[2]));
  const total = Object.values(r.tables).reduce((a, n) => a + n, 0);
  console.log(`Restauração concluída e verificada: ${total} registros, ${r.files_copied} arquivo(s) copiados.`);
  if (r.files_missing.length) console.log(`ATENÇÃO: ${r.files_missing.length} arquivo(s) não conferem: ${r.files_missing.slice(0, 5).join(', ')}`);
  await closeDb();
} catch (e) {
  console.error(`Restauração cancelada (nada foi gravado): ${e.message}`);
  process.exit(1);
}
