/**
 * Importação V1 (SQLite) → V2 (PostgreSQL), com validação por "impressão digital".
 *
 * Uso:
 *   node scripts/import-v1.js --sqlite caminho/apqr.db --tenant pollyana-lyra [--dry-run]
 *
 * - O ambiente (--tenant) precisa existir (criado pelo console ONE UP) e estar vazio de alunos.
 * - Tudo roda numa ÚNICA transação: se a impressão digital de qualquer aluno não bater,
 *   nada é gravado (rollback). --dry-run executa e valida, mas sempre desfaz.
 * - Nada é descartado sem registro: o relatório final lista o que não teve destino direto.
 * - Senhas: os hashes bcrypt da V1 são compatíveis e são mantidos (o aluno entra com a mesma senha).
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { openDb, tx, SYSTEM, closeDb } from '../src/db/index.js';
import { nowIso, pct } from '../src/lib/util.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.sqlite || !args.tenant) {
  console.error('Uso: node scripts/import-v1.js --sqlite caminho/apqr.db --tenant <slug> [--dry-run]');
  process.exit(1);
}
if (!fs.existsSync(args.sqlite)) {
  console.error(`Arquivo não encontrado: ${args.sqlite}`);
  process.exit(1);
}

class DryRun extends Error {}
const v1 = new DatabaseSync(args.sqlite, { readOnly: true });
const all = (sql, ...p) => v1.prepare(sql).all(...p);
const one = (sql, ...p) => v1.prepare(sql).get(...p);

/** Impressão digital da V1 por matrícula (aluno × edital-cópia). */
function fingerprintV1(examId) {
  const counts = Object.fromEntries(['not_started', 'assimilation', 'production', 'review', 'consolidated'].map((s) => [s, 0]));
  for (const r of all('SELECT t.status FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.exam_id = ? AND t.archived_at IS NULL AND s.archived_at IS NULL', examId)) counts[r.status]++;
  const h = one('SELECT COALESCE(SUM(duration_seconds),0) secs, COUNT(*) n FROM study_sessions WHERE exam_id = ?', examId);
  const q = one('SELECT COALESCE(SUM(questions),0) q, COALESCE(SUM(correct),0) c FROM question_attempts WHERE exam_id = ?', examId);
  const rv = one('SELECT COUNT(*) n, COALESCE(SUM(consolidated),0) cons, COALESCE(SUM(questions),0) q FROM reviews WHERE exam_id = ?', examId);
  return { counts, study_seconds: h.secs, sessions: h.n, questions: q.q, correct: q.c, reviews: rv.n, consolidating_reviews: rv.cons, review_questions: rv.q };
}

async function fingerprintV2(d, enrollmentId, editalId, includeArchivedImported) {
  const counts = Object.fromEntries(['not_started', 'assimilation', 'production', 'review', 'consolidated'].map((s) => [s, 0]));
  const rows = await d.all(
    `SELECT COALESCE(p.status, 'not_started') AS status FROM topics t JOIN subjects s ON s.id = t.subject_id
       LEFT JOIN topic_progress p ON p.topic_id = t.id AND p.enrollment_id = ?
      WHERE t.edital_id = ? AND s.archived_at IS NULL AND (t.archived_at IS NULL OR t.id = ANY(?::uuid[]))`,
    [enrollmentId, editalId, includeArchivedImported]
  );
  for (const r of rows) counts[r.status]++;
  const h = await d.one('SELECT COALESCE(sum(duration_seconds),0) AS secs, count(*) AS n FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL', [enrollmentId]);
  const q = await d.one('SELECT COALESCE(sum(questions),0) AS q, COALESCE(sum(correct),0) AS c FROM question_logs WHERE enrollment_id = ? AND voided_at IS NULL', [enrollmentId]);
  const rv = await d.one('SELECT count(*) AS n, COALESCE(sum(CASE WHEN consolidated THEN 1 ELSE 0 END),0) AS cons, COALESCE(sum(questions),0) AS q FROM reviews WHERE enrollment_id = ? AND voided_at IS NULL', [enrollmentId]);
  return { counts, study_seconds: h.secs, sessions: h.n, questions: q.q, correct: q.c, reviews: rv.n, consolidating_reviews: rv.cons, review_questions: rv.q };
}

const v1Settings = Object.fromEntries(all('SELECT key, value FROM app_settings').map((r) => [r.key, JSON.parse(r.value)]));
const v1MinQuestions = Number.isInteger(v1Settings.min_questions_per_review) ? v1Settings.min_questions_per_review : 20;

await openDb();
const report = { imported: {}, notes: [], fingerprints: [] };
const bump = (k, n = 1) => { report.imported[k] = (report.imported[k] || 0) + n; };

