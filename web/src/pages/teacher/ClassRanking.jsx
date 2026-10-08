import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, Trophy } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDur, fmtPct } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Avatar, Card, Empty, Tabs } from '../../components/ui.jsx';
import { EditalSelect, useEditais } from '../../components/teacher.jsx';

const METRICS = [
  { value: 'consolidation', label: 'Consolidação' },
  { value: 'constancy', label: 'Constância' },
  { value: 'evolution', label: 'Evolução' },
  { value: 'hours', label: 'Horas estudadas' },
  { value: 'questions', label: 'Questões feitas' },
  { value: 'accuracy', label: '% de acerto' },
];

/** Ranking da turma por edital. Visível apenas para a professora, a equipe e a ONE UP — nunca para alunos. */
export default function ClassRanking() {
  const editais = useEditais();
  const [edital, setEdital] = useState(null);
  const [metric, setMetric] = useState('consolidation');
  useEffect(() => { if (!edital && editais.data?.editais?.length) setEdital(editais.data.editais[0].id); }, [editais.data, edital]);
  return (
    <Page title="Ranking da turma" eyebrow="Por edital" topbar={false}
      subtitle="Três indicadores independentes, sem nota única. Visível só para a mentoria — os alunos não veem comparações."
      actions={<EditalSelect value={edital} onChange={setEdital} />}>
      <Tabs value={metric} onChange={setMetric} options={METRICS} />
      <div className="mt">
        {editais.data && !editais.data.editais.length ? <div className="card"><Empty icon={Trophy} title="Nenhum edital">Crie um edital e vincule alunos para ver o ranking.</Empty></div>
          : edital && <RankingData edital={edital} metric={metric} />}
      </div>
    </Page>
  );
}

function RankingData({ edital, metric }) {
  const state = useAsync(() => api.get(`/teacher/ranking${qs({ edital_id: edital, metric })}`), [edital, metric]);
  return <Async state={state}>{(d) => <RankingBody d={d} />}</Async>;
}

function RankingBody({ d }) {
  const nav = useNavigate();
  const cell = (r, k) => {
    if (k === 'consolidation') return <b className="num">{fmtPct(r.consolidation_pct, 1)}</b>;
    if (k === 'constancy') return r.constancy == null ? <span className="muted xs">—</span> : <b className="num">{r.constancy.toLocaleString('pt-BR')}</b>;
    if (k === 'hours') return <b className="num">{fmtDur(r.study_seconds_28)}</b>;
    if (k === 'questions') return <b className="num">{(r.questions_28 || 0).toLocaleString('pt-BR')}</b>;
    if (k === 'accuracy') return r.accuracy_rank == null ? <span className="muted xs" title="Amostra pequena">{r.questions_28 ? `${fmtPct(r.accuracy_28, 0)} · poucos dados` : '—'}</span> : <b className="num">{fmtPct(r.accuracy_rank, 1)} <span className="muted xs">({r.questions_28})</span></b>;
    return r.evolution_pp == null ? <span className="muted xs">—</span> : <b className="num" style={{ color: r.evolution_pp > 0 ? 'var(--good)' : r.evolution_pp < 0 ? 'var(--critical)' : undefined }}>{r.evolution_pp > 0 ? '+' : ''}{r.evolution_pp.toLocaleString('pt-BR')} p.p.</b>;
  };
  const cols = ['consolidation', 'constancy', 'evolution', 'hours', 'questions', 'accuracy'];
  const label = { consolidation: 'Consolidação', constancy: 'Constância', evolution: 'Evolução', hours: 'Horas (28d)', questions: 'Questões (28d)', accuracy: '% acerto (28d)' };
  if (!d.ranked.length && !d.unranked.length) return <div className="card"><Empty icon={Trophy} title="Nenhum aluno neste edital">Vincule alunos ao edital para ver o ranking.</Empty></div>;
  return (
    <div className="stack">
      <Card pad={false}>
        <div className="table-wrap">
          <table className="tbl clickable">
            <thead>
              <tr><th className="c" style={{ width: 56 }}>#</th><th>Aluno</th>{cols.map((k) => <th key={k} className="r" style={k === d.metric ? { color: 'var(--accent)' } : undefined}>{label[k]}</th>)}<th className="r hide-mobile">Consolidados</th><th className="hide-mobile">Última atividade</th></tr>
            </thead>
            <tbody>
              {d.ranked.map((r) => (
                <tr key={r.enrollment_id} onClick={() => nav(`/professora/alunos/${r.student_id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/professora/alunos/${r.student_id}`)}>
                  <td className="c"><b className="num" style={{ fontSize: 16 }}>{r.position}º</b></td>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={r.name} /><span className="bold ellipsis">{r.name}</span></div></td>
                  {cols.map((k) => <td key={k} className="r">{cell(r, k)}</td>)}
                  <td className="r num hide-mobile">{r.counts.consolidated}/{r.topics_total}</td>
                  <td className="hide-mobile small">{r.last_activity ? fmtDate(r.last_activity, { year: false }) : '—'}</td>
                </tr>
              ))}
              {d.unranked.map((r) => (
                <tr key={r.enrollment_id} onClick={() => nav(`/professora/alunos/${r.student_id}`)} style={{ opacity: 0.75 }}>
                  <td className="c"><span className="tag">Novo</span></td>
                  <td><div className="row" style={{ gap: 10 }}><Avatar name={r.name} /><span className="bold ellipsis">{r.name}</span></div></td>
                  <td className="r">{cell(r, 'consolidation')}</td><td className="r muted xs">—</td><td className="r muted xs">—</td><td className="r">{cell(r, 'hours')}</td><td className="r">{cell(r, 'questions')}</td><td className="r">{cell(r, 'accuracy')}</td>
                  <td className="r num hide-mobile">{r.counts.consolidated}/{r.topics_total}</td>
                  <td className="hide-mobile small">{r.last_activity ? fmtDate(r.last_activity, { year: false }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Como o ranking é calculado" icon={Info}>
        <div className="stack-sm small ink2">
          <p><b>Consolidação:</b> {d.method.consolidation}</p>
          <p><b>Constância:</b> {d.method.constancy}</p>
          <p><b>Evolução:</b> {d.method.evolution}</p>
          <p><b>Horas estudadas:</b> {d.method.hours}</p>
          <p><b>Questões feitas:</b> {d.method.questions}</p>
          <p><b>% de acerto:</b> {d.method.accuracy}</p>
          <p>As abas de horas e questões mostram esforço e volume; domínio é medido por consolidação e % de acerto.</p>
          <p>Alunos com menos de {d.method.new_student_days} dias de matrícula aparecem como <b>Novo</b> e não recebem posição. Empates recebem a mesma posição; a ordem de desempate é: {d.metric === 'consolidation' ? 'evolução e constância' : d.metric === 'constancy' ? 'consolidação e evolução' : d.metric === 'evolution' ? 'conteúdos revisados no período e consolidação' : 'os demais indicadores de esforço e volume'}, e por fim o nome. Atualizado a cada acesso ({fmtDate(d.today)}).</p>
        </div>
      </Card>
    </div>
  );
}
