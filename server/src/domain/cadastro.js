/**
 * Edição de dados cadastrais (aluno por si mesmo ou equipe).
 * Regras: toda alteração passa por uma PRÉVIA (dry_run) que devolve "anterior → novo"; só grava com confirmação.
 * A auditoria guarda o valor anterior e o novo de cada campo.
 */
import { badRequest, conflict, forbidden, nowIso } from '../lib/util.js';
import { formatCpf, isValidCpf, onlyDigits } from '../lib/cpf.js';
import { audit, assertStudent } from '../security/access.js';
import { destroyUserSessions } from '../security/auth.js';

const UF = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const txt = (n) => (v) => (v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, n));

export const FIELD_LABELS = {
  name: 'Nome', email: 'E-mail', phone: 'Celular', birth_date: 'Data de nascimento', cpf: 'CPF', postal_code: 'CEP',
  address_line: 'Endereço', address_number: 'Número', address_complement: 'Complemento', district: 'Bairro', city: 'Cidade', state: 'UF', goal: 'Objetivo',
};

/** Normaliza e valida UM campo. Retorna o valor canônico (null = vazio). */
const NORMALIZE = {
  name: (v) => { const n = String(v ?? '').trim(); if (n.length < 3) throw badRequest('Nome inválido.'); return n.slice(0, 120); },
  email: (v) => { const e = String(v ?? '').trim().toLowerCase(); if (!EMAIL_RE.test(e)) throw badRequest('E-mail inválido.'); return e; },
  phone: (v) => { const p = onlyDigits(v); if (p.length < 10 || p.length > 11) throw badRequest('Celular inválido (DDD + número).'); return p; },
  birth_date: (v) => {
    if (v == null || v === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest('Data de nascimento inválida.');
    const dt = new Date(`${v}T12:00:00Z`);
    if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== v) throw badRequest('Data de nascimento inválida.');
    const y = Number(v.slice(0, 4));
    if (y < 1920 || dt > new Date()) throw badRequest('Data de nascimento inválida.');
    return v;
  },
  cpf: (v) => { const c = onlyDigits(v); if (!isValidCpf(c)) throw badRequest('CPF inválido.'); return c; },
  postal_code: (v) => { const c = onlyDigits(v); if (c.length !== 8) throw badRequest('CEP inválido.'); return c; },
  address_line: txt(160), address_number: txt(20), address_complement: txt(80), district: txt(80), city: txt(80),
  state: (v) => { const u = String(v ?? '').trim().toUpperCase(); if (!UF.includes(u)) throw badRequest('UF inválida.'); return u; },
  goal: txt(300),
};
export const normalizeField = (field, value) => NORMALIZE[field](value);
const DISPLAY = { cpf: formatCpf };

const USER_FIELDS = new Set(['name', 'email']);
const isTeacher = (ctx) => ctx.role === 'teacher' || ctx.actingAsPlatform;
const isCoord = (ctx) => ctx.role === 'coordinator';
/** Campos que cada papel pode editar. */
export function editableFields(ctx, self = false) {
  const base = ['phone', 'birth_date', 'postal_code', 'address_line', 'address_number', 'address_complement', 'district', 'city', 'state', 'goal'];
  if (self) return ['name', ...base];
  if (isTeacher(ctx) || isCoord(ctx)) return ['name', 'email', 'cpf', ...base];
  return ['name', ...base];
}

/**
 * Aplica (ou apenas simula) alterações cadastrais.
 * @returns {{changes: Array<{field,label,from,to}>, applied: boolean}}
 */
export async function changeCadastro(d, ctx, studentId, patch, { dryRun = false, self = false } = {}) {
  const st = await assertStudent(d, ctx, studentId);
  const allowed = new Set(editableFields(ctx, self));
  const changes = [];
  const next = {};
  for (const [field, raw] of Object.entries(patch || {})) {
    if (!(field in NORMALIZE)) continue;
    if (!allowed.has(field)) throw forbidden(`Você não pode alterar o campo "${FIELD_LABELS[field]}".`);
    const to = NORMALIZE[field](raw);
    const from = st[field] ?? null;
    const fromCmp = from instanceof Date ? from.toISOString().slice(0, 10) : from;
    if ((fromCmp ?? null) === (to ?? null)) continue;
    next[field] = to;
    const show = DISPLAY[field] || ((x) => x);
    changes.push({ field, label: FIELD_LABELS[field], from: fromCmp == null ? null : show(fromCmp), to: to == null ? null : show(to) });
  }
  if (!changes.length) return { changes: [], applied: false };

  if (next.cpf) {
    const dup = await d.one('SELECT 1 AS x FROM students WHERE tenant_id = ? AND cpf = ? AND id <> ?', [st.tenant_id, next.cpf, st.id]);
    if (dup) throw conflict('Este CPF já está cadastrado em outro aluno.', 'cpf_taken');
  }
  if (next.email) {
    const dup = await d.one('SELECT 1 AS x FROM users WHERE lower(email) = ? AND id <> ?', [next.email, st.user_id]);
    if (dup) throw conflict('Este e-mail já está em uso por outra conta.', 'email_taken');
  }
  if (dryRun) return { changes, applied: false };

  const ts = nowIso();
  const u = Object.entries(next).filter(([f]) => USER_FIELDS.has(f));
  const s = Object.entries(next).filter(([f]) => !USER_FIELDS.has(f));
  if (u.length) await d.run(`UPDATE users SET ${u.map(([f]) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...u.map(([, v]) => v), ts, st.user_id]);
  if (s.length) await d.run(`UPDATE students SET ${s.map(([f]) => `${f} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...s.map(([, v]) => v), ts, st.id]);
  if (next.email) await destroyUserSessions(d, st.user_id);
  await audit(d, ctx, self ? 'student.cadastro_self_update' : 'student.cadastro_update', {
    targetType: 'student', targetId: st.id,
    payload: { changes: changes.map((c) => ({ campo: c.label, anterior: c.from, novo: c.to })) },
  });
  return { changes, applied: true };
}
