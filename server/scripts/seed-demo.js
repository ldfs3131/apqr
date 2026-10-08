/**
 * Dados de DEMONSTRAÇÃO da V2 (não usar em produção com alunos reais).
 *
 * Cria (se ainda não existir):
 *   - admin ONE UP ............ admin@demo.oneup / demo12345
 *   - ambiente "Mentoria Demo" (slug demo) com a professora professora@demo.oneup / demo12345
 *   - um edital com matérias, conteúdos e Plano Global
 *   - 10 alunos com perfis de estudo diferentes ao longo de ~60 dias (aluno1@demo.oneup … / demo12345)
 *
 *   node scripts/seed-demo.js
 *
 * Usa as MESMAS funções de domínio da aplicação (regras APQR, versões de configuração, histórico),
 * então os dados gerados passam por todas as validações reais.
 */
import { openDb, closeDb, tx, SYSTEM } from '../src/db/index.js';
import { hashPassword } from '../src/security/auth.js';
import { nowIso, today, addDays } from '../src/lib/util.js';
import { createTenant, createStudent } from '../src/domain/people.js';
import * as E from '../src/domain/editais.js';
import * as A from '../src/domain/apqr.js';
import * as Study from '../src/domain/study.js';
import { saveRoutine } from '../src/domain/routine.js';
import { assertEnrollment } from '../src/security/access.js';

const PASSWORD = 'demo12345';
const TZ = 'America/Sao_Paulo';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO !== '1') {
  console.error('Recusado: os dados de demonstração criam um administrador com senha conhecida e não podem rodar em produção.');
  process.exit(1);
}
await openDb();
const exists = await tx(SYSTEM, (d) => d.one("SELECT 1 FROM tenants WHERE slug = 'demo'"));
if (exists) {
  console.log('Dados de demonstração já existem (ambiente "demo").');
  await closeDb();
  process.exit(0);
}

let seed = 20260930;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rand() * a.length)];
const hash = await hashPassword(PASSWORD);
const T = today(TZ);

// ───────── Admin ONE UP ─────────
await tx(SYSTEM, async (d) => {
  if (!(await d.one("SELECT 1 FROM users WHERE lower(email) = 'admin@demo.oneup'"))) {
    await d.run(`INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at) VALUES ('admin@demo.oneup', ?, 'Admin ONE UP (demo)', 'platform_admin', 'active', ?, ?)`, [hash, nowIso(), nowIso()]);
  }
});

// ───────── Ambiente + professora ─────────
const { tenant, teacher } = await createTenant({ userId: null }, { slug: 'demo', name: 'Mentoria Demo', teacher_name: 'Professora Demo', teacher_email: 'professora@demo.oneup' });
await tx(SYSTEM, (d) => d.run(`UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?`, [hash, teacher.id]));
const tctx = { userId: teacher.id, role: 'teacher', tenantId: tenant.id, platform: false, tz: TZ, studentId: null };

// ───────── Edital ─────────
const STRUCT = {
  'Língua Portuguesa': ['Interpretação de textos', 'Crase', 'Regência', 'Concordância', 'Pontuação'],
  'Legislação do SUS': ['Lei 8.080/1990', 'Lei 8.142/1990', 'Decreto 7.508/2011', 'Controle social', 'PNAB'],
  'Farmacologia': ['Farmacocinética', 'Farmacodinâmica', 'Antibióticos', 'Anti-inflamatórios', 'Fármacos do SNC', 'Anti-hipertensivos'],
  'Assistência Farmacêutica': ['Ciclo da Assistência Farmacêutica', 'RENAME', 'Farmácia hospitalar', 'Farmacovigilância'],
  'Raciocínio Lógico': ['Proposições', 'Equivalências lógicas', 'Porcentagem'],
};
const edital = await tx(tctx, async (d) => {
  const ed = await E.createEdital(d, tctx, { name: 'SES-GO 2026 — Farmacêutico', role_title: 'Farmacêutico', board: 'Banca a definir', exam_date: addDays(T, 96) });
  const subjectIds = {};
  for (const [name, topics] of Object.entries(STRUCT)) subjectIds[name] = (await E.createSubject(d, tctx, ed.id, { name, topics })).id;
  await E.savePlan(d, tctx, ed.id, {
    notes: 'Priorize Farmacologia e SUS: juntas somam mais da metade da prova.',
    items: [
      { subject_id: subjectIds['Farmacologia'], relevance: 'alta' },
      { subject_id: subjectIds['Legislação do SUS'], relevance: 'alta' },
      { subject_id: subjectIds['Língua Portuguesa'], relevance: 'media' },
      { subject_id: subjectIds['Assistência Farmacêutica'], relevance: 'media' },
      { subject_id: subjectIds['Raciocínio Lógico'], relevance: 'baixa' },
    ],
  });
  return ed;
});

