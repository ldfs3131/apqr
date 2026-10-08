/** Avisos dentro do app (sem e-mail): vencimento em 7 dias, bônus, Ajuste de Rota pronto, diagnóstico pendente, pacto. */
import { addDays, daysBetween, today as todayFn } from '../lib/util.js';
import { getConfig, issuedBonus, journeyView } from './consultoria.js';
import { periodFor } from './rota.js';

const dstr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v || null);
export const EXPIRY_ALERT_DAYS = 7;

export async function studentNotices(d, ctx, studentId) {
  const t = todayFn(ctx.tz);
  const out = [];
  // Vencimento: avisa quando o acesso que mais dura termina em até 7 dias.
  const acc = await d.all("SELECT ends_on, kind FROM accesses WHERE student_id = ? AND status = 'active' AND paused_from IS NULL AND ends_on IS NOT NULL", [studentId]);
  if (acc.length) {
    const last = acc.map((a) => dstr(a.ends_on)).sort().pop();
    const left = daysBetween(t, last);
    if (left >= 0 && left <= EXPIRY_ALERT_DAYS) out.push({ kind: 'access_expiring', tone: left <= 2 ? 'warning' : 'info', days_left: left, ends_on: last, text: left === 0 ? 'Seu acesso termina hoje.' : `Seu acesso termina em ${left} ${left === 1 ? 'dia' : 'dias'} (${last.split('-').reverse().join('/')}).`, action: { label: 'Renovar', to: 'renew' } });
  }
  const j = await journeyView(d, ctx, studentId).catch(() => null);
  if (j) {
    if (!j.has_diagnostic) out.push({ kind: 'diagnostic_pending', tone: 'info', text: 'Falta enviar o seu diagnóstico da consultoria.', action: { label: 'Preencher', to: '/consultoria' } });
    const b = await issuedBonus(d, studentId, t);
    if (b && !b.applied && !b.expired && b.days_left <= 3) out.push({ kind: 'bonus_expiring', tone: 'warning', text: `Seu bônus (${b.medal_label}) vence em ${b.days_left} ${b.days_left === 1 ? 'dia' : 'dias'}.`, action: { label: 'Ver bônus', to: '/consultoria' } });
  }
  // Ajuste de Rota pronto e ainda não aceito.
  const cfg = await getConfig(d, ctx.tenantId);
  if (cfg.route_adjust_enabled) {
    const enr = await d.all("SELECT e.id, e.created_at FROM enrollments e WHERE e.student_id = ? AND e.status = 'active' ORDER BY e.created_at LIMIT 1", [studentId]);
    for (const e of enr) {
      const per = periodFor(e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at, t);
      if (!per.ready) continue;
      const row = await d.one('SELECT accepted_at FROM route_adjustments WHERE enrollment_id = ? AND period_from = ?', [e.id, per.from]);
      if (!row || !row.accepted_at) out.push({ kind: 'route_ready', tone: 'info', text: 'Seu Ajuste de Rota da quinzena está pronto.', action: { label: 'Abrir', to: '/evolucao/rota' } });
    }
  }
  return out;
}
