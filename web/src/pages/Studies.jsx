import { Clock, Play, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { api, qs } from '../lib/api.js';
import { useData, useExam, useTimer, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ACTIVITY, fmtDate, fmtDur, fmtTime, plural, todayLocal } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Confirm, Empty, PeriodFilter, Stat, periodQuery } from '../components/ui.jsx';
import { ActivitySelect, ManualSessionModal, TopicSelect } from '../components/ManualSession.jsx';
import { useTopicDrawer } from '../components/TopicDrawer.jsx';
import { NoExam } from './Dashboard.jsx';

export default function Studies() {
  const { examId, exams, isAdminView } = useExam();
  if (exams && !examId) return <NoExam />;
  return (
    <Page title="Registrar estudo" eyebrow="Horas e sessões" subtitle="Carga horária é indicador de esforço. O domínio é medido pelo APQR e pelas questões.">
      {examId && <StudiesView examId={examId} readOnly={isAdminView} />}
    </Page>
  );
}

export function StudiesView({ examId, readOnly }) {
  const { version } = useData();
  const [period, setPeriod] = useState({ period: '30d' });
  const state = useAsync(() => api.get(`/enrollments/${examId}/sessions${qs(periodQuery(period))}`), [examId, version, period]);
  const [manual, setManual] = useState(false);
  return (
    <div className="stack" style={{ gap: 18 }}>
      {!readOnly && <StartStudyCard examId={examId} onManual={() => setManual(true)} />}
      <QuestionsHistory examId={examId} readOnly={readOnly} />
      <div className="row between wrap"><h2>Carga horária</h2><PeriodFilter value={period} onChange={setPeriod} /></div>
      <Async state={state}>{(d) => <StudiesBody d={d} readOnly={readOnly} examId={examId} />}</Async>
      {manual && <ManualSessionModal onClose={() => setManual(false)} onSaved={() => setManual(false)} />}
    </div>
  );
}

/** Segunda-feira da semana de uma data AAAA-MM-DD (sem fuso: a data já vem no dia do aluno). */
function weekStartOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

export function QuestionsHistory({ examId, readOnly }) {
  const { version, bump } = useData();
  const toast = useToast();
  const st = useAsync(() => (examId ? api.get(`/enrollments/${examId}/questions`) : Promise.resolve(null)), [examId, version]);
  const [del, setDel] = useState(null);
  const list = (st.data?.questions || []).slice(0, 10);
  const label = (x) => x.source === 'simulado' ? (x.simulado_name || 'Simulado') : x.source === 'general' ? `${x.subject_name} (só a matéria)` : x.source === 'review' ? `${x.subject_name} — ${x.topic_name} (revisão)` : `${x.subject_name} — ${x.topic_name}`;
  if (!list.length) return null;
  return (
    <Card title="Questões registradas (últimas)">
      {list.map((x) => (
        <div key={x.id} className="row between small" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ minWidth: 0 }}><span className="muted">{fmtDate(x.date, { year: false })} · </span>{label(x)}</span>
          <span className="row" style={{ gap: 6 }}><b className="num">{x.correct}/{x.questions}</b>
            {!readOnly && x.source !== 'review' && <button className="btn btn-ghost btn-sm" aria-label="Excluir registro" onClick={() => setDel(x)}><X size={15} /></button>}</span>
        </div>
      ))}
      {del && <Confirm title="Excluir registro de questões?" danger confirmLabel="Excluir" onClose={() => setDel(null)} message={`${del.correct}/${del.questions} em ${fmtDate(del.date)}.`}
        onConfirm={async () => { try { await api.del(`/enrollments/${examId}/practice/${del.id}`); toast.info('Registro excluído.'); setDel(null); bump(); } catch (e) { toast.error(e); } }} />}
    </Card>
  );
}

function StartStudyCard({ examId, onManual }) {
  const timer = useTimer();
  const toast = useToast();
  const drawer = useTopicDrawer();
  const [topicId, setTopicId] = useState(null);
  const [activity, setActivity] = useState('study');
  if (timer.timer) {
    return (
      <div className="card card-pad row between wrap">
        <div><div className="muted small bold">ESTUDO EM ANDAMENTO</div><b>{timer.timer.subject_name} — {timer.timer.topic_name}</b>{timer.timer.activity && <div className="xs muted">{ACTIVITY[timer.timer.activity]}</div>}</div>
        <div className="row"><button className="btn" onClick={() => drawer.open(timer.timer.topic_id)}>Abrir conteúdo</button><span className="muted small">Use a barra do cronômetro para pausar ou finalizar.</span></div>
      </div>
    );
  }
  return (
    <div className="card card-pad">
      <h3>Iniciar estudo</h3>
      <div className="row wrap mt-sm">
        <div style={{ flex: '1 1 280px' }}><TopicSelect examId={examId} value={topicId} onChange={setTopicId} /></div>
        <div style={{ flex: '0 1 220px' }}><ActivitySelect value={activity} onChange={setActivity} /></div>
        <button className="btn btn-primary" disabled={!topicId} onClick={async () => {
          try {
            const r = await timer.start(examId, topicId, activity);
            toast.info('Cronômetro iniciado.');
            if (r.suggest_status) drawer.open(topicId);
          } catch (e) { toast.error(e); }
        }}><Play size={16} aria-hidden="true" />Iniciar</button>
        <button className="btn" onClick={onManual}><Plus size={16} aria-hidden="true" />Registrar estudo ou questões</button>
      </div>
    </div>
  );
}

