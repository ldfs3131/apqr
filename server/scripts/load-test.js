/**
 * Teste de carga: cria um ambiente com N alunos (padrão 1.000) e ~60 dias de histórico cada,
 * e mede o tempo das telas mais pesadas (Central, Ranking, Raio-X, painel do aluno).
 *
 *   DATABASE_URL=postgres://... node scripts/load-test.js [--students 1000] [--keep]
 *
 * Use um banco de TESTE. Sem --keep, o ambiente de carga é suspenso ao final (os dados ficam para inspeção).
 */
import request from 'supertest';
import { openDb, closeDb, tx, SYSTEM } from '../src/db/index.js';
import { createApp } from '../src/app.js';
import { hashPassword, resetRateLimits } from '../src/security/auth.js';
import { createTenant } from '../src/domain/people.js';
import * as E from '../src/domain/editais.js';
import { addDays, nowIso, today } from '../src/lib/util.js';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('students', 1000));
const PASSWORD = 'Carga12345';
const T = today();

await openDb();
const t0 = Date.now();
const slug = `carga-${Date.now().toString(36)}`;
const hash = await hashPassword(PASSWORD);
const { tenant, teacher } = await createTenant({ userId: null }, { slug, name: `Carga ${N}`, teacher_name: 'Professora Carga', teacher_email: `${slug}@load.test` });
await tx(SYSTEM, (d) => d.run(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [hash, teacher.id]));
const tctx = { userId: teacher.id, role: 'teacher', tenantId: tenant.id, platform: false, tz: 'America/Sao_Paulo' };
const edital = await tx(tctx, async (d) => {
  const ed = await E.createEdital(d, tctx, { name: 'Edital de carga', exam_date: addDays(T, 90) });
  for (let s = 1; s <= 6; s++) await E.createSubject(d, tctx, ed.id, { name: `Matéria ${s}`, topics: Array.from({ length: 10 }, (_, i) => `Conteúdo ${s}.${i + 1}`) });
  return ed;
});

console.log(`Gerando ${N} alunos com histórico…`);
await tx(SYSTEM, async (d) => {
  const ts = nowIso();
  const start = addDays(T, -60);
  await d.run(
    `INSERT INTO users (tenant_id, email, password_hash, name, role, status, created_at, updated_at)
     SELECT ?, ? || '-' || g || '@load.test', ?, 'Aluno ' || lpad(g::text, 5, '0'), 'student', 'active', ?::timestamptz - (random() * interval '60 days'), ?
       FROM generate_series(1, ?) g`, [tenant.id, slug, hash, ts, ts, N]);
  await d.run(`INSERT INTO students (tenant_id, user_id, onboarding_done, created_at, updated_at) SELECT tenant_id, id, true, created_at, updated_at FROM users WHERE tenant_id = ? AND role = 'student'`, [tenant.id]);
  await d.run(`INSERT INTO enrollments (tenant_id, student_id, edital_id, created_at) SELECT tenant_id, id, ?, created_at FROM students WHERE tenant_id = ?`, [edital.id, tenant.id]);
  // Progresso: cada aluno com mistura de etapas (aleatória, proporção realista)
  await d.run(
    `INSERT INTO topic_progress (tenant_id, enrollment_id, student_id, topic_id, status, started_at, material_done_at, review_started_at, consolidated_at, created_at, updated_at)
     SELECT e.tenant_id, e.id, e.student_id, t.id, x.st,
            CASE WHEN x.st <> 'not_started' THEN ?::date + (random() * 20)::int END,
            CASE WHEN x.st IN ('production','review','consolidated') THEN ?::date + 20 + (random() * 10)::int END,
            CASE WHEN x.st IN ('review','consolidated') THEN ?::date + 30 + (random() * 10)::int END,
            CASE WHEN x.st = 'consolidated' THEN ?::date + 45 + (random() * 10)::int END,
            ?, ?
       FROM enrollments e JOIN topics t ON t.edital_id = e.edital_id
       CROSS JOIN LATERAL (SELECT (ARRAY['not_started','not_started','assimilation','production','review','review','consolidated','consolidated'])[1 + floor(random() * 8)::int] AS st) x
      WHERE e.tenant_id = ?`, [start, start, start, start, ts, ts, tenant.id]);
  // Sessões de estudo: ~40 por aluno nos últimos 60 dias
  await d.run(
    `INSERT INTO study_sessions (tenant_id, student_id, enrollment_id, topic_id, activity, date, duration_seconds, source, created_at)
     SELECT p.tenant_id, p.student_id, p.enrollment_id, p.topic_id, 'study', ?::date + (random() * 59)::int, 1800 + (random() * 5400)::int, 'manual', ?
       FROM topic_progress p CROSS JOIN generate_series(1, 2) k
      WHERE p.tenant_id = ? AND p.status <> 'not_started' AND random() < 0.9`, [start, ts, tenant.id]);
  // Revisões (1 a 3 por conteúdo em revisão/consolidado) + questões correspondentes
  await d.run(
    `INSERT INTO reviews (tenant_id, student_id, enrollment_id, topic_id, progress_id, cycle, number, date, questions, correct, threshold_used, min_questions_used, config_version, consolidated, created_at)
     SELECT p.tenant_id, p.student_id, p.enrollment_id, p.topic_id, p.id, 1, n, LEAST(?::date, p.review_started_at + n * 4), 30, CASE WHEN p.status = 'consolidated' AND n = 1 THEN 24 ELSE 15 + (random() * 6)::int END, 70, 20, 1,
            p.status = 'consolidated' AND n = 1, ?
       FROM topic_progress p CROSS JOIN LATERAL generate_series(1, CASE WHEN p.status = 'consolidated' THEN 1 ELSE 1 + floor(random() * 3)::int END) n
      WHERE p.tenant_id = ? AND p.status IN ('review','consolidated')`, [T, ts, tenant.id]);
  await d.run(
    `INSERT INTO question_logs (tenant_id, student_id, enrollment_id, topic_id, review_id, source, date, questions, correct, created_at)
     SELECT tenant_id, student_id, enrollment_id, topic_id, id, 'review', date, questions, correct, created_at FROM reviews WHERE tenant_id = ?`, [tenant.id]);
  await d.run(
    `INSERT INTO learning_events (tenant_id, student_id, enrollment_id, topic_id, type, from_status, to_status, date, actor_user_id, created_at)
     SELECT p.tenant_id, p.student_id, p.enrollment_id, p.topic_id, 'status_change', 'not_started', p.status, p.started_at, s.user_id, ?
       FROM topic_progress p JOIN students s ON s.id = p.student_id WHERE p.tenant_id = ? AND p.status <> 'not_started'`, [ts, tenant.id]);
});
const counts = await tx(SYSTEM, (d) => d.one(
  `SELECT (SELECT count(*) FROM students WHERE tenant_id = ?) AS students,
          (SELECT count(*) FROM topic_progress WHERE tenant_id = ?) AS progress,
          (SELECT count(*) FROM study_sessions WHERE tenant_id = ?) AS sessions,
          (SELECT count(*) FROM reviews WHERE tenant_id = ?) AS reviews,
          (SELECT count(*) FROM learning_events WHERE tenant_id = ?) AS events`, Array(5).fill(tenant.id)));
