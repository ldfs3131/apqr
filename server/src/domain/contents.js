/**
 * Área "Estudar com IA": textos, vídeos, links e arquivos publicados pela professora.
 * Aluno vê só itens publicados do próprio ambiente (RLS + filtro `published`).
 */
import { audit } from '../security/access.js';
import { badRequest, notFound, nowIso } from '../lib/util.js';

export const KINDS = ['text', 'video', 'link', 'file'];

function clean(v, n) { return v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n); }
function httpsUrl(v) {
  if (v == null || v === '') return null;
  let u;
  try { u = new URL(String(v).trim()); } catch { throw badRequest('Link inválido.'); }
  if (u.protocol !== 'https:') throw badRequest('Use um link que comece com https://');
  return u.toString().slice(0, 1000);
}

async function validate(d, body, current = {}) {
  const kind = body.kind ?? current.kind;
  if (!KINDS.includes(kind)) throw badRequest('Tipo inválido.');
  const out = {
    kind,
    title: clean(body.title ?? current.title, 160),
    category: clean(body.category ?? current.category, 60) || 'geral',
    summary: clean(body.summary !== undefined ? body.summary : current.summary, 400),
    body: clean(body.body !== undefined ? body.body : current.body, 20000),
    url: body.url !== undefined ? httpsUrl(body.url) : current.url ?? null,
    file_id: body.file_id !== undefined ? body.file_id || null : current.file_id ?? null,
    published: body.published !== undefined ? !!body.published : !!current.published,
    cohort: body.cohort !== undefined ? clean(body.cohort, 120) : current.cohort ?? null,
  };
  if (!out.title || out.title.length < 3) throw badRequest('Informe um título.');
  if (kind === 'text' && !out.body) throw badRequest('Escreva o texto.');
  if ((kind === 'video' || kind === 'link') && !out.url) throw badRequest('Informe o link.');
  if (kind === 'file') {
    if (!out.file_id) throw badRequest('Envie o arquivo.');
    const f = await d.one("SELECT id FROM files WHERE id = ? AND purpose = 'content' AND deleted_at IS NULL", [out.file_id]);
    if (!f) throw badRequest('Arquivo não encontrado.');
  }
  return out;
}

export async function listContents(d, { includeArchived = false } = {}) {
  return d.all(
    `SELECT c.*, f.original_name AS file_name, f.size_bytes AS file_size, f.mime AS file_mime FROM content_items c LEFT JOIN files f ON f.id = c.file_id
      ${includeArchived ? '' : 'WHERE c.archived_at IS NULL'} ORDER BY c.archived_at IS NOT NULL, c.position, c.created_at`
  );
}

export async function createContent(d, ctx, body) {
  const v = await validate(d, body);
  const pos = (await d.one('SELECT COALESCE(max(position), -1) + 1 AS p FROM content_items')).p;
  const ts = nowIso();
  const row = await d.one(
    `INSERT INTO content_items (tenant_id, kind, category, title, summary, body, url, file_id, published, cohort, position, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [ctx.tenantId, v.kind, v.category, v.title, v.summary, v.body, v.url, v.file_id, v.published, v.cohort, pos, ctx.userId, ts, ts]
  );
  await audit(d, ctx, 'content.create', { targetType: 'content', targetId: row.id, payload: { kind: v.kind, published: v.published } });
  return row;
}

export async function updateContent(d, ctx, id, body) {
  const cur = await d.one('SELECT * FROM content_items WHERE id = ?', [id]);
  if (!cur) throw notFound('Conteúdo não encontrado.');
  if (body.archived !== undefined) {
    await d.run('UPDATE content_items SET archived_at = ?, published = CASE WHEN ? THEN false ELSE published END, updated_at = ? WHERE id = ?', [body.archived ? nowIso() : null, !!body.archived, nowIso(), id]);
    await audit(d, ctx, body.archived ? 'content.archive' : 'content.unarchive', { targetType: 'content', targetId: id });
    return d.one('SELECT * FROM content_items WHERE id = ?', [id]);
  }
  const v = await validate(d, body, cur);
  const row = await d.one(
    `UPDATE content_items SET kind=?, category=?, title=?, summary=?, body=?, url=?, file_id=?, published=?, cohort=?, updated_at=? WHERE id = ? RETURNING *`,
    [v.kind, v.category, v.title, v.summary, v.body, v.url, v.file_id, v.published, v.cohort, nowIso(), id]
  );
  await audit(d, ctx, 'content.update', { targetType: 'content', targetId: id, payload: { published: v.published } });
  return row;
}

export async function reorderContents(d, ctx, ids) {
  for (const [i, id] of ids.entries()) await d.run('UPDATE content_items SET position = ? WHERE id = ?', [i, id]);
  await audit(d, ctx, 'content.reorder', { targetType: 'content', payload: { count: ids.length } });
}