// ───────── Perfis de alunos ─────────
// start: dia de entrada (negativo = dias atrás); active(day): estuda nesse dia?; acc(day): acerto médio esperado.
const weekday = (day) => new Date(`${addDays(T, day)}T12:00:00Z`).getUTCDay();
const PROFILES = [
  { name: 'Ana Beatriz Souza', start: -60, active: (d) => weekday(d) !== 0 && rand() < 0.85, acc: (d) => 0.66 + (d + 60) * 0.0025, pace: 0.35 },
  { name: 'Bruno Carvalho', start: -58, active: (d) => d < -12 && rand() < 0.7, acc: () => 0.68, pace: 0.3 },
  { name: 'Carla Mendes', start: -10, active: () => false, acc: () => 0.7, pace: 0 },
  { name: 'Diego Ramos', start: -55, active: (d) => (d < -28 ? rand() < 0.85 : rand() < 0.15), acc: () => 0.7, pace: 0.35 },
  { name: 'Elisa Fernandes', start: -50, active: () => rand() < 0.75, acc: () => 0.65, pace: 0.08, noReviews: true },
  { name: 'Fábio Nunes', start: -57, active: (d) => rand() < 0.6, acc: () => 0.62, pace: 0.5, lazyReviews: true },
  { name: 'Gabriela Lima', start: -52, active: () => rand() < 0.7, acc: () => 0.58, pace: 0.25 },
  { name: 'Heitor Alves', start: -5, active: () => rand() < 0.9, acc: () => 0.7, pace: 0.4 },
  { name: 'Iara Cordeiro', start: -56, active: () => rand() < 0.75, acc: (d) => 0.8 - (d + 56) * 0.004, pace: 0.3 },
  { name: 'João Pedro Martins', start: -48, active: () => rand() < 0.7, acc: () => 0.72, pace: 0.35, focus: 'Farmacologia' },
];

