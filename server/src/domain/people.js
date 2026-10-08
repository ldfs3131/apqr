/**
 * Pessoas: ambientes (professoras), equipe, alunos e convites.
 *
 * Fluxo de cadastro do aluno (decisão do produto):
 *   professora cadastra/convida (nome + e-mail, opcionalmente editais) → aluno recebe o link →
 *   aluno conclui (CPF, telefone, endereço, senha, aceite dos termos) → conta ativa.
 * Só o administrador ONE UP cria ambientes/professoras.
 */
import { tx, SYSTEM } from '../db/index.js';
import { badRequest, conflict, notFound, now, nowIso, forbidden, localDate } from '../lib/util.js';
import { isValidCpf, onlyDigits } from '../lib/cpf.js';
import { hashPassword, randomToken, sha256, destroyUserSessions } from '../security/auth.js';
import { audit, assertStudent } from '../security/access.js';
import { initMethodologyConfig } from './settings.js';
import { applyExtraReviewsChange } from './apqr.js';
import { recordAcceptance } from './termos.js';
import { normalizeField } from './cadastro.js';

export const TERMS_VERSION = '2026-09-v1';
const INVITE_DAYS = 14;
const UF = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function appUrl(req) {
  return process.env.APP_URL || (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:3000');
}

async function assertEmailFree(d, email) {
  // e-mail é único na plataforma inteira: consulta em contexto de sistema dentro da mesma transação
  const row = await d.one("SELECT 1 FROM users WHERE lower(email) = lower(?)", [email]);
  if (row) throw conflict('Já existe uma conta com este e-mail.', 'email_taken');
}

/** Insere usuário convidado. O índice único global de e-mail garante a unicidade (sem consulta cruzada). */
async function insertUser(d, [tenantId, email, name, role, ts]) {
  try {
    return await d.one(
      `INSERT INTO users (tenant_id, email, name, role, status, created_at, updated_at) VALUES (?,?,?,?,'invited',?,?) RETURNING id, email, name, role`,
      [tenantId, email, name, role, ts, ts]
    );
  } catch (e) {
    if (e.code === '23505') throw conflict('Já existe uma conta com este e-mail.', 'email_taken');
    throw e;
  }
}

export async function createInvite(d, ctx, user, tenantId, req) {
  await d.run('UPDATE invites SET revoked_at = ? WHERE user_id = ? AND used_at IS NULL AND revoked_at IS NULL', [nowIso(), user.id]);
  const token = randomToken(32);
  const expires = new Date(now().getTime() + INVITE_DAYS * 86400000).toISOString();
  await d.run('INSERT INTO invites (tenant_id, user_id, token_hash, created_by, expires_at, created_at) VALUES (?,?,?,?,?,?)', [
    tenantId, user.id, sha256(token), ctx.userId || null, expires, nowIso(),
  ]);
  return { url: `${appUrl(req)}/convite/${token}`, expires_at: expires };
}

// ───────────── Ambientes (somente admin ONE UP) ─────────────

export async function createTenant(ctx, { slug, name, teacher_name, teacher_email, primary_color }, req) {
  const s = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(s)) throw badRequest('Identificador inválido: use letras minúsculas, números e hífen (ex.: pollyana-lyra).');
  if (!name || String(name).trim().length < 2) throw badRequest('Informe o nome do ambiente.');
  const email = cleanEmail(teacher_email);
  if (!EMAIL_RE.test(email)) throw badRequest('E-mail da professora inválido.');
  if (!teacher_name || String(teacher_name).trim().length < 2) throw badRequest('Informe o nome da professora.');
  return tx(SYSTEM, async (d) => {
    if (await d.one('SELECT 1 FROM tenants WHERE slug = ?', [s])) throw conflict('Já existe um ambiente com este identificador.');
    await assertEmailFree(d, email);
    const ts = nowIso();
    const brand = { display_name: String(name).trim(), primary_color: /^#[0-9a-f]{6}$/i.test(primary_color || '') ? primary_color : null };
    const tenant = await d.one('INSERT INTO tenants (slug, name, brand, created_at, updated_at) VALUES (?,?,?,?,?) RETURNING *', [s, String(name).trim(), JSON.stringify(brand), ts, ts]);
    await initMethodologyConfig(d, tenant.id, ctx.userId);
    const user = await d.one(
      `INSERT INTO users (tenant_id, email, name, role, status, created_at, updated_at) VALUES (?,?,?,'teacher','invited',?,?) RETURNING id, email, name, role`,
      [tenant.id, email, String(teacher_name).trim(), ts, ts]
    );
    const invite = await createInvite(d, ctx, user, tenant.id, req);
    await audit(d, ctx, 'platform.tenant_create', { targetType: 'tenant', targetId: tenant.id, tenantId: tenant.id, payload: { slug: s, teacher_email: email } });
    return { tenant, teacher: user, invite };
  });
}

// ───────────── Convites ─────────────

/** Consulta pública do convite (tela de conclusão de cadastro). */
export async function getInvite(token) {
  return tx(SYSTEM, async (d) => {
    const row = await d.one(
      `SELECT i.*, u.name, u.email, u.role, u.status AS user_status, t.name AS tenant_name, t.brand, t.slug, t.status AS tenant_status
         FROM invites i JOIN users u ON u.id = i.user_id JOIN tenants t ON t.id = i.tenant_id WHERE i.token_hash = ?`,
      [sha256(String(token || ''))]
    );
    if (!row || row.used_at || row.revoked_at || row.expires_at < nowIso() || row.tenant_status !== 'active') {
      throw badRequest('Convite inválido ou expirado. Peça um novo convite à sua professora.', 'invalid_invite');
    }
    return { name: row.name, email: row.email, role: row.role, tenant: { name: row.tenant_name, slug: row.slug, brand: row.brand }, requires_profile: row.role === 'student', terms_version: TERMS_VERSION };
  });
}

export function validateProfile(p) {
  const errors = {};
  const cpf = onlyDigits(p.cpf);
  if (!isValidCpf(cpf)) errors.cpf = 'CPF inválido.';
  const phone = onlyDigits(p.phone);
  if (phone.length < 10 || phone.length > 11) errors.phone = 'Telefone inválido (DDD + número).';
  const cep = onlyDigits(p.postal_code);
  if (cep.length !== 8) errors.postal_code = 'CEP inválido.';
  for (const [k, label, min] of [['address_line', 'Endereço', 3], ['address_number', 'Número', 1], ['district', 'Bairro', 2], ['city', 'Cidade', 2]]) {
    if (!p[k] || String(p[k]).trim().length < min) errors[k] = `${label} obrigatório.`;
  }
  const uf = String(p.state || '').toUpperCase();
  if (!UF.includes(uf)) errors.state = 'UF inválida.';
  let birth = null;
  if (p.birth_date) { try { birth = normalizeField('birth_date', p.birth_date); } catch { errors.birth_date = 'Data de nascimento inválida.'; } }
  if (Object.keys(errors).length) throw badRequest('Revise os dados do cadastro.', 'invalid_profile', errors);
  const t = (v, n) => (v == null || v === '' ? null : String(v).trim().slice(0, n));
  return {
    cpf, phone, postal_code: cep, state: uf, birth_date: birth,
    address_line: t(p.address_line, 160), address_number: t(p.address_number, 20), address_complement: t(p.address_complement, 80),
    district: t(p.district, 80), city: t(p.city, 80), goal: t(p.goal, 300),
  };
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 200) throw badRequest('A senha deve ter pelo menos 8 caracteres.', 'weak_password');
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw badRequest('A senha deve ter letras e números.', 'weak_password');
}

