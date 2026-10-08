import { RefreshCcw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate, fmtPct } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Empty, ReviewCell, StatusBadge } from '../components/ui.jsx';
import { useTopicDrawer } from '../components/TopicDrawer.jsx';
import { NoExam } from './Dashboard.jsx';

export default function Reviews() {
  const { examId, exams } = useExam();
  const { version } = useData();
  const state = useAsync(() => (examId ? Promise.all([api.get(`/enrollments/${examId}/topics`), api.get(`/enrollments/${examId}/history?limit=60`)]) : Promise.resolve(null)), [examId, version]);
  if (exams && !examId) return <NoExam />;
  return (
    <Page title="Revisões" eyebrow="Q + R" subtitle={state.data ? `Cada revisão envolve questões (mínimo ${state.data[0].settings.min_questions_per_review}). Consolida com acerto acima de ${state.data[0].settings.consolidation_threshold}%. Máximo de ${state.data[0].settings.max_reviews_per_cycle} revisões por ciclo — depois, rodízio.` : undefined}>
      <Async state={state}>{([t, h]) => <ReviewsBody topics={t.topics} settings={t.settings} history={h.history} />}</Async>
    </Page>
  );
}

function TopicLine({ t, action, onOpen }) {
  return (
    <div className="row between wrap" style={{ padding: '11px 0', borderTop: '1px solid var(--border)', gap: 10 }}>
      <div style={{ minWidth: 0, flex: '1 1 240px' }}>
        <div className="xs muted bold">{t.subject_name}</div>
        <div className="bold">{t.name}</div>
        <div className="xs muted">
          {t.status === 'production' && t.material_done_at && `Material pronto desde ${fmtDate(t.material_done_at)}`}
          {t.status === 'review' && (t.last_review_date ? `Última revisão ${fmtDate(t.last_review_date)} · ${fmtPct(t.last_percent)}` : `Em revisão desde ${fmtDate(t.review_started_at)}`)}
          {t.status === 'consolidated' && `Consolidado em ${fmtDate(t.consolidated_at)}`}
        </div>
      </div>
      <div className="row" style={{ gap: 5 }}>
        {(t.status === 'review' || t.status === 'consolidated') && t.reviews.map((r, i) => <ReviewCell key={i} review={r} n={i + 1} isNext={t.next_review_number === i + 1} locked={t.cycle_locked} />)}
      </div>
      <button className={`btn btn-sm ${action === 'review' ? 'btn-primary' : ''}`} onClick={() => onOpen(t.id, action)}>{action === 'review' ? `Registrar Q/R-${t.next_review_number}` : 'Abrir'}</button>
    </div>
  );
}

function ReviewsBody({ topics, settings, history }) {
  const drawer = useTopicDrawer();
  const open = (id, action) => drawer.open(id, { intent: action === 'review' ? 'review' : null });
  const available = topics.filter((t) => t.next_review_number).sort((a, b) => (a.last_percent ?? -1) - (b.last_percent ?? -1));
  const ready = topics.filter((t) => t.status === 'production').sort((a, b) => (a.material_done_at || '').localeCompare(b.material_done_at || ''));
  const locked = topics.filter((t) => t.cycle_locked);
  const consolidated = topics.filter((t) => t.status === 'consolidated').sort((a, b) => (b.consolidated_at || '').localeCompare(a.consolidated_at || '')).slice(0, 10);
  const recent = history.filter((h) => h.event_type === 'review').slice(0, 15);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g4">
        <div className="card stat"><div className="stat-label">Revisões disponíveis</div><div className="stat-value">{available.length}</div></div>
        <div className="card stat"><div className="stat-label">Material pronto</div><div className="stat-value">{ready.length}</div><div className="stat-sub">aguardando você iniciar</div></div>
        <div className="card stat"><div className="stat-label">Limite atingido</div><div className="stat-value">{locked.length}</div><div className="stat-sub">aguardando rodízio</div></div>
        <div className="card stat"><div className="stat-label">Consolidados</div><div className="stat-value">{topics.filter((t) => t.status === 'consolidated').length}</div></div>
      </div>
      <Card title="Revisões disponíveis" subtitle="Ordenadas pelo menor resultado. É uma orientação: revise o que fizer sentido para você.">
        {available.length === 0 ? <Empty icon={RefreshCcw} title="Nenhuma revisão disponível">Quando decidir iniciar a revisão de um conteúdo com material pronto, mude a etapa para Em revisão.</Empty> : available.map((t) => <TopicLine key={t.id} t={t} settings={settings} action="review" onOpen={open} />)}
      </Card>
      <Card title="Material pronto" subtitle="Você decide quando começar a revisão. A mudança para Em revisão é sempre manual.">
        {ready.length === 0 ? <p className="muted small">Nenhum conteúdo com material pronto aguardando.</p> : ready.map((t) => <TopicLine key={t.id} t={t} settings={settings} onOpen={open} />)}
      </Card>
      {locked.length > 0 && (
        <Card title={`Limite de ${settings.max_reviews_per_cycle} revisões atingido`} subtitle="Avance para os demais conteúdos do edital. Uma nova rodada é liberada depois do rodízio.">
          {locked.map((t) => <TopicLine key={t.id} t={t} settings={settings} onOpen={open} />)}
        </Card>
      )}
      <div className="grid g2">
        <Card title="Últimas revisões">
          {recent.length === 0 ? <p className="muted small">Nenhuma revisão registrada.</p> : recent.map((h) => (
            <div key={h.id} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ minWidth: 0 }}>{fmtDate(h.date, { year: false })} · <b>Q/R-{h.payload.number}</b> {h.topic_name}</span>
              <b className="num">{fmtPct(h.payload.percent)}</b>
            </div>
          ))}
        </Card>
        <Card title="Consolidados recentemente">
          {consolidated.length === 0 ? <p className="muted small">Ainda nenhum conteúdo consolidado.</p> : consolidated.map((t) => (
            <div key={t.id} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => open(t.id)}>
              <span>{t.subject_name} — {t.name}</span><StatusBadge status="consolidated" size="sm" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
