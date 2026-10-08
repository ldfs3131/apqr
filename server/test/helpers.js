/**
 * Utilidades de teste. Banco: DATABASE_URL (Postgres real, recomendado/CI) ou PGlite em memória.
 * Cada arquivo de teste chama `setup()` (zera os dados) e monta seus próprios cenários.
 */
import request from 'supertest';
import { openDb, truncateAll, tx, SYSTEM } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { hashPassword, resetRateLimits } from '../src/security/auth.js';
import { nowIso, resetClock } from '../src/lib/util.js';

process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL && !process.env.PGLITE_DIR) process.env.PGLITE_DIR = 'memory://';

let app = null;
export async function setup() {
  await openDb();
  await truncateAll();
  resetRateLimits();
  resetClock();
  app ||= createApp();
  return app;
}

export function agent() {
  const a = request.agent(app);
  const wrap = (m) => (url) => a[m](url).set('X-Requested-With', 'apqr');
  return { get: (url) => a.get(url), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete'), raw: a };
}

export const PASSWORD = 'Senha12345';
let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createPlatformAdmin(email = `admin-${uniq()}@oneup.test`) {
  const hash = await hashPassword(PASSWORD);
  await tx(SYSTEM, (d) => d.run(`INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at) VALUES (?,?,?,'platform_admin','active',?,?)`, [email, hash, 'Admin ONE UP', nowIso(), nowIso()]));
  const a = agent();
  await login(a, email);
  return { agent: a, email };
}

export async function login(a, email, password = PASSWORD) {
  const res = await a.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login falhou para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.user;
}

export const tokenFromUrl = (url) => url.split('/').pop().split('token=').pop();

/** Gera CPFs válidos e únicos (dígitos verificadores calculados). */
let cpfSeq = 100000000 + Math.floor(Math.random() * 1000000);
export function nextCpf() {
  const base = String(cpfSeq++).padStart(9, '0').split('').map(Number);
  const dv = (arr) => {
    const sum = arr.reduce((a, n, i) => a + n * (arr.length + 1 - i), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(base);
  const d2 = dv([...base, d1]);
  return [...base, d1, d2].join('');
}

export function profile(overrides = {}) {
  return {
    password: PASSWORD, cpf: nextCpf(), phone: '61999998888', postal_code: '72880000', address_line: 'Rua das Flores',
    address_number: '10', district: 'Centro', city: 'Cidade Ocidental', state: 'GO', terms_accepted: true, ...overrides,
  };
}

/** Cria um ambiente completo: professora ativa (logada), edital com 2 matérias e N alunos ativos. */
export async function createTenantWithClass(admin, { slug = `t-${uniq()}`, students = 2, topicsPerSubject = 3 } = {}) {
  resetRateLimits();
  const teacherEmail = `prof-${uniq()}@oneup.test`;
  const res = await admin.post('/api/platform/tenants').send({ slug, name: `Mentoria ${slug}`, teacher_name: 'Professora Teste', teacher_email: teacherEmail });
  if (res.status !== 201) throw new Error(`criar ambiente: ${res.status} ${JSON.stringify(res.body)}`);
  const teacher = agent();
  const done = await teacher.post(`/api/auth/invite/${tokenFromUrl(res.body.invite.url)}`).send({ password: PASSWORD });
  if (done.status !== 201) throw new Error(`convite professora: ${done.status} ${JSON.stringify(done.body)}`);
  const ed = (await teacher.post('/api/teacher/editais').send({ name: 'SES-GO 2026 — Farmacêutico', exam_date: '2027-03-01' })).body.edital;
  const names = (p) => Array.from({ length: topicsPerSubject }, (_, i) => `${p} ${i + 1}`);
  const s1 = (await teacher.post(`/api/teacher/editais/${ed.id}/subjects`).send({ name: 'Farmacologia', topics: names('Farmaco') })).body.subject;
  const s2 = (await teacher.post(`/api/teacher/editais/${ed.id}/subjects`).send({ name: 'Legislação SUS', topics: names('SUS') })).body.subject;
  const list = [];
  for (let i = 0; i < students; i++) list.push(await createActiveStudent(teacher, { edital_ids: [ed.id] }));
  const structure = (await teacher.get(`/api/teacher/editais/${ed.id}`)).body.subjects;
  return { tenant: res.body.tenant, teacher, teacherEmail, edital: ed, subjects: [s1, s2], structure, students: list };
}

export async function createActiveStudent(teacher, { edital_ids = [], name = 'Aluno Teste', overrides = {} } = {}) {
  resetRateLimits();
  const email = `aluno-${uniq()}@oneup.test`;
  const res = await teacher.post('/api/teacher/students').send({ name, email, edital_ids });
  if (res.status !== 201) throw new Error(`criar aluno: ${res.status} ${JSON.stringify(res.body)}`);
  const a = agent();
  const done = await a.post(`/api/auth/invite/${tokenFromUrl(res.body.invite.url)}`).send(profile(overrides));
  if (done.status !== 201) throw new Error(`convite aluno: ${done.status} ${JSON.stringify(done.body)}`);
  const enr = (await a.get('/api/me/enrollments')).body.enrollments || [];
  return { agent: a, email, studentId: res.body.student_id, userId: res.body.user.id, enrollments: enr };
}

export { resetRateLimits };
