/**
 * 🎯 Sugestão de Hoje e 💡 Insights.
 * Orientam, nunca obrigam. Cada sugestão traz os MOTIVOS (transparência) e
 * cada insight só aparece quando há dados reais suficientes para sustentá-lo.
 */
import { topicRows, summary as enrollmentSummary, subjectBreakdown, balance } from './stats.js';
import { getRoutine } from './routine.js';
import { addDays, daysBetween, pct, today } from '../lib/util.js';
import { getSettings } from './settings.js';

const REL_LABEL = { alta: 'alta relevância', media: 'relevância média', baixa: 'relevância menor' };
const ago = (n) => (n <= 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`);
const fmtP = (p) => (p == null ? '—' : `${String(p).replace('.', ',')}%`);
export function fmtDuration(secs) {
  const m = Math.round(secs / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (!h) return `${mm}min`;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}

export async function suggestions(d, enrollment, { rows: givenRows = null, settings = null } = {}) {
  const tz = enrollment.student_tz;
  const s = settings || (await getSettings(d, enrollment.tenant_id));
  const rows = givenRows || (await topicRows(d, enrollment, s));
  const t = today(tz);
  const out = [];
  const used = new Set();
  const push = (item) => {
    if (!item || used.has(item.topic_id)) return;
    used.add(item.topic_id);
    out.push(item);
  };
  const base = (r) => ({ topic_id: r.id, topic_name: r.name, subject_id: r.subject_id, subject_name: r.subject_name, status: r.status });

  // 1) Revisão prioritária: tópicos em Q+R com revisão disponível, menor último % primeiro;
  //    depois os que ainda não fizeram R1 (mais antigos primeiro).
  const reviewable = rows.filter((r) => r.next_review_number);
  const withResult = reviewable.filter((r) => r.last_percent != null).sort((a, b) => a.last_percent - b.last_percent || (a.last_review_date || '').localeCompare(b.last_review_date || ''));
  const noResult = reviewable.filter((r) => r.last_percent == null).sort((a, b) => (a.review_started_at || '').localeCompare(b.review_started_at || ''));
  const priority = withResult[0] || noResult[0];
  if (priority) {
    const reasons = [`Q/R-${priority.next_review_number} disponível`];
    if (priority.last_percent != null) reasons.push(`Último resultado: ${fmtP(priority.last_percent)}`);
    else if (priority.review_started_at) reasons.push(`Em revisão desde ${priority.review_started_at.split('-').reverse().join('/')}`);
    if (priority.last_review_date) reasons.push(`Última revisão ${ago(daysBetween(priority.last_review_date, t))}`);
    push({ kind: 'review', title: 'Revisão prioritária', ...base(priority), reasons, action: 'review' });
  }

  // 2) Assimilação em andamento há mais tempo sem estudo.
  const assim = rows
    .filter((r) => r.status === 'assimilation')
    .sort((a, b) => (a.last_study_date || a.started_at || '').localeCompare(b.last_study_date || b.started_at || ''));
  if (assim[0]) {
    const r = assim[0];
    const ref = r.last_study_date || r.started_at;
    push({
      kind: 'continue', title: 'Continuar assimilação', ...base(r), action: 'study',
      reasons: [ref ? `Último estudo ${ago(daysBetween(ref, t))}` : 'Em assimilação', r.study_seconds ? `${fmtDuration(r.study_seconds)} estudadas até agora` : 'Sem horas registradas ainda'],
    });
  }

  // 3) Próximo estudo: tópico não iniciado da disciplina de maior prioridade no Plano Global
  //    (desempate: disciplina com menos horas nos últimos 14 dias).
  const recent = new Map(
    (await d.all('SELECT t.subject_id, sum(x.duration_seconds) AS secs FROM study_sessions x JOIN topics t ON t.id = x.topic_id WHERE x.enrollment_id = ? AND x.voided_at IS NULL AND x.date >= ? GROUP BY t.subject_id', [enrollment.id, addDays(t, -13)])).map((x) => [x.subject_id, x.secs])
  );
  const notStarted = rows.filter((r) => r.status === 'not_started');
  if (notStarted.length) {
    const ranked = [...notStarted].sort((a, b) => {
      const pa = a.plan_priority ?? 999;
      const pb = b.plan_priority ?? 999;
      if (pa !== pb) return pa - pb;
      return (recent.get(a.subject_id) || 0) - (recent.get(b.subject_id) || 0);
    });
    const r = ranked[0];
    const reasons = ['Não iniciado'];
    if (r.plan_priority) reasons.push(`Matéria nº ${r.plan_priority} no Plano Global (${REL_LABEL[r.plan_relevance] || 'relevância média'})`);
    const pending = notStarted.filter((x) => x.subject_id === r.subject_id).length;
    reasons.push(`${pending} conteúdo(s) não iniciado(s) nesta matéria`);
    push({ kind: 'new', title: 'Próximo estudo', ...base(r), reasons, action: 'study' });
  }

  // 4) Menor desempenho (entre tópicos avaliados, ainda não consolidados).
  const low = rows.filter((r) => r.last_percent != null && r.status !== 'consolidated').sort((a, b) => a.last_percent - b.last_percent);
  const lowPick = low.find((r) => !used.has(r.id));
  if (lowPick) {
    push({
      kind: 'low', title: 'Menor desempenho', ...base(lowPick), action: lowPick.next_review_number ? 'review' : 'detail',
      reasons: [`Último resultado: ${fmtP(lowPick.last_percent)}`, lowPick.cycle_locked ? `Limite de ${s.max_reviews_per_cycle} revisões atingido — aguarde o rodízio` : `Média: ${fmtP(lowPick.avg_percent)}`],
    });
  }

  // 5) Material pronto aguardando a decisão de iniciar a revisão (o aluno decide quando).
  const ready = rows.filter((r) => r.status === 'production').sort((a, b) => (a.material_done_at || '').localeCompare(b.material_done_at || ''));
  if (ready[0]) {
    const r = ready[0];
    push({
      kind: 'ready', title: 'Material pronto', ...base(r), action: 'detail',
      reasons: [r.material_done_at ? `Material pronto desde ${r.material_done_at.split('-').reverse().join('/')}` : 'Material pronto', 'Quando decidir, inicie a revisão'],
    });
  }

  // 6) Disciplina com pouca atenção recente.
  const subjects = await subjectBreakdown(d, enrollment, { rows });
  const neglected = subjects
    .filter((sb) => sb.total_topics > 0 && sb.counts.consolidated < sb.total_topics && !recent.get(sb.id))
    .sort((a, b) => (a.plan_priority ?? 999) - (b.plan_priority ?? 999))[0];
  const hasAnyStudy = recent.size > 0;

  const locked = rows.filter((r) => r.cycle_locked);
  return {
    items: out.slice(0, 5),
    neglected_subject: hasAnyStudy && neglected ? { id: neglected.id, name: neglected.name, message: `${neglected.name} não recebeu estudo nos últimos 14 dias.` } : null,
    rotation: locked.length
      ? { count: locked.length, message: `${locked.length} conteúdo(s) atingiram o limite de ${s.max_reviews_per_cycle} revisões. Avance pelos demais conteúdos do edital.` }
      : null,
    note: 'Sugestões são orientações. Você pode escolher qualquer outro conteúdo.',
  };
}

/** Insights automáticos baseados SOMENTE em dados registrados. */
export async function insights(d, enrollment, { rows: givenRows = null } = {}) {
  const tz = enrollment.student_tz;
  const t = today(tz);
  const out = [];
  const add = (kind, text, tone = 'neutral') => out.push({ kind, text, tone });
  const rows = givenRows || (await topicRows(d, enrollment));
  const summary = await enrollmentSummary(d, enrollment, { rows });

  // Média diária nos últimos 7 dias (sobre os 7 dias de calendário).
  const last7 = await d.one('SELECT COALESCE(sum(duration_seconds), 0) AS s, count(DISTINCT date) AS days FROM study_sessions WHERE enrollment_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?', [enrollment.id, addDays(t, -6), t]);
  if (last7.s > 0) add('hours', `Você estudou em média ${fmtDuration(last7.s / 7)} por dia nos últimos 7 dias (${last7.days} dia(s) com estudo).`);

  // Disciplina com maior carga horária.
  const subj = await subjectBreakdown(d, enrollment, { rows });
  const withHours = subj.filter((s) => s.study_seconds > 0).sort((a, b) => b.study_seconds - a.study_seconds);
  const totalSecs = withHours.reduce((a, s) => a + s.study_seconds, 0);
  if (withHours.length >= 2) {
    const top = withHours[0];
    const share = Math.round((top.study_seconds / totalSecs) * 100);
    add('focus', `${top.name} recebeu a maior parte da sua carga horária (${share}% do total).`);
  }
  const noHours = subj.filter((s) => s.total_topics > 0 && s.study_seconds === 0);
  if (totalSecs > 0 && noHours.length) add('attention', `${noHours.length === 1 ? noHours[0].name + ' ainda não recebeu' : noHours.length + ' matérias ainda não receberam'} horas de estudo registradas.`, 'attention');

  // Disciplina com mais tópicos não iniciados.
  const mostPending = subj.filter((s) => s.counts.not_started > 0).sort((a, b) => b.counts.not_started / b.total_topics - a.counts.not_started / a.total_topics)[0];
  if (mostPending && summary.counts.not_started < summary.total_topics) {
    add('pending', `${mostPending.name} possui ${mostPending.counts.not_started} de ${mostPending.total_topics} conteúdos ainda não iniciados.`, 'attention');
  }

  // Tendência do percentual: últimos 30 dias vs 30 anteriores (mínimo de 20 questões em cada janela).
  const w = (a, b) => d.one('SELECT COALESCE(sum(questions), 0) AS q, COALESCE(sum(correct), 0) AS c FROM question_logs WHERE enrollment_id = ? AND voided_at IS NULL AND date >= ? AND date <= ?', [enrollment.id, a, b]);
  const cur = await w(addDays(t, -29), t);
  const prev = await w(addDays(t, -59), addDays(t, -30));
  if (cur.q >= 20 && prev.q >= 20) {
    const a = pct(prev.c, prev.q);
    const b = pct(cur.c, cur.q);
    const dir = b > a ? 'subiu' : b < a ? 'caiu' : 'se manteve';
    add('trend', `Seu percentual de acertos ${dir} de ${fmtP(a)} para ${fmtP(b)} nos últimos 30 dias.`, b >= a ? 'positive' : 'attention');
  }

  // Revisões aguardando.
  const waiting = summary.counts.production + summary.reviews_available;
  if (summary.reviews_available > 0) add('reviews', `Você possui ${summary.reviews_available} conteúdo(s) com revisão disponível${summary.counts.production ? ` e ${summary.counts.production} com material pronto aguardando o início da revisão` : ''}.`);
  else if (waiting > 0) add('reviews', `Você possui ${summary.counts.production} conteúdo(s) com material pronto aguardando o início da revisão.`);

  if (summary.counts.consolidated > 0) add('consolidated', `Você já consolidou ${String(summary.consolidated_percent).replace('.', ',')}% do edital (${summary.counts.consolidated} de ${summary.total_topics} conteúdos).`, 'positive');
  if (summary.locked_topics > 0) add('rotation', `${summary.locked_topics} conteúdo(s) atingiram o limite de revisões do ciclo. O rodízio pelos demais tópicos vai liberar uma nova rodada.`, 'attention');

  // Concentração do progresso.
  const bal = await balance(d, enrollment, { rows });
  if (bal.concentrated) {
    const adv = bal.subjects.filter((s) => s.group === 'avancada').map((s) => s.name);
    const late = bal.subjects.filter((s) => s.group === 'atrasada').map((s) => s.name);
    if (adv.length && late.length) add('balance', `Seu progresso está concentrado em ${adv.slice(0, 2).join(' e ')}, enquanto ${late.slice(0, 2).join(' e ')} permanece${late.length > 1 ? 'm' : ''} pouco trabalhada${late.length > 1 ? 's' : ''}.`, 'attention');
  }

  if (summary.streak >= 3) add('streak', `Você está há ${summary.streak} dias seguidos estudando.`, 'positive');

  // Rotina planejada vs realizada (últimos 7 dias).
  const routine = await getRoutine(d, enrollment.student_id);
  if (routine.weekly_study_minutes > 0 && last7.s > 0) {
    const planned = routine.weekly_study_minutes * 60;
    add('routine', `Nos últimos 7 dias você estudou ${fmtDuration(last7.s)} de ${fmtDuration(planned)} disponíveis no seu Mapa de Rotinas (${Math.round((last7.s / planned) * 100)}%).`);
  }

  if (summary.days_to_exam != null && summary.days_to_exam >= 0 && summary.total_topics) {
    add('exam', `Faltam ${summary.days_to_exam} dias para a prova. ${summary.counts.not_started} conteúdo(s) ainda não iniciado(s).`);
  }
  return dedupeInsights(out);
}

/**
 * Insights que falam da MESMA coisa (distribuição entre matérias) competem entre si: fica só o mais específico.
 * Prioridade: concentração do progresso > matérias sem horas > matéria com mais conteúdos parados > maior carga horária.
 */
const SAME_TOPIC = ['balance', 'attention', 'pending', 'focus'];
export function dedupeInsights(list) {
  const keep = SAME_TOPIC.find((k) => list.some((i) => i.kind === k));
  return list.filter((i) => !SAME_TOPIC.includes(i.kind) || i.kind === keep);
}
