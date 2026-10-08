/**
 * Agenda da professora. Datas e horas são informadas em horário de Brasília (sem horário de verão) e guardadas em UTC.
 * Visibilidade para o aluno: todos | a turma dele | alunos matriculados no edital | só ele.
 */
import { audit } from '../security/access.js';
import { badRequest, isValidDate, notFound, nowIso, localDate, DEFAULT_TZ } from '../lib/util.js';

export const KINDS = { aula: 'Aula ao vivo', reuniao: 'Reunião', plantao: 'Plantão de dúvidas', prova: 'Prova / edital', lembrete: 'Lembrete', outro: 'Outro' };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const toUtc = (date, time) => new Date(`${date}T${time}:00-03:00`).toISOString();

function clean(p) {
  const title = String(p.title || '').trim();
  if (title.length < 3) throw badRequest('Informe o título do compromisso.');
  if (!KINDS[p.kind]) throw badRequest('Tipo inválido.');
  if (!isValidDate(p.date)) throw badRequest('Data inválida.');
  const allDay = !!p.all_day;
  if (!allDay && !TIME_RE.test(p.start_time || '')) throw badRequest('Informe o horário de início (hh:mm).');
  if (p.end_time && !TIME_RE.test(p.end_time)) throw badRequest('Horário de término inválido.');
  const starts = toUtc(p.date, allDay ? '00:00' : p.start_time);
  let ends = null;
  if (!allDay && p.end_time) {
    ends = toUtc(p.end_date && isValidDate(p.end_date) ? p.end_date : p.date, p.end_time);
    if (ends < starts) throw badRequest('O término é antes do início.');
  }
  let link = String(p.link || '').trim();
  if (link) {
    try { const u = new URL(link); if (!['http:', 'https:'].includes(u.protocol)) throw new Error(); link = u.toString(); } catch { throw badRequest('O link precisa começar com https://'); }
  } else link = null;
  const audience = p.audience || 'all';
  if (!['all', 'cohort', 'edital', 'student'].includes(audience)) throw badRequest('Público inválido.');
  const out = { kind: p.kind, title: title.slice(0, 160), description: String(p.description || '').trim().slice(0, 2000) || null, starts_at: starts, ends_at: ends, all_day: allDay, link, audience, cohort: null, edital_id: null, student_id: null };
  if (audience === 'cohort') { out.cohort = String(p.cohort || '').trim().slice(0, 120); if (!out.cohort) throw badRequest('Escolha a turma.'); }
  if (audience === 'edital') { if (!p.edital_id) throw badRequest('Escolha o edital.'); out.edital_id = p.edital_id; }
  if (audience === 'student') { if (!p.student_id) throw badRequest('Escolha o aluno.'); out.student_id = p.student_id; }
  return out;
}

async function assertTargets(d, e) {
  if (e.edital_id && !(await d.one('SELECT 1 AS x FROM editais WHERE id = ?', [e.edital_id]))) throw notFound('Edital não encontrado.');
  if (e.student_id && !(await d.one('SELECT 1 AS x FROM students WHERE id = ?', [e.student_id]))) throw notFound('Aluno não encontrado.');
}