/** Conclui o cadastro a partir do convite. Retorna o usuário (para criar a sessão). */
export async function completeInvite(token, body, ip = null) {
  validatePassword(body.password);
  const hash = await hashPassword(body.password);
  return tx(SYSTEM, async (d) => {
    const inv = await d.one(
      `SELECT i.*, u.role, u.email FROM invites i JOIN users u ON u.id = i.user_id JOIN tenants t ON t.id = i.tenant_id
        WHERE i.token_hash = ? AND t.status = 'active' FOR UPDATE OF i`,
      [sha256(String(token || ''))]
    );
    if (!inv || inv.used_at || inv.revoked_at || inv.expires_at < nowIso()) throw badRequest('Convite inválido ou expirado. Peça um novo convite à sua professora.', 'invalid_invite');
    const ts = nowIso();
    if (inv.role === 'student') {
      if (body.terms_accepted !== true) throw badRequest('É preciso aceitar os termos de uso e a política de privacidade.', 'terms_required');
      const p = validateProfile(body);
      const dup = await d.one('SELECT 1 FROM students WHERE tenant_id = ? AND cpf = ? AND user_id <> ?', [inv.tenant_id, p.cpf, inv.user_id]);
      if (dup) throw conflict('Este CPF já está cadastrado. Fale com sua professora.', 'cpf_taken');
      await d.run(
        `UPDATE students SET cpf=?, phone=?, postal_code=?, address_line=?, address_number=?, address_complement=?, district=?, city=?, state=?,
                goal = COALESCE(?, goal), birth_date = COALESCE(?, birth_date), terms_version=?, terms_accepted_at=?, updated_at=? WHERE user_id = ?`,
        [p.cpf, p.phone, p.postal_code, p.address_line, p.address_number, p.address_complement, p.district, p.city, p.state, p.goal, p.birth_date, TERMS_VERSION, ts, ts, inv.user_id]
      );
      const stu = await d.one('SELECT id FROM students WHERE user_id = ?', [inv.user_id]);
      await recordAcceptance(d, { tenantId: inv.tenant_id, studentId: stu.id, ip });
    }
    const name = body.name && String(body.name).trim().length >= 3 ? String(body.name).trim().slice(0, 120) : null;
    await d.run(`UPDATE users SET password_hash = ?, status = 'active', name = COALESCE(?, name), updated_at = ? WHERE id = ?`, [hash, name, ts, inv.user_id]);
    await d.run('UPDATE invites SET used_at = ? WHERE id = ?', [ts, inv.id]);
    await audit(d, { userId: inv.user_id }, 'invite.complete', { targetType: 'user', targetId: inv.user_id, tenantId: inv.tenant_id });
    return d.one('SELECT id, tenant_id, email, name, role FROM users WHERE id = ?', [inv.user_id]);
  });
}

