import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Lock, Minus, Plus, Shield } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/store.jsx';
import { Page } from '../components/Layout.jsx';
import { Alert, Card, Loading } from '../components/ui.jsx';
import { DAY_LETTERS, DAY_NAMES, WEEK_STATE, fmtMin, maskToDays, weekRange } from '../lib/pacto.js';

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function ChamaShields({ p, compact = false }) {
  const flame = <Flame size={compact ? 16 : 28} color="#e8590c" fill="#ffb347" strokeWidth={1.8} aria-hidden="true" />;
  const shield = <Shield size={compact ? 16 : 28} color="#0b4394" fill="#7fb0ee" strokeWidth={1.8} aria-hidden="true" />;
  const shieldTip = `Escudos protegem a Chama numa semana vencida. Você ganha 1 a cada ${p.green_target} semanas com meta batida e guarda até ${p.shields_max}.`;
  if (!compact) {
    return (
      <div className="chama-cards">
        <div className="chama-card" title="Semanas seguidas com o pacto cumprido (mínimo de 50%)">
          <span className="chama-ico flame">{flame}</span>
          <div><div className="chama-num">{p.chama}</div><div className="small muted">{p.chama === 1 ? 'semana seguida' : 'semanas seguidas'}</div></div>
        </div>
        <div className="chama-card" title={shieldTip}>
          <span className="chama-ico shield">{shield}</span>
          <div><div className="chama-num">{p.shields} <span className="chama-of">de {p.shields_max}</span></div>
            <div className="small muted">{p.shields === 1 ? 'escudo' : 'escudos'}{p.shields < p.shields_max && ` · ${p.green_progress}/${p.green_target} p/ o próximo`}</div></div>
        </div>
      </div>
    );
  }
  return (
    <div className="row wrap" style={{ gap: 10 }}>
      <span className="pill-stat" title="Semanas seguidas com o pacto cumprido (mínimo de 50%)">{flame}<b>{p.chama}</b> {p.chama === 1 ? 'semana seguida' : 'semanas seguidas'}</span>
      <span className="pill-stat" title={shieldTip}>{shield}<b>{p.shields}</b> de {p.shields_max} escudos
        {p.shields < p.shields_max && <span className="muted xs"> · {p.green_progress}/{p.green_target} p/ o próximo</span>}
      </span>
    </div>
  );
}

export function WeekCard({ w }) {
  const st = WEEK_STATE[w.state] || WEEK_STATE.in_progress;
  const pct = Math.min(100, w.percent);
  return (
    <div className={`week-card wk-${st.tone}`}>
      <div className="row between wrap" style={{ gap: 6 }}>
        <b>{weekRange(w.week_start, w.week_end)}</b>
        <span className={`wk-tag wk-${st.tone}`}><span aria-hidden="true">{st.icon}</span> {st.label}</span>
      </div>
      <div className="wk-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, w.percent)} aria-label={`${fmtMin(w.done_minutes)} de ${fmtMin(w.promised_minutes)}`}><span style={{ width: `${pct}%` }} /></div>
      <div className="row between small">
        <span><b>{fmtMin(w.done_minutes)}</b> de {fmtMin(w.promised_minutes)}</span>
        <b className={`wk-pct wk-${st.tone}`}>{w.percent}%</b>
      </div>
      {w.manual_minutes > 0 && <div className="xs muted">Inclui {fmtMin(w.manual_minutes)} lançados manualmente</div>}
    </div>
  );
}

