/**
 * Fila da Coordenação: listas calculadas dos dados (nada de conversa/repasse). Cada linha traz motivo, texto pronto de
 * WhatsApp e "feito" (quem e quando). Visível à professora/administrador e à coordenadora.
 */
import { addDays, badRequest, forbidden, nowIso, today as todayFn } from '../lib/util.js';
import { audit, studentScope } from '../security/access.js';
import { loadInputsMany, evaluatePacto } from './pacto.js';

const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v || null);
const canSee = (ctx) => ctx.role === 'teacher' || ctx.role === 'coordinator' || !!ctx.actingAsPlatform;

export const KINDS = {
  await_schedule: 'Consultoria paga aguardando agendamento',
  diagnostic_received: 'Diagnóstico recebido',
  session_week: 'Sessão nesta semana',
  report_prepare: 'Relatório de 30 dias a preparar',
  report_approve: 'Relatório a aprovar',
  access_expiring: 'Acesso vencendo em até 7 dias',
  bonus_expiring: 'Bônus vencendo em até 3 dias',
  bonus_open: 'Bônus emitido para aplicar',
  low_weeks: '2 semanas abaixo de 50% sem escudo',
};

const first = (name) => String(name || '').split(' ')[0];

export async function fila(d, ctx, { includeDone = false } = {}) {
  if (!canSee(ctx)) throw forbidden('Somente a professora ou a coordenadora veem a fila.');
  const t = todayFn(ctx.tz);
  const sc = studentScope(ctx);
  const base = `FROM students st JOIN users u ON u.id = st.user_id WHERE true${sc.sql}`;
  const people = new Map((await d.all(`SELECT st.id, u.name, st.phone ${base}`, sc.params)).map((p) => [p.id, p]));
  const items = [];
  const add = (kind, studentId, ref, reason, text, due = null) => {
    const p = people.get(studentId);
    if (!p) return;
    items.push({ kind, kind_label: KINDS[kind], student_id: studentId, student_name: p.name, phone: p.phone || null, ref: String(ref || ''), reason, whatsapp_text: text, due_on: due });
  };
  // 1) consultoria paga aguardando agendamento
  for (const j of await d.all('SELECT j.id, j.student_id, j.paid_on FROM consult_journeys j WHERE j.scheduled_on IS NULL AND j.done_on IS NULL')) {
    add('await_schedule', j.student_id, j.id, `Pago em ${dstr(j.paid_on) || '—'}; falta marcar o encontro.`, (n) => `Oi, ${n}! Aqui é da equipe da Prof. Pollyana Lyra. Vamos marcar o seu encontro da consultoria? Me diga os melhores dias e horários para você.`);
  }
  // 2) diagnósticos recebidos de quem ainda não fez o encontro
  for (const g of await d.all(`SELECT g.id, g.student_id, g.created_at FROM diagnostics g JOIN consult_journeys j ON j.id = g.journey_id WHERE j.done_on IS NULL`)) {
    add('diagnostic_received', g.student_id, g.id, 'Diagnóstico enviado: leia antes do encontro.', (n) => `Oi, ${n}! Recebemos o seu diagnóstico, obrigada. Vamos analisar antes do nosso encontro.`);
  }
  // 3) sessões da semana
  for (const j of await d.all('SELECT id, student_id, scheduled_on, session_link FROM consult_journeys WHERE done_on IS NULL AND scheduled_on >= ? AND scheduled_on <= ?', [t, addDays(t, 7)])) {
    add('session_week', j.student_id, j.id, `Sessão em ${dstr(j.scheduled_on).split('-').reverse().join('/')}.`, (n) => `Oi, ${n}! Lembrando do nosso encontro em ${dstr(j.scheduled_on).split('-').reverse().join('/')}.${j.session_link ? ` Link: ${j.session_link}` : ''}`, dstr(j.scheduled_on));
  }
  // 4) relatórios: a preparar (encontro feito, prazo em até 3 dias ou vencido, sem relatório aprovado) e a aprovar (rascunho)
  for (const j of await d.all(`SELECT j.id, j.student_id, j.done_on FROM consult_journeys j WHERE j.done_on IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM consult_reports r WHERE r.student_id = j.student_id AND r.status = 'approved' AND r.created_at >= j.created_at)
      AND NOT EXISTS (SELECT 1 FROM consult_reports r WHERE r.student_id = j.student_id AND r.status = 'draft' AND r.created_at >= j.created_at)`)) {
    const due = addDays(dstr(j.done_on), 30);
    if (due <= addDays(t, 3)) add('report_prepare', j.student_id, j.id, `Relatório de 30 dias ${due < t ? 'atrasado' : `previsto para ${due.split('-').reverse().join('/')}`}.`, null, due);
  }
  for (const r of await d.all("SELECT id, student_id FROM consult_reports WHERE status = 'draft'")) add('report_approve', r.student_id, r.id, 'Rascunho aguardando aprovação da professora.', null);
  // 5) acessos vencendo em 7 dias (somente acessos ativos)
  for (const a of await d.all("SELECT id, student_id, kind, ends_on FROM accesses WHERE status = 'active' AND paused_from IS NULL AND ends_on >= ? AND ends_on <= ?", [t, addDays(t, 7)])) {
    add('access_expiring', a.student_id, a.id, `Acesso (${a.kind}) vence em ${dstr(a.ends_on).split('-').reverse().join('/')}.`, (n) => `Oi, ${n}! O seu acesso termina em ${dstr(a.ends_on).split('-').reverse().join('/')}. Quer conversar sobre a renovação?`, dstr(a.ends_on));
  }
  // 6) bônus
  for (const b of await d.all('SELECT id, student_id, medal, discount_cents, valid_until FROM bonuses WHERE applied_at IS NULL AND valid_until >= ?', [t])) {
    const left = (new Date(`${dstr(b.valid_until)}T00:00:00Z`) - new Date(`${t}T00:00:00Z`)) / 86400000;
    const reais = (b.discount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const showMoney = ctx.role !== 'coordinator';                         // valores em R$: só professora/administrador
    const fdate = (v) => dstr(v).split('-').reverse().join('/');
    const kind = left <= 3 ? 'bonus_expiring' : 'bonus_open';
    add(kind, b.student_id, b.id, `Medalha ${b.medal}${showMoney ? `: ${reais} de desconto` : ''}, válido até ${fdate(b.valid_until)}.`, (n) => `Oi, ${n}! Você tem um bônus${showMoney ? ` de ${reais}` : ''} de desconto na renovação, válido até ${fdate(b.valid_until)}. Posso gerar o seu link?`, dstr(b.valid_until));
  }
  // 7) duas semanas abaixo de 50% sem escudo (alunos com pacto e acesso ativo)
  const withPacto = await d.all("SELECT DISTINCT p.student_id FROM pactos p JOIN students st ON st.id = p.student_id WHERE st.plan_status = 'active'");
  const ids = withPacto.map((x) => x.student_id).filter((id) => people.has(id));
  const inputs = await loadInputsMany(d, ids, ctx.tz);
  for (const student_id of ids) {
    const ev = evaluatePacto(inputs.get(student_id));
    const last2 = ev.weeks.filter((w) => ['green', 'yellow', 'red', 'shield'].includes(w.state)).slice(-2);
    if (last2.length === 2 && last2.every((w) => w.state === 'red')) add('low_weeks', student_id, last2[1].week_start, 'As duas últimas semanas ficaram abaixo de 50% do pacto, sem escudo.', (n) => `Oi, ${n}! Vi que as últimas semanas foram puxadas. Vamos ajustar o seu pacto de estudo para ficar mais leve? Estou aqui para ajudar.`);
  }
  const done = new Map((await d.all('SELECT a.student_id, a.kind, a.ref, a.done_at, a.note, u.name AS by_name FROM coord_actions a LEFT JOIN users u ON u.id = a.done_by')).map((a) => [`${a.student_id}|${a.kind}|${a.ref}`, a]));
  const out = [];
  for (const it of items) {
    const dn = done.get(`${it.student_id}|${it.kind}|${it.ref}`);
    if (dn && !includeDone) continue;
    out.push({ ...it, whatsapp_text: typeof it.whatsapp_text === 'function' ? it.whatsapp_text(first(it.student_name)) : it.whatsapp_text, done: dn ? { at: dn.done_at, by: dn.by_name, note: dn.note } : null });
  }
  const order = Object.keys(KINDS);
  out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.due_on || '9').localeCompare(b.due_on || '9') || a.student_name.localeCompare(b.student_name, 'pt-BR'));
  const groups = order.map((k) => ({ kind: k, label: KINDS[k], items: out.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  return { today: t, total: out.length, groups };
}

export async function markDone(d, ctx, { student_id, kind, ref, note, undo }) {
  if (!canSee(ctx)) throw forbidden('Sem permissão.');
  if (!KINDS[kind]) throw badRequest('Tipo inválido.');
  const sc = studentScope(ctx);
  const st = await d.one(`SELECT st.id, st.tenant_id FROM students st WHERE st.id = ?${sc.sql}`, [student_id, ...sc.params]);
  if (!st) throw badRequest('Aluno não encontrado.');
  if (undo) await d.run('DELETE FROM coord_actions WHERE student_id = ? AND kind = ? AND ref = ?', [student_id, kind, String(ref || '')]);
  else await d.run('INSERT INTO coord_actions (tenant_id, student_id, kind, ref, done_by, done_at, note) VALUES (?,?,?,?,?,?,?) ON CONFLICT (student_id, kind, ref) DO UPDATE SET done_by = EXCLUDED.done_by, done_at = EXCLUDED.done_at, note = EXCLUDED.note', [st.tenant_id, student_id, kind, String(ref || ''), ctx.userId, nowIso(), note ? String(note).slice(0, 300) : null]);
  await audit(d, ctx, undo ? 'fila.undo' : 'fila.done', { targetType: 'student', targetId: student_id, payload: { kind, ref } });
  return { ok: true };
}
