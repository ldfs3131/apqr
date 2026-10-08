/** Rotas do próprio aluno: matrículas, cronômetro, rotina e exportação dos próprios dados (LGPD). */
import fs from 'node:fs';
import express, { Router } from 'express';
import { z } from 'zod';
import { tx } from '../db/index.js';
import { requireRole } from '../security/auth.js';
import { assertEnrollment } from '../security/access.js';
import { ah, badRequest, notFound, nowIso, parseId } from '../lib/util.js';
import { parse } from './auth.js';
import * as Study from '../domain/study.js';
import { getRoutine, saveRoutine } from '../domain/routine.js';
import { detectType, isImage, pathFor, safeName, saveBuffer } from '../lib/storage.js';
import { MAX_LOGO_BYTES } from './files.js';
import { audit } from '../security/access.js';
import { formatCpf } from '../lib/cpf.js';
import * as AG from '../domain/agenda.js';
import { changeCadastro, editableFields } from '../domain/cadastro.js';
import { myCohort } from '../domain/turmas.js';
import * as Cons from '../domain/consultoria.js';
import { studentNotices } from '../domain/avisos.js';
import { accessSummary } from '../domain/acessos.js';
import { pactoOverview, setPacto } from '../domain/pacto.js';
import { currentTerms, hasAccepted, recordAcceptance, termsPdf } from '../domain/termos.js';

async function accessSummaryWithBonus(d, ctx, studentId) {
  const out = await accessSummary(d, ctx, studentId);
  out.bonus = await Cons.issuedBonus(d, studentId, out.today);
  return out;
}

const r = Router();
r.use(requireRole('student'));

r.get('/enrollments', ah(async (req, res) => {
  const rows = await tx(req.ctx, (d) =>
    d.all(
      `SELECT e.id, e.edital_id, e.created_at, ed.name, ed.role_title, ed.board, ed.exam_date
         FROM enrollments e JOIN editais ed ON ed.id = e.edital_id
        WHERE e.student_id = ? AND e.status = 'active' AND ed.archived_at IS NULL ORDER BY e.created_at`,
      [req.ctx.studentId]
    )
  );
  res.json({ enrollments: rows });
}));

/** Apaga a linha da foto antiga e, se nenhum outro arquivo usa o mesmo conteúdo, o arquivo em disco (LGPD: eliminação). */
async function dropFile(d, fileId) {
  const f = await d.one('SELECT storage_key FROM files WHERE id = ? AND purpose = \'photo\'', [fileId]);
  if (!f) return;
  await d.run('DELETE FROM files WHERE id = ?', [fileId]);
  const still = await d.one('SELECT 1 FROM files WHERE storage_key = ? LIMIT 1', [f.storage_key]);
  if (!still) { try { await fs.promises.unlink(pathFor(f.storage_key)); } catch { /* já removido */ } }
}