try {
  await tx(SYSTEM, async (d) => {
    const tenant = await d.one('SELECT * FROM tenants WHERE slug = ?', [args.tenant]);
    if (!tenant) throw new Error(`Ambiente "${args.tenant}" não existe. Crie-o no console ONE UP antes de importar.`);
    if ((await d.one('SELECT count(*) AS c FROM students WHERE tenant_id = ?', [tenant.id])).c > 0) throw new Error('O ambiente já tem alunos. A importação só é feita em ambiente sem alunos (evita duplicidade).');
    const T = tenant.id;
    const ts = nowIso();
    const cfg = await d.one('SELECT version FROM methodology_configs WHERE tenant_id = ? ORDER BY version LIMIT 1', [T]);
    const cfgVersion = cfg?.version || 1;
    const teacher = await d.one("SELECT id FROM users WHERE tenant_id = ? AND role = 'teacher' ORDER BY created_at LIMIT 1", [T]);

    // ── Usuários ──
    const userMap = new Map(); // v1 user id → v2 user id
    const studentMap = new Map(); // v1 student id → v2 student id
    for (const a of all('SELECT a.*, u.email, u.name, u.password_hash, u.active, u.created_at uc FROM admins a JOIN users u ON u.id = a.user_id')) {
      if (a.level === 'owner') {
        if (teacher) userMap.set(a.user_id, teacher.id);
        report.notes.push(`Administrador principal da V1 (${a.email}) mapeado para a professora do ambiente (não duplicado).`);
        continue;
      }
      const exists = await d.one('SELECT id FROM users WHERE lower(email) = lower(?)', [a.email]);
      if (exists) { userMap.set(a.user_id, exists.id); report.notes.push(`Mentor ${a.email} já existia; vinculado.`); continue; }
      const u = await d.one(`INSERT INTO users (tenant_id, email, password_hash, name, role, status, created_at, updated_at) VALUES (?,?,?,?,'mentor',?,?,?) RETURNING id`,
        [T, a.email, a.password_hash, a.name, a.active ? 'active' : 'disabled', a.uc, ts]);
      userMap.set(a.user_id, u.id);
      bump('monitores');
    }
    for (const s of all('SELECT s.*, u.email, u.name, u.password_hash, u.active, u.timezone, u.created_at uc, u.last_login_at FROM students s JOIN users u ON u.id = s.user_id')) {
      if (await d.one('SELECT 1 FROM users WHERE lower(email) = lower(?)', [s.email])) throw new Error(`E-mail já existe na V2: ${s.email}`);
      const u = await d.one(`INSERT INTO users (tenant_id, email, password_hash, name, role, status, timezone, created_at, updated_at, last_login_at) VALUES (?,?,?,?,'student',?,?,?,?,?) RETURNING id`,
        [T, s.email, s.password_hash, s.name, s.active ? 'active' : 'disabled', s.timezone || 'America/Sao_Paulo', s.uc, ts, s.last_login_at]);
      const st = await d.one('INSERT INTO students (tenant_id, user_id, phone, goal, onboarding_done, created_at, updated_at) VALUES (?,?,?,?,?,?,?) RETURNING id',
        [T, u.id, s.phone ? String(s.phone).replace(/\D/g, '') : null, s.goal, !!s.onboarding_done, s.created_at, ts]);
      userMap.set(s.user_id, u.id);
      studentMap.set(s.id, st.id);
      bump('alunos');
    }
    report.notes.push('Alunos importados da V1 não têm CPF/endereço: o sistema pede para completarem o cadastro no próximo acesso.');
    for (const ms of all('SELECT ms.*, a.user_id FROM mentor_students ms JOIN admins a ON a.id = ms.admin_id WHERE a.level = \'mentor\'')) {
      await d.run('INSERT INTO staff_assignments (tenant_id, staff_id, student_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [T, userMap.get(ms.user_id), studentMap.get(ms.student_id)]);
    }

    // ── Editais (modelos → editais únicos) ──
    const editalMap = new Map(); // v1 exam id (template) → v2 edital id
    const subjectMap = new Map();
    const topicMap = new Map(); // v1 topic id (template) → v2 topic id
    const createEdital = async (ex, nameSuffix = '') => {
      const e = await d.one(`INSERT INTO editais (tenant_id, name, role_title, board, exam_date, description, archived_at, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
        [T, ex.name + nameSuffix, ex.role_title, ex.board, ex.exam_date, ex.description, ex.archived_at, teacher?.id || null, ex.created_at, ts]);
      const plan = one('SELECT * FROM global_plans WHERE exam_id = ?', ex.id);
      if (plan?.notes) await d.run('UPDATE editais SET plan_notes = ? WHERE id = ?', [plan.notes, e.id]);
      for (const s of all('SELECT * FROM subjects WHERE exam_id = ? ORDER BY position, id', ex.id)) {
        const gpi = plan ? one('SELECT * FROM global_plan_items WHERE plan_id = ? AND subject_id = ?', plan.id, s.id) : null;
        const ns = await d.one('INSERT INTO subjects (tenant_id, edital_id, name, position, priority, relevance, plan_note, archived_at, created_at) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id',
          [T, e.id, s.name, s.position, gpi?.priority ?? null, gpi?.relevance || 'media', gpi?.note ?? null, s.archived_at, s.created_at]);
        subjectMap.set(s.id, ns.id);
        for (const t of all('SELECT * FROM topics WHERE subject_id = ? ORDER BY position, id', s.id)) {
          const nt = await d.one('INSERT INTO topics (tenant_id, edital_id, subject_id, name, position, archived_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
            [T, e.id, ns.id, t.name, t.position, t.archived_at, t.created_at, ts]);
          topicMap.set(t.id, nt.id);
          bump('conteudos');
        }
      }
      bump('editais');
      return e.id;
    };
    for (const ex of all('SELECT * FROM exams WHERE is_template = 1 ORDER BY id')) editalMap.set(ex.id, await createEdital(ex));

    // ── Matrículas + progresso + atividade ──
    for (const ex of all('SELECT * FROM exams WHERE is_template = 0 ORDER BY id')) {
      const studentId = studentMap.get(ex.owner_student_id);
      let editalId = ex.template_id ? editalMap.get(ex.template_id) : null;
      const archivedImported = [];
      if (!editalId) {
        // edital próprio do aluno (V1) → edital da professora, identificado
        const owner = one('SELECT u.name FROM students s JOIN users u ON u.id = s.user_id WHERE s.id = ?', ex.owner_student_id);
        editalId = await createEdital(ex, ` (edital próprio de ${owner?.name || 'aluno'} na V1)`);
        report.notes.push(`Edital próprio "${ex.name}" do aluno ${owner?.name} virou edital da professora (revise e arquive se não for usar).`);
      }
      const enr = await d.one('INSERT INTO enrollments (tenant_id, student_id, edital_id, status, created_at, archived_at) VALUES (?,?,?,?,?,?) RETURNING *',
        [T, studentId, editalId, ex.archived_at ? 'archived' : 'active', ex.created_at, ex.archived_at]);
      bump('matriculas');
      const enrTopic = new Map(); // v1 topic (cópia) → v2 topic
      for (const t of all('SELECT t.*, s.name subject_name, s.source_subject_id, s.id sid FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.exam_id = ?', ex.id)) {
        let v2t = ex.template_id ? (t.source_topic_id ? topicMap.get(t.source_topic_id) : null) : topicMap.get(t.id);
        if (!v2t) {
          // conteúdo criado pelo aluno num edital da mentoria → entra ARQUIVADO no edital (progresso preservado)
          const subj = subjectMap.get(t.source_subject_id) || (await d.one('SELECT id FROM subjects WHERE edital_id = ? ORDER BY position LIMIT 1', [editalId]))?.id;
          const nt = await d.one('INSERT INTO topics (tenant_id, edital_id, subject_id, name, position, archived_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
            [T, editalId, subj, `${t.name} (criado pelo aluno na V1)`, 999, ts, t.created_at, ts]);
          v2t = nt.id;
          archivedImported.push(v2t);
          report.notes.push(`Conteúdo "${t.name}" criado pelo aluno na V1 entrou ARQUIVADO no edital (progresso preservado; desarquive se quiser).`);
        }
        enrTopic.set(t.id, v2t);
        if (t.status !== 'not_started' || t.material_updates || t.current_cycle > 1) {
          await d.run(`INSERT INTO topic_progress (tenant_id, enrollment_id, student_id, topic_id, status, started_at, material_done_at, review_started_at, consolidated_at, current_cycle, cycle_locked_at, material_updates, created_at, updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [T, enr.id, studentId, v2t, t.status, t.started_at, t.material_done_at, t.review_started_at, t.consolidated_at, t.current_cycle, t.cycle_locked_at, t.material_updates, t.created_at, t.updated_at]);
          bump('progresso');
        }
      }
      const progressId = async (topicId) => (await d.one('SELECT id FROM topic_progress WHERE enrollment_id = ? AND topic_id = ?', [enr.id, topicId]))?.id;
      const reviewMap = new Map();
      for (const r of all('SELECT * FROM reviews WHERE exam_id = ? ORDER BY topic_id, cycle, number', ex.id)) {
        const topicId = enrTopic.get(r.topic_id);
        let pid = await progressId(topicId);
        if (!pid) {
          pid = (await d.one(`INSERT INTO topic_progress (tenant_id, enrollment_id, student_id, topic_id, status, created_at, updated_at) VALUES (?,?,?,?,'review',?,?) RETURNING id`, [T, enr.id, studentId, topicId, ts, ts])).id;
          report.notes.push('Revisão sem progresso correspondente: progresso criado em Q+R.');
        }
        const nr = await d.one(`INSERT INTO reviews (tenant_id, student_id, enrollment_id, topic_id, progress_id, cycle, number, date, questions, correct, threshold_used, min_questions_used, config_version, consolidated, created_by, created_at)
                                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
          [T, studentId, enr.id, topicId, pid, r.cycle, r.number, r.date, r.questions, r.correct, Math.round(r.threshold_used), v1MinQuestions, cfgVersion, !!r.consolidated, userMap.get(r.created_by) || null, r.created_at]);
        reviewMap.set(r.id, nr.id);
        bump('revisoes');
      }
      for (const qa of all('SELECT * FROM question_attempts WHERE exam_id = ?', ex.id)) {
        await d.run(`INSERT INTO question_logs (tenant_id, student_id, enrollment_id, topic_id, review_id, source, date, questions, correct, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [T, studentId, enr.id, enrTopic.get(qa.topic_id), qa.review_id ? reviewMap.get(qa.review_id) : null, qa.source, qa.date, qa.questions, qa.correct, qa.note, qa.created_at]);
        bump('registros_de_questoes');
      }
      for (const ss of all('SELECT * FROM study_sessions WHERE exam_id = ?', ex.id)) {
        await d.run(`INSERT INTO study_sessions (tenant_id, student_id, enrollment_id, topic_id, activity, date, started_at, ended_at, duration_seconds, source, note, created_at) VALUES (?,?,?,?,'study',?,?,?,?,?,?,?)`,
          [T, studentId, enr.id, enrTopic.get(ss.topic_id), ss.date, ss.started_at, ss.ended_at, ss.duration_seconds, ss.source, ss.note, ss.created_at]);
        bump('sessoes');
      }
      for (const h of all('SELECT * FROM status_history WHERE exam_id = ? ORDER BY id', ex.id)) {
        await d.run(`INSERT INTO learning_events (tenant_id, student_id, enrollment_id, topic_id, type, from_status, to_status, date, payload, actor_user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [T, studentId, enr.id, enrTopic.get(h.topic_id) || null, h.event_type, h.from_status, h.to_status, h.date, h.payload ? JSON.stringify({ ...JSON.parse(h.payload), imported_from: 'v1' }) : JSON.stringify({ imported_from: 'v1' }), userMap.get(h.actor_user_id) || null, h.created_at]);
        bump('eventos');
      }
      const timers = one('SELECT COUNT(*) c FROM active_timers WHERE exam_id = ?', ex.id).c;
      if (timers) report.notes.push(`${timers} cronômetro(s) em andamento na V1 não foram migrados (peça para finalizarem antes da migração).`);

      // ── Validação: impressão digital idêntica ──
      const a = fingerprintV1(ex.id);
      const b = await fingerprintV2(d, enr.id, editalId, archivedImported);
      const ok = JSON.stringify(a) === JSON.stringify(b);
      report.fingerprints.push({ exam: ex.name, v1: a, v2: b, ok });
      if (!ok) throw new Error(`Impressão digital NÃO confere para "${ex.name}". Nada foi gravado.\nV1: ${JSON.stringify(a)}\nV2: ${JSON.stringify(b)}`);
    }
    for (const b of all('SELECT rb.*, r.student_id FROM routine_blocks rb JOIN routines r ON r.id = rb.routine_id')) {
      await d.run('INSERT INTO routine_blocks (tenant_id, student_id, weekday, start_min, end_min, category, label) VALUES (?,?,?,?,?,?,?)', [T, studentMap.get(b.student_id), b.weekday, b.start_min, b.end_min, b.category, b.label]);
      bump('blocos_de_rotina');
    }
    report.notes.push(`Revisões da V1 não guardavam o mínimo de questões usado: registrado o valor configurado na V1 (${v1MinQuestions}); o percentual de consolidação de cada revisão foi preservado.`);
    await d.run('INSERT INTO audit_log (tenant_id, action, target_type, target_id, payload, created_at) VALUES (?,?,?,?,?,?)', [T, 'import.v1', 'tenant', T, JSON.stringify({ imported: report.imported, dry_run: !!args['dry-run'] }), ts]);
    if (args['dry-run']) throw new DryRun();
  });
  console.log(JSON.stringify({ status: 'ok', ...report }, null, 2));
} catch (e) {
  if (e instanceof DryRun) console.log(JSON.stringify({ status: 'dry-run (nada gravado)', ...report }, null, 2));
  else { console.error(`ERRO: ${e.message}`); process.exitCode = 1; }
} finally {
  await closeDb();
  v1.close();
}