/** Editor do pacto da semana (horas de 30 em 30 min + dias). */
export function PactoEditor({ p, onSaved }) {
  const toast = useToast();
  const canCurrent = p.editable.current;
  const [week, setWeek] = useState(canCurrent ? 'current' : 'next');
  const base = week === 'current' ? (p.current?.promised_minutes ?? p.default_minutes) : (p.next?.minutes ?? p.current?.promised_minutes ?? p.default_minutes);
  const baseDays = week === 'current' ? p.current?.planned_days : p.next?.days;
  const [minutes, setMinutes] = useState(base || 600);
  const [days, setDays] = useState(maskToDays(baseDays || 31));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => { setMinutes(base || 600); setDays(maskToDays(baseDays || 31)); setDone(false); }, [week]); // eslint-disable-line react-hooks/exhaustive-deps
  const per = days.length ? Math.round(minutes / days.length) : 0;
  const save = async () => {
    setBusy(true);
    try { const r = await api.put('/me/pacto', { week, minutes, days }); setDone(true); onSaved(r.pacto); toast.success('Pacto confirmado.'); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title={week === 'current' ? 'Seu pacto desta semana' : 'Seu pacto da próxima semana'}
      subtitle={canCurrent || week === 'next' ? 'Você pode alterar até quarta, 23h59. Depois o pacto trava.' : undefined}>
      <div className="stack">
        {!canCurrent && week === 'current' && null}
        {!canCurrent && <Alert tone="info" icon={Lock}>O pacto desta semana está travado. Você pode definir o da próxima semana abaixo.</Alert>}
        {p.suggestion && canCurrent && (
          <div className="suggest-card">
            <div className="small">{p.suggestion.reason} Que tal um pacto de <b>{fmtMin(p.suggestion.minutes)}</b>?</div>
            <button className="btn btn-sm" onClick={() => setMinutes(p.suggestion.minutes)}>Usar {fmtMin(p.suggestion.minutes)}</button>
          </div>
        )}
        <div>
          <div className="xs muted" id="pacto-h">Horas da semana</div>
          <div className="row" style={{ gap: 12, alignItems: 'center' }} role="group" aria-labelledby="pacto-h">
            <button className="btn icon-btn" aria-label="Menos 30 minutos" disabled={minutes <= 30} onClick={() => setMinutes(minutes - 30)}><Minus size={18} /></button>
            <b style={{ fontSize: 30, minWidth: 90, textAlign: 'center' }}>{fmtMin(minutes)}</b>
            <button className="btn icon-btn" aria-label="Mais 30 minutos" onClick={() => setMinutes(minutes + 30)}><Plus size={18} /></button>
          </div>
        </div>
        <div>
          <div className="xs muted" id="pacto-d">Dias de estudo</div>
          <div className="row" style={{ gap: 8 }} role="group" aria-labelledby="pacto-d">
            {DAY_LETTERS.map((l, i) => {
              const on = days.includes(i);
              return <button key={i} type="button" className={`day-btn ${on ? 'on' : ''}`} aria-pressed={on} aria-label={DAY_NAMES[i]} onClick={() => setDays(on ? days.filter((x) => x !== i) : [...days, i].sort())}>{l}</button>;
            })}
          </div>
          <div className="small muted mt-sm">{days.length ? `Média de ${fmtMin(per)} por dia.` : 'Escolha pelo menos um dia.'}</div>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={busy || !days.length || (week === 'current' && !canCurrent)} onClick={save}>{done ? 'Pacto confirmado ✓' : 'Confirmar pacto'}</button>
          {canCurrent && <button className="btn btn-ghost" onClick={() => setWeek(week === 'current' ? 'next' : 'current')}>{week === 'current' ? 'Definir a próxima semana' : 'Voltar para esta semana'}</button>}
        </div>
      </div>
    </Card>
  );
}

export default function Pacto() {
  const { user } = useAuth();
  const [p, setP] = useState(null);
  const [month, setMonth] = useState(null);
  const load = (m) => api.get(`/me/pacto${m ? `?month=${m}` : ''}`).then((r) => { setP(r.pacto); setMonth(r.pacto.month); }).catch(() => setP(false));
  useEffect(() => { load(); }, []);
  if (p === null) return <Page title="Pacto de estudo"><Loading compact /></Page>;
  if (p === false) return <Page title="Pacto de estudo"><Card><p>Não foi possível carregar agora.</p></Card></Page>;
  const shift = (n) => { const [y, m] = month.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, 1)); load(dt.toISOString().slice(0, 7)); };
  const monthName = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <Page title="Pacto de estudo" subtitle={`Olá, ${user.name.split(' ')[0]}! Seu compromisso semanal, sem comparação com ninguém.`}>
      <div className="stack">
        <ChamaShields p={p} />
        {p.reminders.map((r) => <Alert key={r.text} tone="info">{r.text}</Alert>)}
        <PactoEditor p={p} onSaved={() => load(month)} />
        <Card title="Seu mês em cores" action={
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-sm btn-ghost icon-btn" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
            <b>{cap(monthName)}</b>
            <button className="btn btn-sm btn-ghost icon-btn" aria-label="Próximo mês" onClick={() => shift(1)} disabled={month >= p.today.slice(0, 7)}><ChevronRight size={16} /></button>
          </div>}>
          {!p.weeks.length ? <p className="small muted">Ainda não há semanas neste mês. Defina seu pacto para começar.</p> : (
            <div className="week-grid">{p.weeks.map((w) => <WeekCard key={w.week_start} w={w} />)}</div>
          )}
          <div className="row wrap small mt" style={{ gap: 12 }}>
            <span><i className="dot-lg wk-red" /> Menos de 50%</span><span><i className="dot-lg wk-yellow" /> 50% a 99%</span><span><i className="dot-lg wk-green" /> 100% ou mais</span>
          </div>
          <p className="xs muted mt-sm">A semana vale com pelo menos 50% das horas prometidas. Semana parcial de início e semana com plano pausado não contam e não quebram a sua Chama.</p>
        </Card>
        <p className="ink2" style={{ textAlign: 'center' }}>{p.phrase}</p>
      </div>
    </Page>
  );
}
