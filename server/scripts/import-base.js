/**
 * Importa a base de alunos da mentoria (CSV) para um ambiente.
 *
 * Uso:
 *   node scripts/import-base.js --arquivo base-alunos.csv --tenant pollyana-lyra [--simular]
 *
 * - Mesmas regras da importação pela tela (Relatórios → Base de alunos → Importar):
 *   o e-mail identifica o aluno; reimportar atualiza turma, plano e último acesso, sem duplicar.
 * - Alunos novos entram com cadastro pendente (sem senha). O convite é gerado pela professora quando quiser.
 * - --simular mostra o resultado sem gravar nada.
 */
import fs from 'node:fs';
import { openDb, tx, SYSTEM, closeDb } from '../src/db/index.js';
import { today } from '../src/lib/util.js';
import { importRoster } from '../src/domain/roster.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.arquivo || !args.tenant) {
  console.error('Uso: node scripts/import-base.js --arquivo base-alunos.csv --tenant <identificador-do-ambiente> [--simular]');
  process.exit(1);
}
if (!fs.existsSync(args.arquivo)) {
  console.error(`Arquivo não encontrado: ${args.arquivo}`);
  process.exit(1);
}
await openDb();
const tenant = await tx(SYSTEM, (d) => d.one('SELECT id, name FROM tenants WHERE slug = ?', [args.tenant]));
if (!tenant) {
  console.error(`Ambiente "${args.tenant}" não encontrado.`);
  process.exit(1);
}
const teacher = await tx(SYSTEM, (d) => d.one("SELECT id FROM users WHERE tenant_id = ? AND role = 'teacher' ORDER BY created_at LIMIT 1", [tenant.id]));
const ctx = { userId: teacher?.id || null, role: 'teacher', tenantId: tenant.id, tz: 'America/Sao_Paulo', platform: false };
const r = await importRoster(ctx, fs.readFileSync(args.arquivo, 'utf8'), { dryRun: !!args.simular, today: today() });
console.log(`\n${args.simular ? 'SIMULAÇÃO (nada foi gravado)' : 'Importação concluída'} — ambiente ${tenant.name}`);
console.log(`  Novos: ${r.created} · Atualizados: ${r.updated} · Ignorados: ${r.skipped}`);
console.log(`  Planos ativos: ${r.active} · Encerrados: ${r.ended} · Turmas: ${r.cohorts}`);
for (const e of r.errors) console.log(`  ✗ linha ${e.line} ${e.email || ''}: ${e.reason}`);
for (const w of r.warnings) console.log(`  ! linha ${w.line} ${w.email || ''}: ${w.reason}`);
await closeDb();