function StudiesBody({ d, readOnly, examId }) {
  const { sessions, by_period, summary: s } = d;
  const { bump } = useData();
  const toast = useToast();
  const [del, setDel] = useState(null);
  const today = todayLocal();
  const todaySecs = sessions.filter((x) => x.date === today).reduce((a, x) => a + x.duration_seconds, 0);
  const bySubject = new Map();
  for (const x of sessions) bySubject.set(x.subject_name, (bySubject.get(x.subject_name) || 0) + x.duration_seconds);
  const subj = [...bySubject.entries()].sort((a, b) => b[1] - a[1]);
  const byDay = new Map();
  for (const x of sessions) { if (!byDay.has(x.date)) byDay.set(x.date, []); byDay.get(x.date).push(x); }
  // Histórico agrupado por semana (segunda a domingo); começa com 2 semanas e abre mais sob demanda.
  const byWeek = new Map();
  for (const [date, list] of byDay) { const w = weekStartOf(date); if (!byWeek.has(w)) byWeek.set(w, []); byWeek.get(w).push([date, list]); }
  const weeks = [...byWeek.entries()];
  const [shownWeeks, setShownWeeks] = useState(2);
  return (
    <>
      <div className="grid g4">
        <Stat label="No período" value={fmtDur(s.study_seconds)} sub={plural(s.sessions_count, 'sessão', 'sessões')} />
        <Stat label="Média diária" value={fmtDur(s.avg_seconds_per_calendar_day)} sub={`Por dia estudado: ${fmtDur(s.avg_seconds_per_study_day)}`} />
        <Stat label="Dias estudados" value={s.study_days} sub={s.span_days ? `de ${s.span_days} dias no período` : ''} />
        <Stat label="Hoje" value={fmtDur(todaySecs)} sub={s.streak ? `Sequência: ${plural(s.streak, 'dia', 'dias')}` : 'Sem sequência ativa'} />
      </div>
      <div className="grid g2">
        <Card title="Horas por matéria (período)">
          {subj.length === 0 ? <p className="muted small">Sem sessões no período.</p> : subj.map(([name, secs]) => (
            <div key={name} className="row between small" style={{ padding: '6px 0', borderTop: '1px solid var(--border)' }}><span>{name}</span><b className="num">{fmtDur(secs)}</b></div>
          ))}
        </Card>
        <Card title="Por semana e por mês (total do edital)">
          <div className="grid g2" style={{ gap: 12 }}>
            <div>
              <div className="muted xs bold">SEMANAS</div>
              {by_period.by_week.slice(-8).reverse().map((w) => <div key={w.week_start} className="row between small" style={{ padding: '4px 0' }}><span>{fmtDate(w.week_start, { year: false })}</span><b className="num">{fmtDur(w.secs)}</b></div>)}
              {!by_period.by_week.length && <p className="muted small">—</p>}
            </div>
            <div>
              <div className="muted xs bold">MESES</div>
              {by_period.by_month.slice(-8).reverse().map((m) => <div key={m.month} className="row between small" style={{ padding: '4px 0' }}><span>{m.month.slice(5)}/{m.month.slice(0, 4)}</span><b className="num">{fmtDur(m.secs)}</b></div>)}
              {!by_period.by_month.length && <p className="muted small">—</p>}
            </div>
          </div>
        </Card>
      </div>
      <Card title="Histórico de sessões">
        {sessions.length === 0 ? <Empty icon={Clock} title="Nenhuma sessão no período">Inicie o cronômetro ou registre um estudo manualmente.</Empty> : (
          <>
          {weeks.slice(0, shownWeeks).map(([wk, days]) => (
          <div key={wk}>
          <div className="row between xs bold muted" style={{ padding: '10px 0 2px', letterSpacing: '.04em' }}><span>SEMANA DE {fmtDate(wk, { year: false })}</span><span className="num">{fmtDur(days.reduce((a, [, l]) => a + l.reduce((b, x) => b + x.duration_seconds, 0), 0))}</span></div>
          {days.map(([date, list]) => (
            <div key={date} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
              <div className="row between small"><b>{fmtDate(date, { weekday: true })}</b><span className="num muted">{fmtDur(list.reduce((a, x) => a + x.duration_seconds, 0))}</span></div>
              {list.map((x) => (
                <div key={x.id} className="row between small" style={{ padding: '5px 0 0 10px' }}>
                  <span style={{ minWidth: 0 }}><span className="muted">{x.started_at ? `${fmtTime(x.started_at)}–${fmtTime(x.ended_at)} · ` : ''}</span>{x.subject_name} — {x.topic_name}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <span className="tag">{x.source === 'timer' ? 'Cronômetro' : 'Manual'}</span>{x.activity && x.activity !== 'study' && <span className="tag">{ACTIVITY[x.activity]}</span>}
                    <b className="num">{fmtDur(x.duration_seconds)}</b>
                    {!readOnly && <button className="btn btn-ghost btn-sm" aria-label="Excluir sessão" onClick={() => setDel(x)}><X size={15} /></button>}
                  </span>
                </div>
              ))}
            </div>
          ))}
          </div>
          ))}
          {weeks.length > shownWeeks && <button className="btn btn-sm mt" onClick={() => setShownWeeks(shownWeeks + 4)}>Mostrar semanas anteriores ({weeks.length - shownWeeks})</button>}
          </>
        )}
      </Card>
      {del && <Confirm title="Excluir sessão?" danger confirmLabel="Excluir" onClose={() => setDel(null)} message={`${fmtDur(del.duration_seconds)} em ${del.topic_name} (${fmtDate(del.date)}). A exclusão fica registrada no histórico do conteúdo.`}
        onConfirm={async () => { try { await api.del(`/enrollments/${examId}/sessions/${del.id}`); toast.info('Sessão excluída.'); setDel(null); bump(); } catch (e) { toast.error(e); } }} />}
    </>
  );
}
