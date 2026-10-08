import request from 'supertest';
import { openDb, closeDb, getDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { hashPassword, resetRateLimits } from '../src/auth.js';
import { nowIso, resetClock } from '../src/lib/util.js';

export function freshApp() {
  closeDb();
  resetClock();
  resetRateLimits();
  openDb(':memory:');
  const d = getDb();
  const u = d.prepare(`INSERT INTO users (email, password_hash, name, role, created_at) VALUES ('admin@apqr.test', ?, 'Admin', 'admin', ?)`).run(hashPassword('admin12345'), nowIso());
  d.prepare(`INSERT INTO admins (user_id, level, created_at) VALUES (?, 'owner', ?)`).run(u.lastInsertRowid, nowIso());
  return createApp();
}

/** Cliente autenticado (mantém cookie) com o cabeçalho anti-CSRF. */
export function client(app) {
  const agent = request.agent(app);
  const wrap = (m) => (url, body) => {
    let r = agent[m](url).set('X-Requested-With', 'apqr');
    if (body !== undefined) r = r.send(body);
    return r;
  };
  return { agent, get: (url) => agent.get(url), post: wrap('post'), patch: wrap('patch'), put: wrap('put'), del: wrap('delete') };
}

export async function loginAdmin(app) {
  const c = client(app);
  await c.post('/api/auth/login', { email: 'admin@apqr.test', password: 'admin12345' }).expect(200);
  return c;
}

let seq = 0;
export async function newStudent(app, admin) {
  const inv = await admin.post('/api/admin/invites', { max_uses: 1 }).expect(201);
  const c = client(app);
  seq++;
  const res = await c.post('/api/auth/register', { name: `Aluno ${seq}`, email: `aluno${seq}@apqr.test`, password: 'senha12345', invite_code: inv.body.invite.code }).expect(201);
  c.user = res.body.user;
  return c;
}

/** Cria edital próprio com uma disciplina e N tópicos. */
export async function examWithTopics(c, names = ['Tópico A'], subject = 'Português', examName = 'Concurso Teste') {
  const ex = await c.post('/api/exams', { name: examName }).expect(201);
  const examId = ex.body.exam.id;
  await c.post(`/api/exams/${examId}/subjects`, { name: subject, topics: names }).expect(201);
  const st = await c.get(`/api/exams/${examId}/structure`).expect(200);
  const topics = st.body.subjects[0].topics;
  return { examId, topics, subjectId: st.body.subjects[0].id };
}

export async function toReview(c, examId, topicId) {
  await c.post(`/api/exams/${examId}/topics/${topicId}/status`, { status: 'assimilation' }).expect(200);
  await c.post(`/api/exams/${examId}/topics/${topicId}/status`, { status: 'production' }).expect(200);
  await c.post(`/api/exams/${examId}/topics/${topicId}/status`, { status: 'review' }).expect(200);
}