const cpfFor = (n) => {
  const base = String(100000000 + n * 7919).slice(0, 9).split('').map(Number);
  const dv = (arr) => { const s = arr.reduce((a, x, i) => a + x * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base);
  return [...base, d1, dv([...base, d1])].join('');
};

for (const [i, p] of PROFILES.entries()) {
  const email = `aluno${i + 1}@demo.oneup`;
  const { studentId, userId } = await tx(tctx, async (d) => {
    const r = await createStudent(d, tctx, { name: p.name, email, edital_ids: [edital.id], goal: 'Farmacêutico(a) SES-GO' }, null);
    const st = await d.one('SELECT s.id, s.user_id FROM students s JOIN users u ON u.id = s.user_id WHERE lower(u.email) = ?', [email]);
    void r;
    return { studentId: st.id, userId: st.user_id };
  });
  const startTs = new Date(`${addDays(T, p.start)}T12:00:00-03:00`).toISOString();
  await tx(SYSTEM, async (d) => {
    await d.run(`UPDATE users SET password_hash = ?, status = 'active', created_at = ? WHERE id = ?`, [hash, startTs, userId]);
    await d.run(
      `UPDATE students SET cpf = ?, phone = '62999990000', postal_code = '74000000', address_line = 'Rua Demo', address_number = ?, district = 'Centro',
              city = 'Goiânia', state = 'GO', onboarding_done = true, terms_version = 'demo', terms_accepted_at = ?, created_at = ?,
              cohort = 'SES-GO 2026 (turma demo)', access_until = ? WHERE id = ?`,
      [cpfFor(i + 1), String(i + 1), startTs, startTs, addDays(T, 20 + i * 15), studentId]
    );
    await d.run('UPDATE enrollments SET created_at = ? WHERE student_id = ?', [startTs, studentId]);
    await d.run('UPDATE invites SET used_at = ? WHERE user_id = ?', [startTs, userId]);
  });
  const sctx = { userId, role: 'student', tenantId: tenant.id, platform: false, tz: TZ, studentId };

  await tx(sctx, async (d) => {
    await saveRoutine(d, sctx, studentId, [
      ...[1, 2, 3, 4, 5].flatMap((wd) => [
        { weekday: wd, start_min: 480, end_min: 1020, category: 'trabalho' },
        { weekday: wd, start_min: 1140, end_min: 1260, category: 'estudo' },
      ]),
      { weekday: 6, start_min: 480, end_min: 720, category: 'estudo' },
    ]);
    const enrollmentId = (await d.one('SELECT id FROM enrollments WHERE student_id = ?', [studentId])).id;
    const e = await assertEnrollment(d, sctx, enrollmentId);
    let topics = await d.all(
      `SELECT t.id, t.name, s.name AS subject_name FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.edital_id = ? ORDER BY s.priority NULLS LAST, s.position, t.position`,
      [edital.id]
    );
    if (p.focus) topics = [...topics.filter((t) => t.subject_name === p.focus), ...topics.filter((t) => t.subject_name !== p.focus)];
    const state = new Map(); // topicId → { status, startDay, reviews, locked, lastReview }
    const next = () => topics.find((t) => !state.has(t.id));
    const inStatus = (s) => topics.filter((t) => state.get(t.id)?.status === s);
    const safe = async (fn) => { try { return await fn(); } catch { return null; } };

    for (let day = p.start; day <= 0; day++) {
      if (!p.active(day)) continue;
      const date = addDays(T, day);
      const acts = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < acts; k++) {
        const r = rand();
        const assim = inStatus('assimilation');
        const prod = inStatus('production');
        const rev = inStatus('review').filter((t) => !state.get(t.id).locked && day - state.get(t.id).lastReview >= (p.lazyReviews ? 12 : 3));
        if (!p.noReviews && rev.length && r < 0.4) {
          const t = pick(rev); const s = state.get(t.id);
          const q = pick([20, 25, 30, 30, 40]);
          const acc = Math.max(0.2, Math.min(0.98, p.acc(day) + s.reviews * 0.04 + (rand() - 0.5) * 0.16));
          const out = await safe(() => A.registerReview(d, sctx, e, t.id, { questions: q, correct: Math.round(q * acc), date }));
          if (out) {
            s.reviews += 1; s.lastReview = day;
            if (out.outcome === 'consolidated') s.status = 'consolidated';
            if (out.outcome === 'limit_reached') s.locked = true;
            await safe(() => Study.addManualSession(d, sctx, e, { topicId: t.id, date, durationMinutes: pick([30, 40, 50]), activity: 'review' }));
          }
        } else if (!p.noReviews && prod.length && r < 0.6) {
          const t = pick(prod);
          if (await safe(() => A.changeStatus(d, sctx, e, t.id, 'review', { date }))) Object.assign(state.get(t.id), { status: 'review', lastReview: day - 3 });
        } else if (assim.length && (r < 0.85 || rand() > p.pace)) {
          const t = pick(assim); const s = state.get(t.id);
          await safe(() => Study.addManualSession(d, sctx, e, { topicId: t.id, date, durationMinutes: pick([40, 50, 60, 75, 90]), activity: 'assimilation' }));
          if (day - s.startDay >= 3 && rand() < 0.35 && !(p.noReviews && rand() < 0.8)) {
            await safe(() => A.registerProduction(d, sctx, e, t.id, { kind: pick(['resumo', 'mapa_mental', 'esquema', 'flashcards']), date }));
            if (await safe(() => A.changeStatus(d, sctx, e, t.id, 'production', { date }))) s.status = 'production';
          }
        } else if (p.pace > 0) {
          const t = next();
          if (t && (await safe(() => A.changeStatus(d, sctx, e, t.id, 'assimilation', { date })))) {
            state.set(t.id, { status: 'assimilation', startDay: day, reviews: 0, locked: false, lastReview: -999 });
            await safe(() => Study.addManualSession(d, sctx, e, { topicId: t.id, date, durationMinutes: pick([45, 60, 75]), activity: 'assimilation' }));
          }
        }
      }
      if (rand() < 0.12 && topics.length) {
        const t = pick(topics.filter((x) => state.has(x.id)) || []);
        if (t) await safe(() => Study.addPracticeQuestions(d, sctx, e, { topicId: t.id, date, questions: 20, correct: Math.round(20 * p.acc(day)), note: 'Treino' }));
      }
    }
  });
  console.log(`  ${email} — ${p.name}`);
}

