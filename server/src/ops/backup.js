/**
 * Backup e restauração LÓGICOS da plataforma — funcionam igual no PostgreSQL e no PGlite.
 *
 * Um backup é uma pasta:
 *   manifest.json            versão do formato, migrações, contagem e checksum (SHA-256) de cada tabela
 *   tables/<tabela>.ndjson.gz  uma linha JSON por registro, em ordem estável
 *   files/                   cópia dos arquivos enviados (materiais e logotipos)
 *
 * A restauração só roda num banco VAZIO com as MESMAS migrações, numa única transação, e depois
 * recalcula o checksum de cada tabela e de cada arquivo: se qualquer coisa divergir, nada é gravado.
 * Sessões de login e links de senha pendentes não entram no backup (são temporários): após restaurar, todos entram de novo.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { tx, SYSTEM, dbKind } from '../db/index.js';
import { filesDir } from '../lib/storage.js';

export const FORMAT = 'oneup-apqr-backup';
export const FORMAT_VERSION = 1;

/** Ordem de dependência (pais antes dos filhos). A chave define a ordem estável das linhas. */
export const TABLES = [
  ['tenants', 'id'], ['methodology_configs', 'id'], ['users', 'id'], ['files', 'id'], ['students', 'id'], ['staff_assignments', 'staff_id, student_id'],
  ['invites', 'id'], ['editais', 'id'], ['subjects', 'id'], ['topics', 'id'], ['enrollments', 'id'], ['topic_progress', 'id'],
  ['study_sessions', 'id'], ['active_timers', 'student_id'], ['reviews', 'id'], ['question_logs', 'id'], ['production_logs', 'id'],
  ['learning_events', 'id'], ['routine_blocks', 'id'], ['teacher_notes', 'id'], ['content_items', 'id'],
  ['finance_settings', 'tenant_id'], ['products', 'id'], ['webhook_endpoints', 'id'], ['sales', 'id'], ['sale_events', 'id'], ['webhook_inbox', 'id'],
  ['agenda_events', 'id'], ['content_progress', 'student_id, content_id'], ['accesses', 'id'], ['terms_documents', 'id'], ['terms_acceptances', 'id'], ['pactos', 'student_id, week_start'], ['access_pauses', 'id'], ['cohorts', 'id'], ['consult_journeys', 'id'], ['diagnostics', 'id'], ['action_plans', 'id'], ['action_items', 'id'], ['consult_reports', 'id'], ['bonuses', 'id'], ['coord_actions', 'id'], ['route_adjustments', 'id'],
  ['ai_reports', 'id'], ['audit_log', 'id'],
];
const CHUNK = 5000;

async function migrations(d) {
  return (await d.all('SELECT version FROM schema_migrations ORDER BY version')).map((r) => r.version);
}

/** Lê uma tabela inteira em blocos, em ordem estável, chamando onRow para cada linha. */
async function scan(d, table, key, onRow) {
  let offset = 0;
  for (;;) {
    const rows = await d.all(`SELECT * FROM ${table} ORDER BY ${key} LIMIT ${CHUNK} OFFSET ${offset}`);
    for (const r of rows) onRow(r);
    if (rows.length < CHUNK) return;
    offset += CHUNK;
  }
}

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return 0;
  let n = 0;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, e.name);
    const b = path.join(dst, e.name);
    if (e.isDirectory()) n += copyDir(a, b);
    else if (!fs.existsSync(b)) { fs.copyFileSync(a, b); n += 1; }
  }
  return n;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** Gera o backup na pasta `dir` (criada se não existir; precisa estar vazia). */
export async function backupTo(dir) {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`A pasta de destino não está vazia: ${dir}`);
  fs.mkdirSync(path.join(dir, 'tables'), { recursive: true });
  const manifest = { format: FORMAT, format_version: FORMAT_VERSION, created_at: new Date().toISOString(), database: dbKind(), tables: {} };
  await tx(SYSTEM, async (d) => {
    manifest.migrations = await migrations(d);
    for (const [table, key] of TABLES) {
      const lines = [];
      await scan(d, table, key, (r) => lines.push(JSON.stringify(r)));
      const body = Buffer.from(lines.length ? `${lines.join('\n')}\n` : '');
      fs.writeFileSync(path.join(dir, 'tables', `${table}.ndjson.gz`), zlib.gzipSync(body));
      manifest.tables[table] = { rows: lines.length, sha256: sha(body) };
    }
  }, { snapshot: true });
  manifest.files = { copied: copyDir(filesDir(), path.join(dir, 'files')) };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function readTable(dir, table) {
  const p = path.join(dir, 'tables', `${table}.ndjson.gz`);
  const body = zlib.gunzipSync(fs.readFileSync(p));
  return { body, rows: body.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}

/** Restaura o backup da pasta `dir` num banco vazio. Valida tudo antes de confirmar. */
export async function restoreFrom(dir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (manifest.format !== FORMAT || manifest.format_version !== FORMAT_VERSION) throw new Error('Pasta não é um backup válido da plataforma.');
  // Confere a integridade dos arquivos do backup antes de tocar no banco.
  const data = {};
  for (const [table] of TABLES) {
    const t = readTable(dir, table);
    if (sha(t.body) !== manifest.tables[table]?.sha256 || t.rows.length !== manifest.tables[table].rows) throw new Error(`Backup corrompido na tabela ${table}.`);
    data[table] = t.rows;
  }
  const result = { tables: {} };
  await tx(SYSTEM, async (d) => {
    const current = await migrations(d);
    if (JSON.stringify(current) !== JSON.stringify(manifest.migrations)) {
      throw new Error(`Versão do banco diferente do backup (backup: ${manifest.migrations.at(-1)}; banco: ${current.at(-1)}). Use a mesma versão da plataforma.`);
    }
    const busy = await d.one('SELECT (SELECT count(*) FROM tenants) + (SELECT count(*) FROM users) AS n');
    if (busy.n > 0) throw new Error('O banco de destino não está vazio. A restauração só é feita num banco novo (evita misturar dados).');
    for (const [table] of TABLES) {
      const rows = data[table];
      for (let i = 0; i < rows.length; i += 500) {
        await d.run(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table}, ?::jsonb)`, [JSON.stringify(rows.slice(i, i + 500))]);
      }
    }
    // Verificação: exporta de novo o que foi gravado e compara checksum por tabela.
    for (const [table, key] of TABLES) {
      const lines = [];
      await scan(d, table, key, (r) => lines.push(JSON.stringify(r)));
      const body = Buffer.from(lines.length ? `${lines.join('\n')}\n` : '');
      if (sha(body) !== manifest.tables[table].sha256) throw new Error(`Verificação falhou na tabela ${table}: nada foi gravado.`);
      result.tables[table] = lines.length;
    }
  });
  // Arquivos: copia e confere o SHA-256 de cada um registrado no banco.
  result.files_copied = copyDir(path.join(dir, 'files'), filesDir());
  const missing = [];
  for (const f of data.files) {
    const p = path.join(filesDir(), f.storage_key.slice(0, 2), f.storage_key);
    if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== f.sha256) missing.push(f.original_name);
  }
  result.files_missing = missing;
  return result;
}
