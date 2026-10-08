import { Award, Check, ClipboardList, Clock, FileText, Info, PenLine, Target } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Empty, Field } from '../components/ui.jsx';

export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const MEDALS = [
  { key: 'bronze', label: 'Bronze', note: '1 meta', color: '#b87333' },
  { key: 'prata', label: 'Prata', note: '2 metas', color: '#9aa4b2' },
  { key: 'ouro', label: 'Ouro', note: 'todas as metas', color: '#d4a62a' },
];
export function MedalDot({ color, size = 52 }) {
  return <span className="medal-dot" style={{ background: color, width: size, height: size }}><Award size={size * 0.5} color="#fff" aria-hidden="true" /></span>;
}

function Goal({ title, g, right }) {
  const pct = g.of ? Math.min(100, Math.round((g.value / g.of) * 100)) : g.pct || 0;
  return (
    <div style={{ padding: '8px 0' }}>
      <div className="row between"><b>{title}</b><b style={{ color: 'var(--accent)' }}>{right}</b></div>
      <div className="wk-bar" style={{ margin: '6px 0' }}><span style={{ width: `${pct}%`, background: g.met ? '#2f8f4e' : undefined }} /></div>
      <div className="xs muted">{g.label}{g.met ? ' · meta cumprida' : ''}</div>
    </div>
  );
}

