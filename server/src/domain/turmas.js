/** Turmas: links dos 2 grupos de WhatsApp (avisos e alunos) e vínculo com materiais. A aprovação de entrada é no próprio WhatsApp. */
import { audit } from '../security/access.js';
import { badRequest, nowIso } from '../lib/util.js';

function waUrl(v, label) {
  if (v == null || String(v).trim() === '') return null;
  let u;
  try { u = new URL(String(v).trim()); } catch { throw badRequest(`Link do grupo de ${label} inválido.`); }
  if (u.protocol !== 'https:' || !/(^|\.)(whatsapp\.com|wa\.me)$/.test(u.hostname)) throw badRequest(`O link do grupo de ${label} deve ser do WhatsApp (chat.whatsapp.com).`);
  return u.toString().slice(0, 300);
}

/** Todas as turmas (cadastradas + as que existem só no cadastro dos alunos), com o total de alunos. */
export async function listCohorts(d) {
  return d.all(
    `SELECT COALESCE(c.id::text, '') AS id, n.name, c.whatsapp_notices_url, c.whatsapp_students_url, COALESCE(s.total, 0)::int AS students
       FROM (SELECT name FROM cohorts UNION SELECT cohort FROM students WHERE cohort IS NOT NULL AND btrim(cohort) <> '') n
       LEFT JOIN cohorts c ON c.name = n.name
       LEFT JOIN (SELECT cohort, count(*) AS total FROM students GROUP BY cohort) s ON s.cohort = n.name
      ORDER BY n.name`
  );
}

export async function saveCohort(d, ctx, { name, whatsapp_notices_url, whatsapp_students_url }) {
  const n = String(name || '').trim().slice(0, 120);
  if (n.length < 2) throw badRequest('Informe o nome da turma.');
  const a = waUrl(whatsapp_notices_url, 'avisos');
  const b = waUrl(whatsapp_students_url, 'alunos');
  const ts = nowIso();
  const row = await d.one(
    `INSERT INTO cohorts (tenant_id, name, whatsapp_notices_url, whatsapp_students_url, created_at, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (tenant_id, name) DO UPDATE SET whatsapp_notices_url = EXCLUDED.whatsapp_notices_url, whatsapp_students_url = EXCLUDED.whatsapp_students_url, updated_at = EXCLUDED.updated_at
     RETURNING *`, [ctx.tenantId, n, a, b, ts, ts]);
  await audit(d, ctx, 'cohort.save', { targetType: 'cohort', targetId: row.id, payload: { name: n } });
  return row;
}

/** Turma do próprio aluno e seus links. */
export async function myCohort(d, studentId) {
  const st = await d.one('SELECT cohort FROM students WHERE id = ?', [studentId]);
  if (!st?.cohort) return null;
  const c = await d.one('SELECT name, whatsapp_notices_url, whatsapp_students_url FROM cohorts WHERE name = ?', [st.cohort]);
  return { name: st.cohort, notices_url: c?.whatsapp_notices_url || null, students_url: c?.whatsapp_students_url || null };
}