console.log('Registros:', counts, `(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
await tx(SYSTEM, (d) => d.run('ANALYZE'));

const app = createApp();
const ag = request.agent(app);
const H = { 'X-Requested-With': 'apqr' };
resetRateLimits();
await ag.post('/api/auth/login').set(H).send({ email: `${slug}@load.test`, password: PASSWORD }).expect(200);
async function time(label, fn, runs = 3) {
  const ms = [];
  let res;
  for (let i = 0; i < runs; i++) { const s = performance.now(); res = await fn(); ms.push(performance.now() - s); }
  ms.sort((a, b) => a - b);
  console.log(`${label.padEnd(42)} mediana ${ms[Math.floor(ms.length / 2)].toFixed(0).padStart(6)} ms  (min ${ms[0].toFixed(0)}, máx ${ms[ms.length - 1].toFixed(0)})`);
  return res;
}
const central = await time('Central (1.000 alunos)', () => ag.get('/api/teacher/central').expect(200));
await time('Ranking por edital (constância)', () => ag.get(`/api/teacher/ranking?edital_id=${edital.id}&metric=constancy`).expect(200));
await time('Ranking: % de acerto', () => ag.get(`/api/teacher/ranking?edital_id=${edital.id}&metric=accuracy`).expect(200));
await time('Fila da Coordenação', () => ag.get('/api/teacher/fila').expect(200));
await time('Lista de alunos', () => ag.get('/api/teacher/students').expect(200));
const sid = central.body.students[Math.floor(central.body.students.length / 2)].student_id;
await time('Raio-X de um aluno', () => ag.get(`/api/teacher/students/${sid}/xray`).expect(200));
const eid = central.body.students[0].enrollment_id ?? central.body.students[0].editais[0].enrollment_id;
await time('Painel do aluno (visto pela professora)', () => ag.get(`/api/enrollments/${eid}/dashboard`).expect(200));
await time('Relatório por regras (IA)', () => ag.post(`/api/teacher/enrollments/${eid}/ai-report`).set(H).send({ force: true }).expect(201));

// Concorrência: 50 alunos abrindo o painel ao mesmo tempo
const emails = (await tx(SYSTEM, (d) => d.all(`SELECT u.email, e.id AS eid FROM users u JOIN students s ON s.user_id = u.id JOIN enrollments e ON e.student_id = s.id WHERE u.tenant_id = ? LIMIT 50`, [tenant.id])));
const agents = [];
for (const u of emails) { resetRateLimits(); const a = request.agent(app); await a.post('/api/auth/login').set(H).send({ email: u.email, password: PASSWORD }).expect(200); agents.push([a, u.eid]); }
const s0 = performance.now();
await Promise.all(agents.map(([a, e]) => a.get(`/api/enrollments/${e}/dashboard`).expect(200)));
const total = performance.now() - s0;
console.log(`${'50 painéis de aluno em paralelo'.padEnd(42)} total ${total.toFixed(0).padStart(8)} ms  (${(total / 50).toFixed(0)} ms por painel)`);
console.log(`Kpis da central: ${JSON.stringify(central.body.kpis)}`);

if (!process.argv.includes('--keep')) await tx(SYSTEM, (d) => d.run(`UPDATE tenants SET status = 'suspended' WHERE id = ?`, [tenant.id]));
await closeDb();