// ───────────── Alunos ─────────────

export async function createStudent(d, ctx, { name, email, edital_ids = [], goal }, req) {
  const em = cleanEmail(email);
  if (!name || String(name).trim().length < 3) throw badRequest('Informe o nome completo do aluno.');
  if (!EMAIL_RE.test(em)) throw badRequest('E-mail inválido.');
  const ts = nowIso();
  const user = await insertUser(d, [ctx.tenantId, em, String(name).trim().slice(0, 120), 'student', ts]);
  const st = await d.one('INSERT INTO students (tenant_id, user_id, goal, created_at, updated_at) VALUES (?,?,?,?,?) RETURNING id', [ctx.tenantId, user.id, goal ? String(goal).slice(0, 300) : null, ts, ts]);
  if (ctx.role === 'mentor') await d.run('INSERT INTO staff_assignments (tenant_id, staff_id, student_id) VALUES (?,?,?)', [ctx.tenantId, ctx.userId, st.id]);
  for (const eid of edital_ids) await enrollStudent(d, ctx, st.id, eid);
  const invite = await createInvite(d, ctx, user, ctx.tenantId, req);
  await audit(d, ctx, 'student.create', { targetType: 'student', targetId: st.id, payload: { email: em, editais: edital_ids.length } });
  return { student_id: st.id, user, invite };
}

export async function regenerateInvite(d, ctx, studentId, req) {
  const st = await assertStudent(d, ctx, studentId);
  if (st.user_status !== 'invited') throw badRequest('Este aluno já concluiu o cadastro. Use "link de nova senha" se ele esqueceu a senha.');
  const invite = await createInvite(d, ctx, { id: st.user_id }, st.tenant_id, req);
  await audit(d, ctx, 'student.invite_regenerate', { targetType: 'student', targetId: studentId });
  return invite;
}

export async function enrollStudent(d, ctx, studentId, editalId) {
  const ed = await d.one('SELECT id, archived_at FROM editais WHERE id = ?', [editalId]);
  if (!ed) throw notFound('Edital não encontrado.');
  if (ed.archived_at) throw badRequest('Edital arquivado.');
  const existing = await d.one('SELECT * FROM enrollments WHERE student_id = ? AND edital_id = ?', [studentId, editalId]);
  if (existing) {
    if (existing.status === 'archived') {
      await d.run("UPDATE enrollments SET status = 'active', archived_at = NULL WHERE id = ?", [existing.id]);
      await audit(d, ctx, 'enrollment.reactivate', { targetType: 'enrollment', targetId: existing.id });
    }
    return existing.id;
  }
  const row = await d.one('INSERT INTO enrollments (tenant_id, student_id, edital_id, created_by, created_at) VALUES (?,?,?,?,?) RETURNING id', [ctx.tenantId, studentId, editalId, ctx.userId, nowIso()]);
  await audit(d, ctx, 'enrollment.create', { targetType: 'enrollment', targetId: row.id, payload: { student_id: studentId, edital_id: editalId } });
  return row.id;
}

