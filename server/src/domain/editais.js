/**
 * Editais: estrutura ÚNICA mantida pela professora (Edital → Matérias → Conteúdos).
 * O aluno não recebe cópia: tem apenas progresso por conteúdo (topic_progress).
 * Nada com histórico é apagado — remover = arquivar (o progresso dos alunos é preservado).
 */
import { badRequest, notFound, nowIso, isValidDate } from '../lib/util.js';
import { audit } from '../security/access.js';

const clean = (s, max = 200) => (s == null ? null : String(s).trim().slice(0, max) || null);
export function requireName(s, label = 'nome') {
  const v = String(s ?? '').trim();
  if (v.length < 1) throw badRequest(`Informe o ${label}.`);
  if (v.length > 300) throw badRequest(`O ${label} é muito longo.`);
  return v;
}

export async function getEdital(d, id) {
  const e = await d.one('SELECT * FROM editais WHERE id = ?', [id]);
  if (!e) throw notFound('Edital não encontrado.');
  return e;
}

export async function listEditais(d, { includeArchived = false } = {}) {
  return d.all(
    `SELECT e.*,
            (SELECT count(*) FROM subjects s WHERE s.edital_id = e.id AND s.archived_at IS NULL) AS subjects_count,
            (SELECT count(*) FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.edital_id = e.id AND t.archived_at IS NULL AND s.archived_at IS NULL) AS topics_count,
            (SELECT count(*) FROM enrollments en WHERE en.edital_id = e.id AND en.status = 'active') AS students_count
       FROM editais e ${includeArchived ? '' : 'WHERE e.archived_at IS NULL'}
      ORDER BY e.archived_at IS NOT NULL, e.exam_date NULLS LAST, e.name`
  );
}

function editalFields(body, partial = false) {
  const out = {};
  if (!partial || body.name !== undefined) out.name = requireName(body.name, 'nome do edital');
  for (const k of ['role_title', 'board', 'description', 'plan_notes']) if (body[k] !== undefined) out[k] = clean(body[k], k === 'description' || k === 'plan_notes' ? 2000 : 200);
  if (body.exam_date !== undefined) {
    if (body.exam_date && !isValidDate(body.exam_date)) throw badRequest('Data da prova inválida.');
    out.exam_date = body.exam_date || null;
  }
  return out;
}

export async function createEdital(d, ctx, body) {
  const f = editalFields(body);
  const ts = nowIso();
  const e = await d.one(
    `INSERT INTO editais (tenant_id, name, role_title, board, exam_date, description, plan_notes, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [ctx.tenantId, f.name, f.role_title ?? null, f.board ?? null, f.exam_date ?? null, f.description ?? null, f.plan_notes ?? null, ctx.userId, ts, ts]
  );
  await audit(d, ctx, 'edital.create', { targetType: 'edital', targetId: e.id, payload: { name: e.name } });
  return e;
}

export async function updateEdital(d, ctx, id, body) {
  await getEdital(d, id);
  const f = editalFields(body, true);
  const cols = Object.keys(f);
  if (cols.length) {
    await d.run(`UPDATE editais SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => f[c]), nowIso(), id]);
    await audit(d, ctx, 'edital.update', { targetType: 'edital', targetId: id, payload: { fields: cols } });
  }
  return getEdital(d, id);
}

