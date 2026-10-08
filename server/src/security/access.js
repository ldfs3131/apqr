/**
 * Autorização por recurso + auditoria.
 *
 * Três camadas se somam:
 *   1. Guarda de rota (papel)            → security/auth.js requireRole
 *   2. Checagem do recurso (este arquivo) → aluno só o próprio; monitor só atribuídos
 *   3. Row-Level Security no banco        → nada de outro ambiente, nunca
 * Recurso inacessível responde 404 (não revela que existe).
 */
import { notFound, nowIso } from '../lib/util.js';

/** Registra ação sensível. Chamar dentro da mesma transação da ação. */
export async function audit(d, ctx, action, { targetType = null, targetId = null, payload = null, tenantId } = {}) {
  await d.run(
    'INSERT INTO audit_log (tenant_id, actor_user_id, action, target_type, target_id, payload, ip, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [tenantId !== undefined ? tenantId : ctx.tenantId || null, ctx.userId || null, action, targetType, targetId ? String(targetId) : null, payload ? JSON.stringify(payload) : null, ctx.ip || null, nowIso()]
  );
}

/** Restrição SQL de alunos visíveis para o contexto (usar com alias `st` para students). */
export function studentScope(ctx, alias = 'st') {
  if (ctx.role === 'student') return { sql: ` AND ${alias}.id = ?`, params: [ctx.studentId] };
  // Monitor: somente editais e arquivos, sem dados de alunos.
  if (ctx.role === 'mentor') return { sql: ' AND 1 = 0', params: [] };
  return { sql: '', params: [] }; // professora / admin operando o ambiente: RLS já limita ao ambiente
}

/** Aluno visível? Retorna dados básicos ou lança 404. */
export async function assertStudent(d, ctx, studentId) {
  const sc = studentScope(ctx);
  const row = await d.one(
    `SELECT st.*, u.name, u.email, u.status AS user_status, u.timezone, u.last_login_at, u.created_at AS user_created_at
       FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?${sc.sql}`,
    [studentId, ...sc.params]
  );
  if (!row) throw notFound('Aluno não encontrado.');
  return row;
}

/** Matrícula (aluno × edital) visível? Retorna matrícula + edital + fuso do aluno. */
export async function assertEnrollment(d, ctx, enrollmentId) {
  const sc = studentScope(ctx);
  const row = await d.one(
    `SELECT e.*, ed.name AS edital_name, ed.role_title, ed.board, ed.exam_date, ed.archived_at AS edital_archived_at,
            u.timezone AS student_tz, u.name AS student_name
       FROM enrollments e JOIN editais ed ON ed.id = e.edital_id
       JOIN students st ON st.id = e.student_id JOIN users u ON u.id = st.user_id
      WHERE e.id = ?${sc.sql}`,
    [enrollmentId, ...sc.params]
  );
  if (!row) throw notFound('Edital não encontrado.');
  return row;
}

/** Conteúdo (tópico) pertencente ao edital da matrícula. */
export async function assertTopicInEnrollment(d, enrollment, topicId) {
  const t = await d.one(
    `SELECT t.*, s.name AS subject_name, s.archived_at AS subject_archived_at
       FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ? AND t.edital_id = ?`,
    [topicId, enrollment.edital_id]
  );
  if (!t) throw notFound('Conteúdo não encontrado.');
  return t;
}
