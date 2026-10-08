import { Brain, CalendarCheck, Clock, FileText, Target } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { STATUS, fmtDate, fmtDur, fmtPct, plural } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, DistBar, PeriodFilter, Stat, Tabs, periodQuery } from '../components/ui.jsx';
import { AccuracyChart, ApqrProgressChart, HoursChart, QuestionsChart, ReviewEvolutionChart, StatusDonutish, MonthCalendar, StudyCalendar, SubjectApqrBars, SubjectHoursChart } from '../components/Charts.jsx';
import { NoExam } from './Dashboard.jsx';
import { RankingView } from './Ranking.jsx';

/** Evolução do aluno: análises do período + conteúdos ordenados por desempenho. */
export default function Analytics() {
  const { examId, exams } = useExam();
  const [tab, setTab] = useState('analise');
  if (exams && !examId) return <NoExam />;
  return (
    <Page title="Evolução" eyebrow="Análise de desempenho" subtitle="Tudo calculado a partir dos seus registros. Sem dados registrados, sem gráfico inventado."
      actions={examId && <Link className="btn" to={`/relatorio/${examId}`}><FileText size={16} aria-hidden="true" />Gerar relatório</Link>}>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'analise', label: 'Análise do período' }, { value: 'conteudos', label: 'Conteúdos por desempenho' }]} />
      <div className="mt">
        {examId && tab === 'analise' && <AnalyticsView examId={examId} />}
        {examId && tab === 'conteudos' && <RankingView examId={examId} />}
      </div>
    </Page>
  );
}

export function AnalyticsView({ examId }) {
  const { version } = useData();
  const [period, setPeriod] = useState({ period: '30d' });
  const state = useAsync(() => api.get(`/enrollments/${examId}/analytics${qs(periodQuery(period))}`), [examId, version, period]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="card card-pad row between wrap"><PeriodFilter value={period} onChange={setPeriod} />{state.data && <span className="small muted">{fmtDate(state.data.period.from)} a {fmtDate(state.data.period.to)}</span>}</div>
      <Async state={state}>{(d) => <AnalyticsBody d={d} />}</Async>
    </div>
  );
}

const GROUP_LABEL = { avancada: 'Matérias mais avançadas', intermediaria: 'Matérias intermediárias', atrasada: 'Matérias pedindo atenção' };

function AnalyticsBody({ d }) {
  const { summary: s, daily, apqr_series, subjects, balance, review_evolution, insights, settings } = d;
  const th = settings.consolidation_threshold;
  const [view, setView] = useState('resumo');
  const withHours = subjects.filter((x) => x.total_topics > 0);
  const most = [...withHours].sort((a, b) => b.study_seconds - a.study_seconds)[0];
  const least = [...withHours].sort((a, b) => a.study_seconds - b.study_seconds)[0];
  return (
    <>
      <div className="grid g4">
        <Stat icon={Clock} label="Horas estudadas" value={fmtDur(s.study_seconds)} sub={`Média diária ${fmtDur(s.avg_seconds_per_calendar_day)}`} />
        <Stat icon={Target} label="Percentual de acertos" value={fmtPct(s.accuracy, 1)} sub={s.questions ? `${plural(s.questions, 'questão', 'questões')} no período` : 'Sem questões no período'} />
        <Stat icon={Brain} label="Progresso APQR" value={fmtPct(s.apqr_progress, 1)} sub={`${s.counts.consolidated} de ${s.total_topics} consolidados`} />
        <Stat icon={CalendarCheck} label="Dias de estudo" value={s.study_days} sub={`Média por dia estudado: ${fmtDur(s.avg_seconds_per_study_day)}`} />
      </div>
      {withHours.length > 1 && s.study_seconds > 0 && (
        <div className="card card-pad kpi-inline">
          <div><b>{most.name}</b><span>Matéria mais estudada · {fmtDur(most.study_seconds)}</span></div>
          <div><b>{least.name}</b><span>Matéria menos estudada · {fmtDur(least.study_seconds, { zero: 'sem horas' })}</span></div>
        </div>
      )}

      <Tabs value={view} onChange={setView} options={[{ value: 'resumo', label: 'Resumo' }, { value: 'tempo', label: 'Horas e questões' }, { value: 'edital', label: 'Edital' }]} />

      {view === 'resumo' && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title="Insights e recomendações">
            {insights.length === 0 ? <p className="muted small">Registre estudos, revisões e questões para gerar insights.</p> : insights.map((i) => <div key={i.text} className={`insight ${i.tone}`}><span className="i-mark" /><span>{i.text}</span></div>)}
          </Card>
          <Card title="Dias de estudo"><MonthCalendar daily={daily} /><p className="small muted mt-sm">{plural(s.study_days, 'dia estudado', 'dias estudados')} no período · sequência atual {plural(s.streak, 'dia', 'dias')}</p></Card>
        </div>
      )}

      {view === 'tempo' && (
        <div className="grid g2" style={{ alignItems: 'start' }}>
          <Card title="Horas estudadas ao longo do tempo"><HoursChart daily={daily} /></Card>
          <Card title="Questões resolvidas ao longo do tempo"><QuestionsChart daily={daily} /></Card>
          <Card title="Evolução do percentual de acertos"><AccuracyChart daily={daily} threshold={th} /></Card>
          <Card title="Horas por matéria"><SubjectHoursChart subjects={subjects} /></Card>
        </div>
      )}

      {view === 'edital' && (
        <>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <Card title="Progresso APQR" subtitle="Reconstruído a partir do histórico de etapas."><ApqrProgressChart series={apqr_series} /></Card>
            <Card title="Progresso APQR por matéria"><SubjectApqrBars subjects={subjects} /></Card>
            <Card title="Distribuição dos conteúdos por etapa"><StatusDonutish counts={s.counts} total={s.total_topics} /></Card>
            <Card title="Evolução Q/R-1 → Q/R-2 → Q/R-3 → Q/R-4" subtitle="Média de acertos por número da revisão (todas as revisões do edital)."><ReviewEvolutionChart data={review_evolution} threshold={th} /></Card>
          </div>
          <BalanceCard balance={balance} />
        </>
      )}
    </>
  );
}