// ───────── V3.0: aceite dos termos, acessos (vigências) e pacto de estudo ─────────
{
  const { weekStartOf } = await import('../src/domain/pacto.js');
  const kinds = ['turma', 'consultoria', 'plataforma'];
  const rows = await tx(SYSTEM, (d) => d.all("SELECT st.id, st.created_at, st.access_until, st.tenant_id, u.email FROM students st JOIN users u ON u.id = st.user_id WHERE u.email LIKE '%@demo.oneup' ORDER BY u.email"));
  for (const [i, st] of rows.entries()) {
    const startDate = String(st.created_at instanceof Date ? st.created_at.toISOString() : st.created_at).slice(0, 10);
    await tx(SYSTEM, async (d) => {
      await d.run("INSERT INTO terms_acceptances (tenant_id, student_id, version, accepted_at, ip) VALUES (?,?,'1.0',?,'127.0.0.1') ON CONFLICT DO NOTHING", [st.tenant_id, st.id, st.created_at]);
      await d.run("INSERT INTO terms_documents (tenant_id, version, title, body, created_at) SELECT ?, '1.0', 'Termos de Uso e Política de Privacidade', 'Texto de demonstração.', now() WHERE NOT EXISTS (SELECT 1 FROM terms_documents WHERE tenant_id = ?)", [st.tenant_id, st.tenant_id]);
      const kind = kinds[i % 3];
      const end = kind === 'consultoria' ? addDays(T, 18) : st.access_until;
      await d.run('INSERT INTO accesses (tenant_id, student_id, kind, label, starts_on, ends_on, meeting_on, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [st.tenant_id, st.id, kind, kind === 'turma' ? 'Turma SES-GO · semestral' : kind === 'consultoria' ? 'Consultoria' : 'Plano plataforma', startDate, end, kind === 'consultoria' ? addDays(T, -12) : null, nowIso(), nowIso()]);
      const first = weekStartOf(startDate);
      await d.run('INSERT INTO pactos (tenant_id, student_id, week_start, minutes, days, set_on, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [st.tenant_id, st.id, first, i % 2 ? 420 : 600, 31, first, nowIso(), nowIso()]);
    });
  }
}

// ───────── V3.0: turmas, consultoria (jornada, diagnóstico, plano, relatório, bônus) e questões livres ─────────
{
  const Cons = await import('../src/domain/consultoria.js');
  const Turmas = await import('../src/domain/turmas.js');
  await tx(tctx, async (d) => {
    await Turmas.saveCohort(d, tctx, { name: 'SES-GO 2026 (turma demo)', whatsapp_notices_url: 'https://chat.whatsapp.com/demoavisos', whatsapp_students_url: 'https://chat.whatsapp.com/demoalunos' });
  });
  const cons = await tx(SYSTEM, (d) => d.all("SELECT a.student_id, st.user_id, u.email FROM accesses a JOIN students st ON st.id = a.student_id JOIN users u ON u.id = st.user_id WHERE a.kind = 'consultoria' AND u.email LIKE '%@demo.oneup' ORDER BY u.email"));
  for (const [n, c] of cons.entries()) {
    const sctx = { userId: c.user_id, role: 'student', tenantId: tenant.id, platform: false, tz: TZ, studentId: c.student_id };
    // Questões livres (matéria e simulado) lançadas no mesmo dia, para a medição do bônus.
    await tx(sctx, async (d) => {
      const enr = await d.one('SELECT id FROM enrollments WHERE student_id = ?', [c.student_id]);
      const e = await assertEnrollment(d, sctx, enr.id);
      const subs = await d.all('SELECT id FROM subjects WHERE edital_id = ? ORDER BY position LIMIT 4', [e.edital_id]);
      for (let k = 0; k < 8; k++) {
        const date = addDays(T, -k);
        await Study.addFreeQuestions(d, sctx, e, { kind: 'subject', subjectId: subs[k % subs.length].id, date, questions: 20 + k * 3, correct: 12 + k, note: 'Questões da matéria' }).catch(() => {});
      }
      await Study.addFreeQuestions(d, sctx, e, { kind: 'simulado', name: 'Simulado SES-GO (demo)', date: addDays(T, -3), questions: 60, correct: 38 }).catch(() => {});
    });
    await tx(tctx, async (d) => {
      await Cons.saveJourney(d, tctx, c.student_id, { scheduled_on: addDays(T, -14), session_link: 'https://meet.google.com/demo-consultoria', done_on: addDays(T, -12) });
    });
    if (n === 0) continue; // o primeiro fica só com a sessão realizada (sem diagnóstico, para testar o aviso)
    await tx(sctx, async (d) => {
      await Cons.submitDiagnostic(d, sctx, c.student_id, { consent: true, answers: {
        goal: 'SES-GO — Farmacêutico', hours_week: '12', time_studying: 'De 6 meses a 1 ano', weak_subjects: 'Legislação do SUS, Farmacologia',
        how_study: 'Videoaulas e questões', main_difficulty: 'Constância', expectation: 'Organizar a rotina e subir o acerto em questões.' } }, { ip: '127.0.0.1', termsVersion: '1.0' });
    });
    await tx(tctx, async (d) => {
      await Cons.savePlan(d, tctx, c.student_id, { title: 'Plano de ação — 30 dias', publish: true, items: [
        { text: 'Resolver 40 questões de Legislação do SUS por semana' }, { text: 'Revisar Farmacocinética até sexta' },
        { text: 'Fechar o pacto semanal 3 semanas seguidas' }, { text: 'Fazer 1 simulado completo' }, { text: 'Montar resumo de Antibióticos' } ] });
    });
    const plan = await tx(sctx, (d) => Cons.getPlan(d, sctx, c.student_id));
    for (const it of plan.items.slice(0, n === 1 ? 4 : 2)) await tx(sctx, (d) => Cons.toggleItem(d, sctx, c.student_id, it.id, true));
    if (n === 1) {
      await tx(tctx, async (d) => {
        const r = await Cons.prepareReport(d, tctx, c.student_id, { body: 'Você manteve ritmo constante e subiu o acerto em Farmacologia. Foco agora: Legislação do SUS e simulados semanais.' });
        await Cons.approveReport(d, tctx, r.id);
      });
    }
  }
}

console.log('\nDemonstração criada.');
console.log('  Admin ONE UP: admin@demo.oneup / demo12345');
console.log('  Professora:   professora@demo.oneup / demo12345');
console.log('  Alunos:       aluno1@demo.oneup … aluno10@demo.oneup / demo12345');
await closeDb();
