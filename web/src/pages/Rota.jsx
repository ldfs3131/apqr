import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Clock, Layers, Pencil, Target, Trophy } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useExam, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Empty } from '../components/ui.jsx';
import { NoExam } from './Dashboard.jsx';

const ICONS = { book: BookOpen, target: Target, clock: Clock, layers: Layers, trophy: Trophy };
const hh = (secs) => `${Math.round((secs / 3600) * 10) / 10}`.replace('.', ',');
const accColor = (a) => (a == null ? 'var(--ink-3)' : a >= 70 ? '#2f8f4e' : a >= 50 ? '#b88a00' : '#bd2f2b');

export default function Rota() {
  const { examId, exams } = useExam();
  const { version, bump } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = useAsync(() => (examId ? api.get(`/enrollments/${examId}/route`) : Promise.resolve(null)), [examId, version]);
  if (exams && !examId) return <NoExam />;
  const accept = async (r) => {
    setBusy(true);
    try { const o = await api.post(`/enrollments/${examId}/route/${r.id}/accept`, {}); toast.success(o.applied ? `Ajustes aceitos. Pacto da próxima semana: ${o.applied.minutes / 60} h.` : 'Ajustes aceitos.'); bump(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Page title="Ajuste de Rota" eyebrow="Evolução" subtitle="Um retrato dos seus últimos 15 dias, feito por regras do método.">
      <Async state={state}>{(d) => {
        const r = d?.route;
        if (!r) return null;
        if (!r.enabled) return <Card><Empty icon={Target} title="Ajuste de Rota indisponível">Este recurso não está ativo no momento.</Empty></Card>;
        if (!r.ready) return <Card><Empty icon={Target} title="Seu primeiro Ajuste de Rota fica pronto em breve">Faltam {r.days_left} {r.days_left === 1 ? 'dia' : 'dias'} (pronto em {fmtDate(r.ready_on)}). Continue estudando e registrando: é com isso que o retrato é montado.</Empty></Card>;
        const f = r.facts;
        const p = f.placar;
        return (
          <div className="stack route-wrap">
            <p className="muted small" style={{ margin: 0 }}>{fmtDate(r.period.from, { year: false })} a {fmtDate(r.period.to, { year: false })}</p>
            <Card title="Placar da quinzena" icon={Clock}>
              <div className="row between wrap" style={{ alignItems: 'baseline' }}>
                <div><span style={{ fontSize: 34, fontWeight: 800 }}>{hh(p.done_seconds)} h</span> {p.has_pacto && <span className="muted">de {hh(p.promised_minutes * 60)} h prometidas</span>}</div>
                {p.delta_pct != null && <b style={{ color: p.delta_pct >= 0 ? '#2f8f4e' : '#bd2f2b' }}>{p.delta_pct >= 0 ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />} {p.delta_pct >= 0 ? '+' : ''}{p.delta_pct}% vs. quinzena anterior</b>}
              </div>
              {p.has_pacto && p.pct != null && <div className="wk-bar mt-sm"><span style={{ width: `${Math.min(100, p.pct)}%` }} /></div>}
              <p className="xs muted mt-sm">{p.has_pacto && p.pct != null ? `${p.pct}% do pacto batido · ` : ''}{hh(p.done_seconds)} h estudadas em {p.study_days} {p.study_days === 1 ? 'dia' : 'dias'}</p>
            </Card>
            <Card title="Edital em cores" icon={Layers}>
              <div className="grid g3 route-colors">
                <div className="rc rc-y"><b>{f.colors.production}</b><span>para amarelo</span></div>
                <div className="rc rc-g"><b>{f.colors.review}</b><span>para verde</span></div>
                <div className="rc rc-c"><b>{f.colors.consolidated}</b><span>{f.colors.consolidated === 1 ? 'consolidado' : 'consolidados'}</span></div>
              </div>
              <p className="xs muted mt-sm">{f.colors_total} {f.colors_total === 1 ? 'tópico mudou' : 'tópicos mudaram'} de cor nesta quinzena{f.colors.assimilation ? ` (${f.colors.assimilation} entraram em assimilação)` : ''}.</p>
            </Card>
            <Card title="Questões" icon={Target} action={<span className="muted small">{f.questions.total} na quinzena</span>}>
              {!f.questions.subjects.length ? <p className="small muted">Nenhuma questão registrada na quinzena.</p> : f.questions.subjects.map((s) => (
                <div key={s.subject} style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
                  <div className="row between"><b>{s.subject}</b><b style={{ color: accColor(s.accuracy) }}>{s.accuracy == null ? '—' : `${Math.round(s.accuracy)}%`}</b></div>
                  <div className="wk-bar" style={s.accuracy == null ? { opacity: 0.35 } : undefined}><span style={{ width: `${s.accuracy || 0}%`, background: accColor(s.accuracy) }} /></div>
                  <div className="row xs muted" style={{ gap: 8, marginTop: 4 }}>
                    <span>{s.questions} questões</span>
                    {s.level === 'inicial' && <span className="tag">dados iniciais</span>}
                  </div>
                  {s.level === 'insuficiente' && <div className="xs" style={{ color: '#9a6a00', marginTop: 2 }}><AlertTriangle size={13} aria-hidden="true" /> faltam {s.missing} questões para analisar {s.subject}</div>}
                </div>
              ))}
            </Card>
            <Card title="Revisões" icon={BookOpen}>
              <div className="grid g2">
                <div className="rc"><b>{f.reviews.consolidated}</b><span>{f.reviews.consolidated === 1 ? 'tópico consolidado' : 'tópicos consolidados'}</span></div>
                <div className="rc"><b>{f.reviews.done}</b><span>{f.reviews.done === 1 ? 'revisão feita no ciclo' : 'revisões feitas no ciclo'}</span></div>
              </div>
            </Card>
            <div className="card card-pad row" style={{ gap: 14, background: 'color-mix(in srgb, #fcb132 12%, var(--surface))' }}>
              <span className="chama-ico" style={{ background: '#fdeec9' }}><Trophy size={26} color="#b77900" aria-hidden="true" /></span>
              <div><b>Conquista da quinzena</b><div className="small">{r.achievement}</div></div>
            </div>
            <h2 className="row" style={{ gap: 8 }}><Pencil size={17} aria-hidden="true" />{r.suggestions.length ? `${r.suggestions.length} ${r.suggestions.length === 1 ? 'ajuste' : 'ajustes'} para a próxima quinzena` : 'Ajustes para a próxima quinzena'}</h2>
            {!r.suggestions.length && <Card><p className="small ink2">Ainda poucos dados: para sugerir ajustes é preciso ao menos {f.min_days} dias de estudo e {f.min_hours} horas na quinzena. Continue registrando.</p></Card>}
            {r.suggestions.map((s) => {
              const Ico = ICONS[s.icon] || Target;
              return (
                <div key={s.code} className="card card-pad row" style={{ gap: 14, alignItems: 'flex-start' }}>
                  <span className="chama-ico" style={{ background: 'var(--accent-soft)', width: 44, height: 44 }}><Ico size={20} color="var(--accent)" aria-hidden="true" /></span>
                  <div><b>{s.title}</b><div className="small ink2">{s.text}</div><div className="xs muted" style={{ marginTop: 4 }}>{s.base}</div></div>
                </div>
              );
            })}
            {r.suggestions.length > 0 && (r.accepted_at
              ? <div className="info-box">Você aceitou estes ajustes em {fmtDate(String(r.accepted_at).slice(0, 10))}.</div>
              : <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => accept(r)}>{busy ? 'Aplicando…' : 'Aceitar ajustes'}</button>)}
            <p className="xs muted">Sugestões geradas por regras do método, sem inteligência artificial. Próximo retrato em {fmtDate(r.next_on, { year: false })}.</p>
          </div>
        );
      }}</Async>
    </Page>
  );
}