export async function saveEvent(d, ctx, id, input) {
  const e = clean(input);
  await assertTargets(d, e);
  const ts = nowIso();
  if (id) {
    const n = await d.run(
      `UPDATE agenda_events SET kind=?, title=?, description=?, starts_at=?, ends_at=?, all_day=?, link=?, audience=?, cohort=?, edital_id=?, student_id=?, updated_at=? WHERE id=?`,
      [e.kind, e.title, e.description, e.starts_at, e.ends_at, e.all_day, e.link, e.audience, e.cohort, e.edital_id, e.student_id, ts, id]);
    if (!n) throw notFound('Compromisso não encontrado.');
    await audit(d, ctx, 'agenda.update', { targetType: 'agenda', targetId: id });
    return { id };
  }
  const row = await d.one(
    `INSERT INTO agenda_events (tenant_id, kind, title, description, starts_at, ends_at, all_day, link, audience, cohort, edital_id, student_id, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    [ctx.tenantId, e.kind, e.title, e.description, e.starts_at, e.ends_at, e.all_day, e.link, e.audience, e.cohort, e.edital_id, e.student_id, ctx.userId, ts, ts]);
  await audit(d, ctx, 'agenda.create', { targetType: 'agenda', targetId: row.id, payload: { kind: e.kind, audience: e.audience } });
  return row;
}

export async function deleteEvent(d, ctx, id) {
  const n = await d.run('DELETE FROM agenda_events WHERE id = ?', [id]);
  if (!n) throw notFound('Compromisso não encontrado.');
  await audit(d, ctx, 'agenda.delete', { targetType: 'agenda', targetId: id });
}

const COLS = `a.id, a.kind, a.title, a.description, a.starts_at, a.ends_at, a.all_day, a.link, a.audience, a.cohort, a.edital_id, a.student_id`;
const range = (from, to) => {
  if (from && !isValidDate(from)) throw badRequest('Data inicial inválida.');
  if (to && !isValidDate(to)) throw badRequest('Data final inválida.');
  return { from: from ? toUtc(from, '00:00') : null, to: to ? toUtc(to, '23:59') : null };
};

/** Visão da professora/equipe: todos os compromissos, com o público descrito. */
export async function listForStaff(d, { from, to }) {
  const r = range(from, to);
  return d.all(
    `SELECT ${COLS}, ed.name AS edital_name, u.name AS student_name FROM agenda_events a
       LEFT JOIN editais ed ON ed.id = a.edital_id LEFT JOIN students st ON st.id = a.student_id LEFT JOIN users u ON u.id = st.user_id
      WHERE (?::timestamptz IS NULL OR COALESCE(a.ends_at, a.starts_at) >= ?::timestamptz) AND (?::timestamptz IS NULL OR a.starts_at <= ?::timestamptz)
      ORDER BY a.starts_at LIMIT 1000`, [r.from, r.from, r.to, r.to]);
}

/** Visão do aluno: só o que é para ele. */
export async function listForStudent(d, studentId, { from, to }) {
  const r = range(from, to);
  const st = await d.one('SELECT cohort FROM students WHERE id = ?', [studentId]);
  return d.all(
    `SELECT ${COLS} FROM agenda_events a
      WHERE (a.audience = 'all'
          OR (a.audience = 'student' AND a.student_id = ?)
          OR (a.audience = 'cohort' AND a.cohort = ?)
          OR (a.audience = 'edital' AND EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = ? AND e.edital_id = a.edital_id AND e.status = 'active')))
        AND (?::timestamptz IS NULL OR COALESCE(a.ends_at, a.starts_at) >= ?::timestamptz) AND (?::timestamptz IS NULL OR a.starts_at <= ?::timestamptz)
      ORDER BY a.starts_at LIMIT 1000`, [studentId, st?.cohort ?? null, studentId, r.from, r.from, r.to, r.to]);
}

// ───────────── .ics (adicionar ao calendário do aluno) ─────────────

const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');
const stamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const fold = (line) => { const out = []; let s = line; while (Buffer.byteLength(s) > 74) { let cut = 74; while (Buffer.byteLength(s.slice(0, cut)) > 74) cut--; out.push(s.slice(0, cut)); s = ` ${s.slice(cut)}`; } out.push(s); return out.join('\r\n'); };

export function toIcs(events, brandName = 'Método APQR') {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsEsc(brandName)}//Agenda//PT-BR`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsEsc(brandName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@apqr`, `DTSTAMP:${stamp(nowIso())}`);
    if (e.all_day) {
      const day = localDate(new Date(e.starts_at), DEFAULT_TZ).replace(/-/g, '');
      const next = new Date(new Date(e.starts_at).getTime() + 86400000);
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${localDate(next, DEFAULT_TZ).replace(/-/g, '')}`);
    } else {
      const end = e.ends_at || new Date(new Date(e.starts_at).getTime() + 3600000).toISOString();
      lines.push(`DTSTART:${stamp(e.starts_at)}`, `DTEND:${stamp(end)}`);
    }
    lines.push(`SUMMARY:${icsEsc(`${KINDS[e.kind]}: ${e.title}`)}`);
    const desc = [e.description, e.link ? `Link: ${e.link}` : null].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsEsc(desc)}`);
    if (e.link) lines.push(`URL:${e.link}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
