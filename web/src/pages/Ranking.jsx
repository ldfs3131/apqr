import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtPct } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Empty, StatusBadge } from '../components/ui.jsx';
import { useTopicDrawer } from '../components/TopicDrawer.jsx';
import { NoExam } from './Dashboard.jsx';

const FILTERS = [
  { v: 'all', l: 'Todos' }, { v: 'low', l: 'Menor desempenho' }, { v: 'high', l: 'Maior desempenho' },
  { v: 'none', l: 'Sem avaliação' }, { v: 'review', l: 'Em revisão' }, { v: 'consolidated', l: 'Consolidados' },
];

export default function Ranking() {
  const { examId, exams } = useExam();
  if (exams && !examId) return <NoExam />;
  return (
    <Page title="Conteúdos por desempenho" subtitle="Conteúdos avaliados ordenados pelo MENOR percentual atual. Conteúdos sem questões ficam separados.">
      {examId && <RankingView examId={examId} />}
    </Page>
  );
}

export function RankingView({ examId }) {
  const { version } = useData();
  const state = useAsync(() => api.get(`/enrollments/${examId}/performance`), [examId, version]);
  const [filter, setFilter] = useState('all');
  const [subject, setSubject] = useState('');
  const drawer = useTopicDrawer();
  return (
    <Async state={state}>
      {({ evaluated, unevaluated, settings }) => {
        const subjects = [...new Map([...evaluated, ...unevaluated].map((t) => [t.subject_id, t.subject_name])).entries()];
        const bySubj = (t) => !subject || t.subject_id === subject;
        let list = evaluated.filter(bySubj);
        if (filter === 'low') list = list.filter((t) => t.status !== 'consolidated');
        if (filter === 'high') list = [...list].reverse();
        if (filter === 'review') list = list.filter((t) => t.status === 'review');
        if (filter === 'consolidated') list = list.filter((t) => t.status === 'consolidated');
        const showEvaluated = filter !== 'none';
        const showNone = filter === 'all' || filter === 'none';
        const none = unevaluated.filter(bySubj);
        return (
          <div className="stack">
            <div className="row wrap">
              {FILTERS.map((f) => <button key={f.v} className={`chip ${filter === f.v ? 'on' : ''}`} onClick={() => setFilter(f.v)}>{f.l}</button>)}
              <select className="select input-sm" style={{ maxWidth: 220 }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Matéria">
                <option value="">Todas as matérias</option>
                {subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            {showEvaluated && (
              <Card title={`Conteúdos avaliados (${list.length})`} pad={false}>
                {list.length === 0 ? <Empty icon={Trophy} title="Nenhum conteúdo avaliado">Os conteúdos entram nesta lista quando recebem a primeira revisão.</Empty> : (
                  <div className="table-wrap">
                    <table className="tbl">
                      <thead><tr><th style={{ width: 40 }}>#</th><th>Conteúdo</th><th className="hide-mobile">Matéria</th><th className="r">Último %</th><th className="r hide-mobile">Média %</th><th className="c">Revisão atual</th><th className="hide-mobile">Status</th></tr></thead>
                      <tbody>
                        {list.map((t, i) => (
                          <tr key={t.id} className={t.status === 'consolidated' ? 'row-cons' : ''} onClick={() => drawer.open(t.id)}>
                            <td className="num muted">{i + 1}</td>
                            <td><span className="topic-name">{t.name}</span><div className="xs muted only-mobile">{t.subject_name}</div></td>
                            <td className="hide-mobile ink2">{t.subject_name}</td>
                            <td className="r"><PctBar p={t.last_percent} threshold={settings.consolidation_threshold} /></td>
                            <td className="r num hide-mobile">{fmtPct(t.avg_percent)}</td>
                            <td className="c num">Q/R-{t.reviews_in_cycle}{t.current_cycle > 1 ? ` · c${t.current_cycle}` : ''}</td>
                            <td className="hide-mobile"><StatusBadge status={t.status} size="sm" locked={t.cycle_locked} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}
            {showNone && (
              <Card title={`Sem avaliação (${none.length})`} subtitle="Ainda sem questões registradas em revisão. Não significa baixo desempenho.">
                {none.length === 0 ? <p className="muted small">Todos os conteúdos já foram avaliados.</p> : (
                  <div className="row wrap" style={{ gap: 6 }}>
                    {none.map((t) => <button key={t.id} className="chip" onClick={() => drawer.open(t.id)}><span className={`dot bg-${t.status}`} />{t.subject_name} — {t.name}</button>)}
                  </div>
                )}
              </Card>
            )}
          </div>
        );
      }}
    </Async>
  );
}

function PctBar({ p, threshold }) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
      <div className="progress hide-mobile" style={{ width: 80, height: 6 }}><span style={{ width: `${p}%`, background: p > threshold ? 'var(--s-cons)' : 'var(--ink-3)' }} /></div>
      <b className="num">{fmtPct(p)}</b>
    </div>
  );
}