export function BalanceCard({ balance }) {
  return (
    <Card title="Equilíbrio do edital" subtitle="Onde sua atenção está concentrada. O método busca percorrer o edital de forma equilibrada.">
      {balance.subjects.length === 0 ? <p className="muted small">Sem matérias com conteúdos.</p> : (
        <>
          <div className="row wrap small mb">
            <span>Progresso médio por matéria: <b className="num">{fmtPct(balance.average_progress, 1)}</b></span>
            <span className="muted">· a matéria mais avançada está <b className="num">{Math.round(balance.spread)} pontos percentuais</b> à frente da menos avançada{balance.concentrated ? ': o estudo está concentrado em poucas matérias' : ''}</span>
          </div>
          {['avancada', 'intermediaria', 'atrasada'].map((g) => {
            const list = balance.subjects.filter((x) => x.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mb">
                <div className="bal-group">{GROUP_LABEL[g]}</div>
                <div className="table-wrap">
                  <table className="tbl" style={{ fontSize: 13.5 }}>
                    <thead><tr><th>Matéria</th><th className="r">Conteúdos</th><th style={{ minWidth: 150 }}>Etapas</th><th className="r hide-mobile"><span className="dot bg-not_started" title={STATUS.not_started.short} aria-label={STATUS.not_started.short} /></th><th className="r hide-mobile"><span className="dot bg-assimilation" title={STATUS.assimilation.short} aria-label={STATUS.assimilation.short} /></th><th className="r hide-mobile"><span className="dot bg-production" title={STATUS.production.short} aria-label={STATUS.production.short} /></th><th className="r hide-mobile"><span className="dot bg-review" title={STATUS.review.short} aria-label={STATUS.review.short} /></th><th className="r hide-mobile"><span className="dot bg-consolidated" title={STATUS.consolidated.short} aria-label={STATUS.consolidated.short} /></th><th className="r">Acertos</th><th className="r">Horas</th></tr></thead>
                    <tbody>
                      {list.map((x) => (
                        <tr key={x.id} style={{ cursor: 'default' }}>
                          <td className="bold">{x.name}<div className="xs muted">APQR {fmtPct(x.apqr_progress, 0)}</div></td>
                          <td className="r num">{x.total_topics}</td>
                          <td><DistBar counts={x.counts} total={x.total_topics} /></td>
                          <td className="r num hide-mobile">{x.counts.not_started}</td><td className="r num hide-mobile">{x.counts.assimilation}</td><td className="r num hide-mobile">{x.counts.production}</td><td className="r num hide-mobile">{x.counts.review}</td><td className="r num hide-mobile">{x.counts.consolidated}</td>
                          <td className="r num">{fmtPct(x.accuracy, 0)}</td>
                          <td className="r num">{fmtDur(x.study_seconds, { zero: '—' })}<div className="xs muted">{x.hours_share ? `${x.hours_share}%` : ''}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}