// ───────────── Foto de perfil (uso interno: o aluno e a equipe veem; nunca é pública) ─────────────
r.post('/photo', express.raw({ type: () => true, limit: MAX_LOGO_BYTES }), ah(async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw badRequest('Arquivo vazio.');
  const name = safeName(req.query.name || 'foto');
  const type = detectType(buf, name);
  if (!type || !isImage(type.mime)) throw badRequest('A foto deve ser PNG, JPG ou WEBP de até 2 MB.');
  const saved = await saveBuffer(buf);
  const id = await tx(req.ctx, async (d) => {
    const row = await d.one(
      `INSERT INTO files (tenant_id, owner_user_id, purpose, original_name, mime, size_bytes, storage_key, sha256, created_at)
       VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
      [req.ctx.tenantId, req.ctx.userId, 'photo', name, type.mime, buf.length, saved.key, saved.sha256, nowIso()]
    );
    const old = await d.one('SELECT photo_file_id FROM students WHERE id = ?', [req.ctx.studentId]);
    await d.run('UPDATE students SET photo_file_id = ? WHERE id = ?', [row.id, req.ctx.studentId]);
    if (old?.photo_file_id) await dropFile(d, old.photo_file_id);
    await audit(d, req.ctx, 'student.photo_update', { targetType: 'student', targetId: req.ctx.studentId });
    return row.id;
  });
  res.status(201).json({ photo_file_id: id });
}));
r.delete('/photo', ah(async (req, res) => {
  await tx(req.ctx, async (d) => {
    const old = await d.one('SELECT photo_file_id FROM students WHERE id = ?', [req.ctx.studentId]);
    await d.run('UPDATE students SET photo_file_id = NULL WHERE id = ?', [req.ctx.studentId]);
    if (old?.photo_file_id) await dropFile(d, old.photo_file_id);
    await audit(d, req.ctx, 'student.photo_remove', { targetType: 'student', targetId: req.ctx.studentId });
  });
  res.json({ ok: true });
}));

// ───────────── Pacto de Estudo, Chama e Escudos ─────────────
r.get('/pacto', ah(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : undefined;
  res.json({ pacto: await tx(req.ctx, (d) => pactoOverview(d, req.ctx, req.ctx.studentId, { month })) });
}));
r.put('/pacto', ah(async (req, res) => {
  const body = parse(z.object({ week: z.enum(['current', 'next']).default('current'), minutes: z.number().int(), days: z.array(z.number().int().min(0).max(6)).min(1) }), req.body);
  const out = await tx(req.ctx, async (d) => { await setPacto(d, req.ctx, req.ctx.studentId, body); return pactoOverview(d, req.ctx, req.ctx.studentId); });
  res.json({ pacto: out });
}));

// ───────────── Meu acesso (vigência, resumo do que conquistou; aberto mesmo com o acesso vencido) ─────────────
r.get('/access', ah(async (req, res) => {
  res.json({ access: await tx(req.ctx, (d) => accessSummaryWithBonus(d, req.ctx, req.ctx.studentId)) });
}));

// ───────────── Termos de uso (aceite versionado; aberto mesmo com o acesso vencido) ─────────────
r.get('/terms', ah(async (req, res) => {
  const out = await tx(req.ctx, async (d) => {
    const t = await currentTerms(d, req.ctx.tenantId);
    return { terms: { version: t.version, title: t.title, body: t.body, drive_url: t.drive_url, published_at: t.created_at }, accepted: await hasAccepted(d, req.ctx.studentId, t.version) };
  });
  res.json(out);
}));
r.post('/terms/accept', ah(async (req, res) => {
  const { version } = parse(z.object({ version: z.string() }), req.body);
  await tx(req.ctx, async (d) => {
    const t = await currentTerms(d, req.ctx.tenantId);
    if (t.version !== version) throw badRequest('Os termos foram atualizados. Leia a versão mais recente.', 'terms_outdated');
    await recordAcceptance(d, { tenantId: req.ctx.tenantId, studentId: req.ctx.studentId, ip: req.ip });
  });
  res.json({ ok: true });
}));
r.get('/terms/pdf', ah(async (req, res) => {
  const { t, name } = await tx(req.ctx, async (d) => ({ t: await currentTerms(d, req.ctx.tenantId), name: (await d.one('SELECT name FROM tenants WHERE id = ?', [req.ctx.tenantId]))?.name }));
  const buf = await termsPdf(t, name);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="termos-v${t.version}.pdf"`);
  res.end(buf);
}));

// ───────────── Meu cadastro (prévia "antes → depois" + confirmação; auditado) ─────────────
const cadastroBody = z.object({ fields: z.record(z.string(), z.any()), dry_run: z.boolean().optional() });
r.get('/cadastro', ah(async (req, res) => {
  const row = await tx(req.ctx, (d) => d.one(
    `SELECT u.name, u.email, st.cpf, st.phone, st.birth_date, st.postal_code, st.address_line, st.address_number, st.address_complement, st.district, st.city, st.state, st.goal
       FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?`, [req.ctx.studentId]));
  res.json({ cadastro: { ...row, cpf: formatCpf(row.cpf), birth_date: row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : row.birth_date }, editable: editableFields(req.ctx, true) });
}));
r.patch('/cadastro', ah(async (req, res) => {
  const body = parse(cadastroBody, req.body);
  const out = await tx(req.ctx, (d) => changeCadastro(d, req.ctx, req.ctx.studentId, body.fields, { dryRun: !!body.dry_run, self: true }));
  res.json(out);
}));

// ───────────── Estudar com IA (conteúdos publicados pela professora) ─────────────
r.get('/contents', ah(async (req, res) => {
  const items = await tx(req.ctx, (d) =>
    d.all(
      `SELECT c.id, c.kind, c.category, c.title, c.summary, c.body, c.url, c.file_id, c.updated_at, (p.content_id IS NOT NULL) AS done, f.mime AS file_mime
         FROM content_items c LEFT JOIN content_progress p ON p.content_id = c.id AND p.student_id = ? LEFT JOIN files f ON f.id = c.file_id
        WHERE c.published AND c.archived_at IS NULL AND (c.cohort IS NULL OR c.cohort = (SELECT cohort FROM students WHERE id = ?)) ORDER BY c.position, c.created_at`, [req.ctx.studentId, req.ctx.studentId]
    )
  );
  res.json({ items });
}));

/** Marca/desmarca "já vi" (só para o próprio aluno e só em material publicado). */
r.post('/contents/:id/done', ah(async (req, res) => {
  const id = parseId(req.params.id, 'material');
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  await tx(req.ctx, async (d) => {
    if (!(await d.one('SELECT 1 AS x FROM content_items WHERE id = ? AND published AND archived_at IS NULL AND (cohort IS NULL OR cohort = (SELECT cohort FROM students WHERE id = ?))', [id, req.ctx.studentId]))) throw notFound('Material não encontrado.');
    if (done) await d.run('INSERT INTO content_progress (tenant_id, student_id, content_id, done_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING', [req.ctx.tenantId, req.ctx.studentId, id, nowIso()]);
    else await d.run('DELETE FROM content_progress WHERE student_id = ? AND content_id = ?', [req.ctx.studentId, id]);
  });
  res.json({ ok: true, done });
}));

r.get('/notices', ah(async (req, res) => res.json({ notices: await tx(req.ctx, (d) => studentNotices(d, req.ctx, req.ctx.studentId)) })));

/** Turma do aluno e links dos 2 grupos de WhatsApp (avisos e alunos). */
r.get('/cohort', ah(async (req, res) => res.json({ cohort: await tx(req.ctx, (d) => myCohort(d, req.ctx.studentId)) })));

// ───────────── Consultoria (jornada, diagnóstico, plano, bônus) ─────────────
r.get('/config', ah(async (req, res) => res.json({ config: Cons.publicConfig(await tx(req.ctx, (d) => Cons.getConfig(d, req.ctx.tenantId))) })));
r.get('/consultoria', ah(async (req, res) => res.json({ consultoria: await tx(req.ctx, (d) => Cons.consultoriaForStudent(d, req.ctx, req.ctx.studentId)) })));
r.post('/consultoria/diagnostic', ah(async (req, res) => {
  const body = parse(z.object({ answers: z.record(z.string(), z.any()), consent: z.boolean() }), req.body);
  const out = await tx(req.ctx, async (d) => {
    const cur = await currentTerms(d, req.ctx.tenantId);
    await Cons.submitDiagnostic(d, req.ctx, req.ctx.studentId, body, { ip: req.ip, termsVersion: cur.version });
    return Cons.consultoriaForStudent(d, req.ctx, req.ctx.studentId);
  });
  res.status(201).json({ consultoria: out });
}));
r.post('/consultoria/items/:id', ah(async (req, res) => {
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  res.json({ plan: await tx(req.ctx, (d) => Cons.toggleItem(d, req.ctx, req.ctx.studentId, parseId(req.params.id, 'ação'), done)) });
}));

// ───────────── Cronômetro ─────────────
r.get('/timer', ah(async (req, res) => res.json({ timer: await tx(req.ctx, (d) => Study.getTimer(d, req.ctx.studentId)) })));

r.post('/timer/start', ah(async (req, res) => {
  const body = parse(z.object({ enrollment_id: z.string().uuid(), topic_id: z.string().uuid(), activity: z.enum(Study.ACTIVITIES).optional() }), req.body);
  res.status(201).json(await tx(req.ctx, async (d) => {
    const e = await assertEnrollment(d, req.ctx, body.enrollment_id);
    return Study.startTimer(d, e, body.topic_id, body.activity);
  }));
}));
r.post('/timer/pause', ah(async (req, res) => res.json({ timer: await tx(req.ctx, (d) => Study.pauseTimer(d, req.ctx.studentId)) })));
r.post('/timer/resume', ah(async (req, res) => res.json({ timer: await tx(req.ctx, (d) => Study.resumeTimer(d, req.ctx.studentId)) })));
r.post('/timer/discard', ah(async (req, res) => {
  await tx(req.ctx, (d) => Study.discardTimer(d, req.ctx.studentId));
  res.json({ ok: true });
}));
r.post('/timer/finish', ah(async (req, res) => {
  const body = parse(z.object({ adjusted_seconds: z.number().int().optional().nullable(), note: z.string().max(500).optional().nullable(), activity: z.enum(Study.ACTIVITIES).optional() }), req.body);
  res.json(await tx(req.ctx, (d) => Study.finishTimer(d, req.ctx, req.ctx.studentId, { adjustedSeconds: body.adjusted_seconds ?? undefined, note: body.note, activity: body.activity, tz: req.ctx.tz })));
}));

// ───────────── Rotina ─────────────
r.get('/routine', ah(async (req, res) => res.json({ routine: await tx(req.ctx, (d) => getRoutine(d, req.ctx.studentId)) })));
r.put('/routine', ah(async (req, res) => {
  const body = parse(z.object({ blocks: z.array(z.object({ weekday: z.number(), start_min: z.number(), end_min: z.number(), category: z.string(), label: z.string().nullable().optional() })) }), req.body);
  res.json({ routine: await tx(req.ctx, (d) => saveRoutine(d, req.ctx, req.ctx.studentId, body.blocks)) });
}));

// ───────────── Meus dados (LGPD: acesso/portabilidade) ─────────────
r.get('/export', ah(async (req, res) => {
  const sid = req.ctx.studentId;
  const data = await tx(req.ctx, async (d) => {
    const me = await d.one(
      `SELECT u.name, u.email, u.created_at, st.cpf, st.phone, st.postal_code, st.address_line, st.address_number, st.address_complement,
              st.district, st.city, st.state, st.goal, st.terms_version, st.terms_accepted_at
         FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = ?`, [sid]);
    const q = (sql) => d.all(sql, [sid]);
    return {
      exported_at: nowIso(),
      profile: { ...me, cpf: formatCpf(me.cpf) },
      enrollments: await q('SELECT e.id, ed.name AS edital, e.created_at, e.status FROM enrollments e JOIN editais ed ON ed.id = e.edital_id WHERE e.student_id = ?'),
      topic_progress: await q('SELECT t.name AS conteudo, p.status, p.started_at, p.material_done_at, p.review_started_at, p.consolidated_at, p.current_cycle FROM topic_progress p JOIN topics t ON t.id = p.topic_id WHERE p.student_id = ?'),
      study_sessions: await q('SELECT date, duration_seconds, activity, source, note, voided_at FROM study_sessions WHERE student_id = ? ORDER BY date'),
      reviews: await q('SELECT date, cycle, number, questions, correct, consolidated, threshold_used, min_questions_used, config_version, voided_at FROM reviews WHERE student_id = ? ORDER BY date'),
      questions: await q('SELECT date, source, questions, correct, voided_at FROM question_logs WHERE student_id = ? ORDER BY date'),
      productions: await q('SELECT date, kind, is_update, note, voided_at FROM production_logs WHERE student_id = ? ORDER BY date'),
      routine: await q('SELECT weekday, start_min, end_min, category, label FROM routine_blocks WHERE student_id = ?'),
      // v3: consultoria, diagnóstico (com consentimento), plano, relatórios aprovados, bônus, Ajustes de Rota, acessos, termos e foto.
      photo: await d.one('SELECT f.original_name, f.mime, f.size_bytes, f.created_at FROM students st JOIN files f ON f.id = st.photo_file_id WHERE st.id = ?', [sid]),
      accesses: await q('SELECT kind, label, starts_on, ends_on, status, meeting_on FROM accesses WHERE student_id = ? ORDER BY starts_on'),
      pactos: await q('SELECT week_start, minutes, days, set_on FROM pactos WHERE student_id = ? ORDER BY week_start'),
      terms_acceptances: await q('SELECT version, accepted_at, ip FROM terms_acceptances WHERE student_id = ? ORDER BY accepted_at'),
      consultoria: {
        journeys: await q('SELECT paid_on, scheduled_on, done_on, continued, created_at FROM consult_journeys WHERE student_id = ? ORDER BY created_at'),
        diagnostics: await q('SELECT answers, consent, consent_at, terms_version, ip, created_at FROM diagnostics WHERE student_id = ? ORDER BY created_at'),
        action_plans: await q('SELECT p.title, p.published_at, (SELECT json_agg(json_build_object(\'text\', i.text, \'due_on\', i.due_on, \'done_at\', i.done_at) ORDER BY i.position) FROM action_items i WHERE i.plan_id = p.id) AS items FROM action_plans p WHERE p.student_id = ? AND p.published_at IS NOT NULL'),
        reports: await q("SELECT period_from, period_to, body, approved_at FROM consult_reports WHERE student_id = ? AND status = 'approved' ORDER BY approved_at"),
        bonuses: await q('SELECT medal, discount_cents, issued_on, valid_until, applied_at FROM bonuses WHERE student_id = ? ORDER BY issued_on'),
      },
      route_adjustments: await q('SELECT period_from, period_to, facts, suggestions, accepted_at FROM route_adjustments WHERE student_id = ? ORDER BY period_from'),
    };
  });
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados.json"');
  res.json(data);
}));

// ───────────── Agenda da professora ─────────────
r.get('/agenda', ah(async (req, res) => {
  const q = parse(z.object({ from: z.string().optional(), to: z.string().optional() }), req.query);
  res.json({ events: await tx(req.ctx, (d) => AG.listForStudent(d, req.ctx.studentId, q)), kinds: AG.KINDS });
}));
r.get('/agenda.ics', ah(async (req, res) => {
  const t = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const events = await tx(req.ctx, (d) => AG.listForStudent(d, req.ctx.studentId, { from: t }));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="agenda.ics"');
  res.send(AG.toIcs(events));
}));

export default r;