export async function archiveEnrollment(d, ctx, studentId, enrollmentId) {
  const n = await d.run("UPDATE enrollments SET status = 'archived', archived_at = ? WHERE id = ? AND student_id = ? AND status = 'active'", [nowIso(), enrollmentId, studentId]);
  if (!n) throw notFound('Matrícula não encontrada.');
  await audit(d, ctx, 'enrollment.archive', { targetType: 'enrollment', targetId: enrollmentId });
}

/** Alterações administrativas no aluno (professora/monitor atribuído). */
export async function updateStudent(d, ctx, studentId, patch) {
  const st = await assertStudent(d, ctx, studentId);
  const changes = {};
  if (patch.name !== undefined) {
    const n = String(patch.name).trim();
    if (n.length < 3) throw badRequest('Nome inválido.');
    await d.run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [n.slice(0, 120), nowIso(), st.user_id]);
    changes.name = n;
  }
  if (patch.cohort !== undefined) {
    const c = patch.cohort ? String(patch.cohort).trim().slice(0, 120) : null;
    await d.run('UPDATE students SET cohort = ?, updated_at = ? WHERE id = ?', [c, nowIso(), studentId]);
    await audit(d, ctx, 'student.cohort', { targetType: 'student', targetId: studentId, payload: { anterior: st.cohort ?? null, novo: c } });
    changes.cohort = c;
  }
  if (patch.active !== undefined) {
    if (st.user_status === 'invited') throw badRequest('O aluno ainda não concluiu o cadastro.');
    const status = patch.active ? 'active' : 'disabled';
    await d.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), st.user_id]);
    if (!patch.active) await destroyUserSessions(d, st.user_id);
    changes.status = status;
  }
  if (patch.extra_reviews_allowed !== undefined) {
    if (ctx.role !== 'teacher' && !ctx.actingAsPlatform) throw forbidden('Somente a professora pode liberar revisões extras.');
    const allowed = !!patch.extra_reviews_allowed;
    if (allowed !== !!st.extra_reviews_allowed) {
      await d.run('UPDATE students SET extra_reviews_allowed = ?, updated_at = ? WHERE id = ?', [allowed, nowIso(), studentId]);
      await applyExtraReviewsChange(d, ctx, studentId, allowed);
      changes.extra_reviews_allowed = allowed;
    }
  }
  if ((patch.access_until !== undefined || patch.plan_status !== undefined) && (await d.one('SELECT 1 AS x FROM accesses WHERE student_id = ? LIMIT 1', [studentId]))) {
    throw badRequest('Este aluno tem acessos cadastrados. Altere a validade na seção "Acessos" do Raio-X.', 'use_accesses');
  }
  if (patch.access_until !== undefined) {
    const v = patch.access_until || null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest('Data de validade inválida.');
    await d.run('UPDATE students SET access_until = ?, updated_at = ? WHERE id = ?', [v, nowIso(), studentId]);
    changes.access_until = v;
    // Nova validade no futuro = plano renovado (recuperação de venda): reabre o plano encerrado.
    if (v && v >= localDate(now(), st.timezone || undefined) && st.plan_status === 'ended' && patch.plan_status === undefined) {
      await d.run("UPDATE students SET plan_status = 'active', updated_at = ? WHERE id = ?", [nowIso(), studentId]);
      changes.plan_status = 'active';
    }
  }
  if (patch.plan_status !== undefined) {
    if (ctx.role !== 'teacher' && !ctx.actingAsPlatform) throw forbidden('Somente a professora pode alterar o plano.');
    if (!['active', 'ended'].includes(patch.plan_status)) throw badRequest('Situação do plano inválida.');
    if (patch.plan_status !== st.plan_status) {
      await d.run('UPDATE students SET plan_status = ?, updated_at = ? WHERE id = ?', [patch.plan_status, nowIso(), studentId]);
      if (patch.plan_status === 'ended') await destroyUserSessions(d, st.user_id);
      changes.plan_status = patch.plan_status;
    }
  }
  if (patch.goal !== undefined) {
    await d.run('UPDATE students SET goal = ?, updated_at = ? WHERE id = ?', [patch.goal ? String(patch.goal).slice(0, 300) : null, nowIso(), studentId]);
    changes.goal = true;
  }
  if (Object.keys(changes).length) await audit(d, ctx, 'student.update', { targetType: 'student', targetId: studentId, payload: changes });
  return changes;
}