export async function archiveEdital(d, ctx, id, archived) {
  await getEdital(d, id);
  await d.run('UPDATE editais SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowIso() : null, nowIso(), id]);
  await audit(d, ctx, archived ? 'edital.archive' : 'edital.unarchive', { targetType: 'edital', targetId: id });
  return getEdital(d, id);
}

/** Estrutura completa: matérias (com Plano Global) e conteúdos. */
export async function structure(d, editalId, { includeArchived = false } = {}) {
  const subjects = await d.all(
    `SELECT * FROM subjects WHERE edital_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY position, created_at`,
    [editalId]
  );
  const topics = await d.all(
    `SELECT * FROM topics WHERE edital_id = ? ${includeArchived ? '' : 'AND archived_at IS NULL'} ORDER BY position, created_at`,
    [editalId]
  );
  return subjects.map((s) => ({ ...s, topics: topics.filter((t) => t.subject_id === s.id) }));
}

async function getSubject(d, id, editalId) {
  const s = await d.one('SELECT * FROM subjects WHERE id = ? AND edital_id = ?', [id, editalId]);
  if (!s) throw notFound('Matéria não encontrada.');
  return s;
}

export async function createSubject(d, ctx, editalId, { name, topics = [] }) {
  await getEdital(d, editalId);
  const n = requireName(name, 'nome da matéria');
  const pos = (await d.one('SELECT COALESCE(max(position), -1) + 1 AS p FROM subjects WHERE edital_id = ?', [editalId])).p;
  const s = await d.one('INSERT INTO subjects (tenant_id, edital_id, name, position, created_at) VALUES (?,?,?,?,?) RETURNING *', [ctx.tenantId, editalId, n, pos, nowIso()]);
  if (topics.length) await createTopics(d, ctx, editalId, s.id, topics, { skipAudit: true });
  await audit(d, ctx, 'edital.subject_create', { targetType: 'subject', targetId: s.id, payload: { edital_id: editalId, name: n, topics: topics.length } });
  return s;
}

export async function updateSubject(d, ctx, editalId, subjectId, { name, archived }) {
  await getSubject(d, subjectId, editalId);
  if (name !== undefined) await d.run('UPDATE subjects SET name = ? WHERE id = ?', [requireName(name, 'nome da matéria'), subjectId]);
  if (archived !== undefined) await d.run('UPDATE subjects SET archived_at = ? WHERE id = ?', [archived ? nowIso() : null, subjectId]);
  await audit(d, ctx, 'edital.subject_update', { targetType: 'subject', targetId: subjectId, payload: { name: name !== undefined, archived } });
  return getSubject(d, subjectId, editalId);
}

/** Cria conteúdos em lote (um por linha colada). Ignora linhas vazias e duplicadas na matéria. */
export async function createTopics(d, ctx, editalId, subjectId, names, { skipAudit = false } = {}) {
  const subject = await getSubject(d, subjectId, editalId);
  if (subject.archived_at) throw badRequest('Matéria arquivada.');
  const existing = new Set((await d.all('SELECT lower(name) n FROM topics WHERE subject_id = ? AND archived_at IS NULL', [subjectId])).map((r) => r.n));
  let pos = (await d.one('SELECT COALESCE(max(position), -1) + 1 AS p FROM topics WHERE subject_id = ?', [subjectId])).p;
  const created = [];
  const ts = nowIso();
  for (const raw of names) {
    const n = String(raw ?? '').replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
    if (!n || existing.has(n.toLowerCase())) continue;
    if (n.length > 300) throw badRequest('Nome de conteúdo muito longo.');
    existing.add(n.toLowerCase());
    created.push(await d.one('INSERT INTO topics (tenant_id, edital_id, subject_id, name, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?) RETURNING *', [ctx.tenantId, editalId, subjectId, n, pos++, ts, ts]));
  }
  if (!skipAudit && created.length) await audit(d, ctx, 'edital.topics_create', { targetType: 'subject', targetId: subjectId, payload: { count: created.length } });
  return created;
}

export async function updateTopic(d, ctx, editalId, topicId, { name, subject_id, archived }) {
  const t = await d.one('SELECT * FROM topics WHERE id = ? AND edital_id = ?', [topicId, editalId]);
  if (!t) throw notFound('Conteúdo não encontrado.');
  if (name !== undefined) await d.run('UPDATE topics SET name = ?, updated_at = ? WHERE id = ?', [requireName(name, 'nome do conteúdo'), nowIso(), topicId]);
  if (subject_id !== undefined && subject_id !== t.subject_id) {
    await getSubject(d, subject_id, editalId);
    await d.run('UPDATE topics SET subject_id = ?, updated_at = ? WHERE id = ?', [subject_id, nowIso(), topicId]);
  }
  if (archived !== undefined) await d.run('UPDATE topics SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowIso() : null, nowIso(), topicId]);
  await audit(d, ctx, 'edital.topic_update', { targetType: 'topic', targetId: topicId, payload: { name: name !== undefined, moved: subject_id !== undefined && subject_id !== t.subject_id, archived } });
  return d.one('SELECT * FROM topics WHERE id = ?', [topicId]);
}

export async function reorder(d, ctx, editalId, { subject_ids, topic_ids, subject_id }) {
  await getEdital(d, editalId);
  if (subject_ids) for (const [i, id] of subject_ids.entries()) await d.run('UPDATE subjects SET position = ? WHERE id = ? AND edital_id = ?', [i, id, editalId]);
  if (topic_ids && subject_id) for (const [i, id] of topic_ids.entries()) await d.run('UPDATE topics SET position = ? WHERE id = ? AND subject_id = ? AND edital_id = ?', [i, id, subject_id, editalId]);
}

/** Plano Global: prioridade e relevância por matéria (orienta, não obriga). */
export async function savePlan(d, ctx, editalId, { notes, items }) {
  await getEdital(d, editalId);
  const valid = new Set((await d.all('SELECT id FROM subjects WHERE edital_id = ?', [editalId])).map((r) => r.id));
  await d.run('UPDATE subjects SET priority = NULL WHERE edital_id = ?', [editalId]);
  for (const [i, it] of (items || []).entries()) {
    if (!valid.has(it.subject_id)) throw badRequest('Matéria inválida no plano.');
    const rel = ['alta', 'media', 'baixa'].includes(it.relevance) ? it.relevance : 'media';
    await d.run('UPDATE subjects SET priority = ?, relevance = ?, plan_note = ? WHERE id = ?', [i + 1, rel, clean(it.note, 300), it.subject_id]);
  }
  if (notes !== undefined) await d.run('UPDATE editais SET plan_notes = ?, updated_at = ? WHERE id = ?', [clean(notes, 2000), nowIso(), editalId]);
  await audit(d, ctx, 'edital.plan_save', { targetType: 'edital', targetId: editalId, payload: { items: (items || []).length } });
  return getPlan(d, editalId);
}

export async function getPlan(d, editalId) {
  const e = await getEdital(d, editalId);
  const items = await d.all('SELECT id AS subject_id, name AS subject_name, priority, relevance, plan_note AS note FROM subjects WHERE edital_id = ? AND archived_at IS NULL AND priority IS NOT NULL ORDER BY priority', [editalId]);
  return { notes: e.plan_notes, items };
}

/** Duplica um edital (ex.: novo concurso do mesmo órgão). Copia estrutura e plano, não os alunos. */
export async function duplicateEdital(d, ctx, editalId) {
  const src = await getEdital(d, editalId);
  const copy = await createEdital(d, ctx, { ...src, name: `${src.name} (cópia)` });
  for (const s of await structure(d, editalId)) {
    const ns = await d.one(
      'INSERT INTO subjects (tenant_id, edital_id, name, position, priority, relevance, plan_note, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
      [ctx.tenantId, copy.id, s.name, s.position, s.priority, s.relevance, s.plan_note, nowIso()]
    );
    for (const t of s.topics) await d.run('INSERT INTO topics (tenant_id, edital_id, subject_id, name, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [ctx.tenantId, copy.id, ns.id, t.name, t.position, nowIso(), nowIso()]);
  }
  return copy;
}
