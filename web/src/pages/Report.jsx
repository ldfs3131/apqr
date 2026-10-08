import { ArrowLeft, Printer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate, fmtDateTime, fmtDur, fmtPct, plural } from '../lib/format.js';
import { Async, DistBar, PeriodFilter, StatusBadge, periodQuery } from '../components/ui.jsx';
import { AccuracyChart, HoursChart, ReviewEvolutionChart, SubjectApqrBars } from '../components/Charts.jsx';
import { OneUpSignature, useBrandInfo } from '../components/Brand.jsx';
import { BalanceCard } from './Analytics.jsx';

/** Relatório do aluno — página própria, otimizada para impressão / "Salvar como PDF". */
export default function Report() {
  const { examId } = useParams();
  const nav = useNavigate();
  const [period, setPeriod] = useState({ period: '30d' });
  const state = useAsync(() => api.get(`/enrollments/${examId}/report${qs(periodQuery(period))}`), [examId, period]);
  return (
    <div className="content report-page" style={{ maxWidth: 1000 }}>
      <div className="row between wrap no-print mb">
        <button className="btn btn-ghost" onClick={() => nav(-1)}><ArrowLeft size={16} aria-hidden="true" />Voltar</button>
        <div className="row wrap"><PeriodFilter value={period} onChange={setPeriod} /><button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Imprimir / Salvar PDF</button></div>
      </div>
      <Async state={state}>{(d) => <ReportBody d={d} />}</Async>
    </div>
  );
}

function ReportBody({ d }) {
  const { student, exam, period, summary: s, subjects, balance, daily, review_evolution, attention, insights, settings } = d;
  const { logo, name: brandName } = useBrandInfo();
  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad">
        <div className="row between wrap" style={{ alignItems: 'flex-start' }}>
          <div className="row" style={{ gap: 14 }}><img className="report-logo" src={logo} alt={brandName} /><div><div className="bold">Relatório de desempenho · Método APQR</div><div className="xs muted">Gerado em {fmtDateTime(d.generated_at)}</div></div></div>
          <div className="small" style={{ textAlign: 'right' }}>Período analisado<br /><b>{fmtDate(period.from)} a {fmtDate(period.to)}</b></div>
        </div>
        <div className="divider" />
        <div className="grid g2 small">
          <div><div className="muted xs">ALUNO</div><b style={{ fontSize: 17 }}>{student.name}</b><div className="muted">{student.email}</div>{student.goal && <div className="ink2">Objetivo: {student.goal}</div>}</div>
          <div><div className="muted xs">EDITAL</div><b style={{ fontSize: 17 }}>{exam.name}</b><div className="muted">{[exam.role_title, exam.board, exam.exam_date ? `Prova em ${fmtDate(exam.exam_date)}` : null].filter(Boolean).join(' · ')}</div>{s.days_to_exam != null && s.days_to_exam >= 0 && <div className="ink2">{s.days_to_exam} dias para a prova</div>}</div>
        </div>
      </section>

      <div className="grid g4">
        <Box label="Horas estudadas" value={fmtDur(s.study_seconds)} sub={`Média diária ${fmtDur(s.avg_seconds_per_calendar_day)}`} />
        <Box label="Dias de estudo" value={s.study_days} sub={`de ${s.span_days} dias`} />
        <Box label="Questões respondidas" value={s.questions.toLocaleString('pt-BR')} sub={`${s.correct} acertos`} />
        <Box label="Média de acertos" value={fmtPct(s.accuracy, 1)} sub="ponderada por questões" />
      </div>

      <section className="card card-pad">
        <div className="row between wrap"><h3>Progresso APQR · {fmtPct(s.apqr_progress, 1)}</h3><span className="small muted">{s.counts.consolidated} conteúdos consolidados · {s.counts.review} em revisão · {s.counts.production} com material pronto · {s.counts.assimilation} em assimilação · {s.counts.not_started} não iniciados</span></div>
        <div className="mt-sm"><DistBar counts={s.counts} total={s.total_topics} large showLegend /></div>
      </section>

      <div className="grid g2">
        <section className="card card-pad"><h3 className="mb">Progresso por matéria</h3><SubjectApqrBars subjects={subjects} /></section>
        <section className="card card-pad">
          <h3 className="mb">Horas por matéria</h3>
          {subjects.filter((x) => x.total_topics).map((x) => <div key={x.id} className="row between small" style={{ padding: '4px 0', borderTop: '1px solid var(--border)' }}><span>{x.name}</span><span className="num"><b>{fmtDur(x.study_seconds, { zero: '—' })}</b> · {fmtPct(x.accuracy, 0)}</span></div>)}
        </section>
        <section className="card card-pad"><h3>Evolução temporal — horas</h3><HoursChart daily={daily} height={180} /></section>
        <section className="card card-pad"><h3>Evolução temporal — acertos</h3><AccuracyChart daily={daily} threshold={settings.consolidation_threshold} height={180} /></section>
      </div>

      <div className="grid g2">
        <section className="card card-pad">
          <h3 className="mb">Principais pontos de atenção</h3>
          {attention.length === 0 ? <p className="muted small">Nenhum conteúdo avaliado abaixo da meta.</p> : attention.map((t) => (
            <div key={t.id} className="row between small" style={{ padding: '5px 0', borderTop: '1px solid var(--border)' }}>
              <span>{t.subject_name} — {t.name}</span><span className="row"><StatusBadge status={t.status} size="sm" locked={t.cycle_locked} /><b className="num">{fmtPct(t.last_percent)}</b></span>
            </div>
          ))}
        </section>
        <section className="card card-pad"><h3>Evolução por número de revisão</h3><ReviewEvolutionChart data={review_evolution} threshold={settings.consolidation_threshold} height={180} /></section>
      </div>

      <BalanceCard balance={balance} />

      <section className="card card-pad">
        <h3 className="mb">Insights</h3>
        {insights.length === 0 ? <p className="muted small">Sem dados suficientes.</p> : insights.map((i) => <div key={i.text} className={`insight ${i.tone}`}><span className="i-mark" /><span>{i.text}</span></div>)}
      </section>
      <p className="xs muted">Critério de consolidação vigente: resultado de revisão maior que {settings.consolidation_threshold}%, com no mínimo {settings.min_questions_per_review} questões (configuração v{settings.version}). Revisões anteriores mantêm a regra em vigor na data em que foram registradas. Máximo de {settings.max_reviews_per_cycle} revisões por ciclo. {plural(s.total_topics, 'conteúdo', 'conteúdos')} no edital.</p>
      <footer className="report-foot"><OneUpSignature tone="on-light" /></footer>
    </div>
  );
}

function Box({ label, value, sub }) {
  return <div className="card stat"><div className="stat-label">{label}</div><div className="stat-value" style={{ fontSize: 24 }}>{value}</div><div className="stat-sub">{sub}</div></div>;
}