/** Link de redefinição de senha gerado pela professora (ex.: enviar por WhatsApp). */
export async function createResetToken(d, userId, tenantId) {
  const token = randomToken(32);
  const expires = new Date(now().getTime() + 3600_000).toISOString();
  await d.run('INSERT INTO password_resets (token_hash, user_id, tenant_id, expires_at, created_at) VALUES (?,?,?,?,?)', [sha256(token), userId, tenantId, expires, nowIso()]);
  return token;
}
export const resetUrl = (req, token) => `${appUrl(req)}/redefinir-senha?token=${encodeURIComponent(token)}`;

// ───────────── Equipe (monitores) ─────────────

export async function createMentor(d, ctx, { name, email, role = 'mentor' }, req) {
  if (!['mentor', 'coordinator', 'teacher'].includes(role)) throw badRequest('Perfil inválido.');
  if (role === 'teacher' && ctx.role !== 'teacher' && !ctx.actingAsPlatform) throw forbidden('Somente a professora cria outra conta de professora/administrador.');
  const em = cleanEmail(email);
  if (!name || String(name).trim().length < 3) throw badRequest('Informe o nome.');
  if (!EMAIL_RE.test(em)) throw badRequest('E-mail inválido.');
  const ts = nowIso();
  const user = await insertUser(d, [ctx.tenantId, em, String(name).trim().slice(0, 120), role, ts]);
  const invite = await createInvite(d, ctx, user, ctx.tenantId, req);
  await audit(d, ctx, 'team.create', { targetType: 'user', targetId: user.id, payload: { email: em, role } });
  return { user, invite };
}

export async function setMentorStudents(d, ctx, mentorId, studentIds) {
  const m = await d.one("SELECT id FROM users WHERE id = ? AND role = 'mentor'", [mentorId]);
  if (!m) throw notFound('Monitor não encontrado.');
  await d.run('DELETE FROM staff_assignments WHERE staff_id = ?', [mentorId]);
  for (const sid of studentIds) {
    const st = await d.one('SELECT id FROM students WHERE id = ?', [sid]);
    if (st) await d.run('INSERT INTO staff_assignments (tenant_id, staff_id, student_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [ctx.tenantId, mentorId, sid]);
  }
  await audit(d, ctx, 'team.assign', { targetType: 'user', targetId: mentorId, payload: { students: studentIds.length } });
}

/** Aluno importado da V1 (sem CPF/endereço) completa o cadastro já logado. */
export async function completeProfile(d, ctx, body) {
  const st = await d.one('SELECT id, cpf, terms_accepted_at FROM students WHERE id = ?', [ctx.studentId]);
  if (!st) throw notFound('Aluno não encontrado.');
  if (body.terms_accepted !== true) throw badRequest('É preciso aceitar os termos de uso e a política de privacidade.', 'terms_required');
  const p = validateProfile(body);
  const dup = await d.one('SELECT 1 FROM students WHERE tenant_id = ? AND cpf = ? AND id <> ?', [ctx.tenantId, p.cpf, st.id]);
  if (dup) throw conflict('Este CPF já está cadastrado. Fale com sua professora.', 'cpf_taken');
  const ts = nowIso();
  await d.run(
    `UPDATE students SET cpf=?, phone=?, postal_code=?, address_line=?, address_number=?, address_complement=?, district=?, city=?, state=?, birth_date = COALESCE(?, birth_date),
            terms_version=?, terms_accepted_at=?, updated_at=? WHERE id = ?`,
    [p.cpf, p.phone, p.postal_code, p.address_line, p.address_number, p.address_complement, p.district, p.city, p.state, p.birth_date, TERMS_VERSION, ts, ts, st.id]
  );
  await recordAcceptance(d, { tenantId: ctx.tenantId, studentId: st.id, ip: ctx.ip });
  await audit(d, ctx, 'student.complete_profile', { targetType: 'student', targetId: st.id });
}