function Diagnostic({ questions, onSent }) {
  const toast = useToast();
  const terms = useAsync(() => api.get('/me/terms'), []);
  const [a, setA] = useState({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  const send = async () => {
    setBusy(true); setErr(null);
    try { await api.post('/me/consultoria/diagnostic', { answers: a, consent }); toast.success('Diagnóstico enviado. Obrigada!'); onSent(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const url = terms.data?.terms?.drive_url;
  return (
    <Card title="Seu diagnóstico" icon={ClipboardList}>
      <p className="small ink2">Responda com calma: é a partir dele que sua professora monta o encontro e o seu plano de ação.</p>
      <div className="stack mt-sm">
        <label className="consent-box">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Autorizo o uso destas respostas para a minha análise, inclusive com apoio de inteligência artificial. {url ? <a href={url} target="_blank" rel="noopener noreferrer">Ler os Termos</a> : <a href="/aceitar-termos" target="_blank">Ler os Termos</a>}</span>
        </label>
        {questions.map((q) => (
          <Field key={q.key} label={`${q.label}${q.required ? ' *' : ''}`}>
            {q.type === 'choice'
              ? <select className="select" disabled={!consent} value={a[q.key] || ''} onChange={set(q.key)}><option value="">Escolha…</option>{q.options.map((o) => <option key={o}>{o}</option>)}</select>
              : q.type === 'number' ? <input className="input" inputMode="numeric" disabled={!consent} value={a[q.key] || ''} onChange={(e) => setA({ ...a, [q.key]: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                : <textarea className="input" rows={2} disabled={!consent} maxLength={1000} value={a[q.key] || ''} onChange={set(q.key)} />}
          </Field>
        ))}
        {err && <div className="error-box">{err}</div>}
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!consent || busy} onClick={send}>{busy ? 'Enviando…' : 'Enviar diagnóstico'}</button>
        {!consent && <p className="xs muted">Sem a autorização, o diagnóstico não pode ser preenchido.</p>}
      </div>
    </Card>
  );
}

export default function Consultoria() {
  const { version, bump } = useData();
  const toast = useToast();
  const state = useAsync(() => api.get('/me/consultoria'), [version]);
  const toggle = async (it) => {
    try { await api.post(`/me/consultoria/items/${it.id}`, { done: !it.done }); bump(); } catch (e) { toast.error(e); }
  };
  return (
    <Page title="Consultoria" subtitle="Jornada do bônus e progresso">
      <Async state={state}>{(d) => {
        const c = d?.consultoria;
        if (!c) return <Card><Empty icon={Award} title="Sem consultoria ativa">Esta aba aparece para quem tem a consultoria individual.</Empty></Card>;
        const b = c.bonus; const g = b.goals || {};
        const cur = b.medal;
        return (
          <div className="stack consult-wrap">
            <Card title="Linha do tempo da jornada" icon={FileText}>
              <ol className="timeline">
                {c.journey.steps.map((s) => (
                  <li key={s.key} className={`tl-${s.state}`}>
                    <span className="tl-dot">{s.state === 'done' ? <Check size={14} aria-hidden="true" /> : s.state === 'current' ? <Target size={13} aria-hidden="true" /> : <Clock size={13} aria-hidden="true" />}</span>
                    <div><b>{s.label}</b><div className="xs muted">{s.state === 'done' ? (s.at ? fmtDate(String(s.at).slice(0, 10)) : 'concluído') : s.state === 'current' ? 'em andamento' : 'previsto'}</div></div>
                  </li>
                ))}
              </ol>
              {c.journey.scheduled_on && !c.journey.done_on && <p className="small mt-sm">Encontro marcado para <b>{fmtDate(c.journey.scheduled_on)}</b>.{c.journey.session_link && <> <a href={c.journey.session_link} target="_blank" rel="noopener noreferrer">Abrir link da sessão</a></>}</p>}
              {c.journey.ends_on && <p className="xs muted">Sua plataforma vale até {fmtDate(c.journey.ends_on)}.</p>}
            </Card>
            {c.needs_diagnostic && <Diagnostic questions={c.diagnostic_questions} onSent={bump} />}
            {b.started && (
              <>
                <Card title="Três metas do bônus" icon={Target}>
                  <Goal title="Constância" g={{ ...g.constancy, key: 'constancy' }} right={`${g.constancy.value} de 4`} />
                  <Goal title="Questões" g={g.questions} right={`${g.questions.value} de ${g.questions.of}`} />
                  <Goal title="Plano" g={g.plan} right={g.plan.of ? `${g.plan.value} de ${g.plan.of}` : '—'} />
                </Card>
                <Card title="Medalhas do bônus" icon={Award}>
                  <div className="grid g3 medals">
                    {MEDALS.map((m) => (
                      <div key={m.key} className={`medal ${cur === m.key ? 'on' : ''} ${m.key === 'ouro' ? 'gold' : ''}`}>
                        <MedalDot color={m.color} />
                        <b style={cur === m.key ? { color: 'var(--accent)' } : undefined}>{m.label}</b>
                        <span className="xs muted">{cur === m.key ? 'atual' : m.note}</span>
                      </div>
                    ))}
                  </div>
                  {b.issued && !b.issued.applied && !b.issued.expired && <div className="bonus-gold mt"><MedalDot color="#d4a62a" size={40} /><div><b>Seu bônus: medalha {b.issued.medal_label}</b><div className="small">{brl(b.issued.discount_cents)} de desconto na renovação, válido até {fmtDate(b.issued.valid_until)}.</div></div></div>}
                  <div className="info-box mt row" style={{ gap: 8 }}><Info size={16} aria-hidden="true" /><span>O bônus é um desconto na renovação, não vale dinheiro e vale por {b.valid_days} dias após o relatório.</span></div>
                </Card>
              </>
            )}
            {c.plan && (
              <Card title="Plano de ação" icon={PenLine} action={<span className="muted small">{c.plan.done} de {c.plan.total} feitas</span>}>
                <div className="stack-sm">
                  {c.plan.items.map((it) => (
                    <label key={it.id} className={`plan-item ${it.done ? 'done' : ''}`}>
                      <input type="checkbox" checked={it.done} onChange={() => toggle(it)} />
                      <span>{it.text}{it.due_on && <span className="xs muted"> · até {fmtDate(it.due_on, { year: false })}</span>}</span>
                    </label>
                  ))}
                </div>
              </Card>
            )}
            {c.report && (
              <Card title="Relatório de 30 dias" icon={FileText}>
                <p className="xs muted">Período {fmtDate(c.report.period_from)} a {fmtDate(c.report.period_to)}</p>
                <div className="grid g3 mt-sm">
                  <div className="rc"><b>{(Math.round((c.report.facts.hours.seconds / 3600) * 10) / 10).toLocaleString('pt-BR')} h</b><span>{c.report.facts.hours.basis}</span></div>
                  <div className="rc"><b>{c.report.facts.questions.total}</b><span>questões resolvidas</span></div>
                  <div className="rc"><b>{c.report.facts.questions.accuracy == null ? '—' : `${Math.round(c.report.facts.questions.accuracy)}%`}</b><span>{c.report.facts.questions.accuracy == null ? 'poucos dados para analisar' : 'de acerto'}</span></div>
                </div>
                {c.report.body && <p className="mt" style={{ whiteSpace: 'pre-wrap' }}>{c.report.body}</p>}
              </Card>
            )}
          </div>
        );
      }}</Async>
    </Page>
  );
}
