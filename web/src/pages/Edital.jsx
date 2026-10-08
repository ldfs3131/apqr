import { FileText, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { STATUS, STATUSES, fmtDur, fmtPct } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { ApqrLegend, Async, DistBar, Empty, ReviewCell, StatusBadge } from '../components/ui.jsx';
import { useTopicDrawer } from '../components/TopicDrawer.jsx';
import { NoExam } from './Dashboard.jsx';

export default function Edital() {
  const { examId, exams } = useExam();
  if (exams && !examId) return <NoExam />;
  return (
    <Page title="Meu edital" eyebrow="Método APQR" subtitle="Onde você está em cada conteúdo. Toque em um conteúdo para atualizar a etapa, registrar revisões ou estudar.">
      {examId && <EditalView examId={examId} />}
    </Page>
  );
}

/** Texto de situação do conteúdo (coluna STATUS). */
export function situation(t, settings) {
  if (t.status === 'consolidated') return { text: 'Meta atingida', tone: 'good' };
  if (t.cycle_locked) return { text: `Limite de ${settings.max_reviews_per_cycle} revisões · rodízio`, tone: 'warn' };
  if (t.status === 'review') return t.next_review_number === 1 ? { text: 'Q/R-1 disponível' } : { text: `Q/R-${t.next_review_number} disponível` };
  if (t.status === 'production') return { text: 'Pronto para revisar' };
  if (t.status === 'assimilation') return { text: 'Estudando' };
  return { text: 'Aguardando início' };
}

export function EditalView({ examId }) {
  const { version } = useData();
  const [sp, setSp] = useSearchParams();
  const state = useAsync(() => api.get(`/enrollments/${examId}/topics`), [examId, version]);
  const [q, setQ] = useState('');
  const [subject, setSubject] = useState(sp.get('subject') || '');
  const status = sp.get('status') || '';
  const setStatus = (s) => { const n = new URLSearchParams(sp); if (s) n.set('status', s); else n.delete('status'); setSp(n, { replace: true }); };
  return (
    <Async state={state}>
      {({ topics, settings }) => (
        <EditalBody topics={topics} settings={settings} q={q} setQ={setQ} subject={subject} setSubject={setSubject} status={status} setStatus={setStatus} />
      )}
    </Async>
  );
}

function EditalBody({ topics, settings, q, setQ, subject, setSubject, status, setStatus }) {
  const drawer = useTopicDrawer();
  // Colunas de revisão: o limite do ciclo, ou mais quando há revisões extras (marcadas com *).
  // Só mostra as colunas já usadas (ou a próxima disponível); colunas vazias poluem a tabela.
  const slotCols = Math.max(1, ...topics.map((t) => Math.max(t.reviews.length, t.next_review_number || 0)));
  const subjects = useMemo(() => {
    const m = new Map();
    for (const t of topics) if (!m.has(t.subject_id)) m.set(t.subject_id, { id: t.subject_id, name: t.subject_name });
    return [...m.values()];
  }, [topics]);
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtered = topics.filter((t) =>
    (!q || norm(t.name).includes(norm(q)) || norm(t.subject_name).includes(norm(q))) &&
    (!subject || t.subject_id === subject) &&
    (!status || (status === 'locked' ? t.cycle_locked : t.status === status))
  );
  const counts = Object.fromEntries(STATUSES.map((s) => [s, topics.filter((t) => t.status === s).length]));
  const filtering = !!(q || subject || status);
  const anyActivity = topics.some((t) => t.status !== 'not_started');
  const groups = subjects.map((s) => ({ ...s, all: topics.filter((t) => t.subject_id === s.id), rows: filtered.filter((t) => t.subject_id === s.id) })).filter((g) => g.rows.length);

  if (!topics.length) return <div className="card"><Empty icon={FileText} title="Seu edital ainda não tem conteúdos">Sua professora ainda está cadastrando as matérias e os conteúdos deste edital.</Empty></div>;

  return (
    <div className="stack">
      <div className="card card-pad">
        <ApqrLegend />
        <div className="row wrap mt" style={{ gap: 8 }}>
          <input className="input input-sm" style={{ maxWidth: 260 }} placeholder="Buscar conteúdo ou matéria" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar" />
          <select className="select input-sm" style={{ maxWidth: 220 }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Matéria">
            <option value="">Todas as matérias</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className={`chip ${!status ? 'on' : ''}`} onClick={() => setStatus('')}>Todos · {topics.length}</button>
            {STATUSES.map((s) => (
              <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(status === s ? '' : s)}>
                <span className={`dot bg-${s}`} />{STATUS[s].short} · {counts[s]}
              </button>
            ))}
            {topics.some((t) => t.cycle_locked) && <button className={`chip ${status === 'locked' ? 'on' : ''}`} onClick={() => setStatus(status === 'locked' ? '' : 'locked')}>Limite atingido</button>}
          </div>
        </div>
      </div>

      {groups.length === 0 && <div className="card"><Empty icon={Search} title="Nenhum conteúdo encontrado">Ajuste os filtros.</Empty></div>}

      {/* Desktop: tabela */}
      {groups.length > 0 && (
        <div className="card hide-mobile" style={{ overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Conteúdo</th><th>Etapa APQR</th>
                  {Array.from({ length: slotCols }, (_, i) => <th key={i} className="c">Q/R-{i + 1}{i >= settings.max_reviews_per_cycle ? '*' : ''}</th>)}
                  <th className="r">Último %</th><th className="r">Média %</th><th className="r">Horas</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.id} g={g} settings={settings} slotCols={slotCols} onOpen={(id) => drawer.open(id)} filtering={filtering} anyActivity={anyActivity} />
                ))}
              </tbody>
            </table>
          </div>
          {slotCols > settings.max_reviews_per_cycle && <p className="xs muted" style={{ padding: '8px 14px' }}>* Revisões extras, liberadas pela professora (além do limite de {settings.max_reviews_per_cycle} por ciclo).</p>}
        </div>
      )}

      {/* Mobile: cartões por matéria */}
      <div className="only-mobile">
        {groups.map((g) => <MobileGroup key={g.id} g={g} settings={settings} onOpen={(id) => drawer.open(id)} filtering={filtering} anyActivity={anyActivity} />)}
      </div>
    </div>
  );
}

function subjectCounts(list) {
  return Object.fromEntries(STATUSES.map((s) => [s, list.filter((t) => t.status === s).length]));
}

/** Matéria sem nenhuma atividade começa recolhida; com busca ou filtro ativo, tudo abre. */
function startsOpen(g, filtering, anyActivity) {
  // Aluno que ainda não começou vê tudo aberto; depois, só as matérias com atividade.
  return filtering || !anyActivity || g.all.some((t) => t.status !== 'not_started');
}

function GroupRows({ g, settings, slotCols, onOpen, filtering, anyActivity }) {
  const counts = subjectCounts(g.all);
  const secs = g.all.reduce((a, t) => a + t.study_seconds, 0);
  const [open, setOpen] = useState(startsOpen(g, filtering, anyActivity));
  const shown = filtering || open;
  return (
    <>
      <tr className="subject-row" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <td colSpan={2 + slotCols + 4}>
          <div className="row between">
            <button className="subject-toggle" aria-expanded={shown} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <span aria-hidden="true">{shown ? '▾' : '▸'}</span> {g.name} <span className="muted" style={{ fontWeight: 500 }}>· {g.all.length} conteúdos · {counts.consolidated} consolidados · {fmtDur(secs)}</span>
            </button>
            <div style={{ width: 160 }}><DistBar counts={counts} /></div>
          </div>
        </td>
      </tr>
      {shown && g.rows.map((t) => {
        const sit = situation(t, settings);
        return (
          <tr key={t.id} className={t.status === 'consolidated' ? 'row-cons' : ''} onClick={() => onOpen(t.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.id)}>
            <td><span className="topic-name">{t.name}</span>{t.current_cycle > 1 && <span className="tag" style={{ marginLeft: 6 }}>ciclo {t.current_cycle}</span>}</td>
            <td><StatusBadge status={t.status} size="sm" /></td>
            {Array.from({ length: slotCols }, (_, i) => (
              <td key={i} className="c">{i < t.reviews.length ? <ReviewCell review={t.reviews[i]} n={i + 1} isNext={t.next_review_number === i + 1} locked={t.cycle_locked} /> : null}</td>
            ))}
            <td className="r num bold">{t.last_percent != null ? fmtPct(t.last_percent) : <span className="muted">—</span>}</td>
            <td className="r num">{t.avg_percent != null ? fmtPct(t.avg_percent) : <span className="muted">—</span>}</td>
            <td className="r num">{t.study_seconds ? fmtDur(t.study_seconds) : <span className="muted">—</span>}</td>
            <td className="small" style={{ color: sit.tone === 'good' ? 'var(--s-cons-ink)' : sit.tone === 'warn' ? 'var(--s-red-ink)' : 'var(--ink-2)', fontWeight: sit.tone ? 650 : 500 }}>{t.status === 'not_started' ? '' : sit.text}</td>
          </tr>
        );
      })}
    </>
  );
}

function MobileGroup({ g, settings, onOpen, filtering, anyActivity }) {
  const [open, setOpen] = useState(startsOpen(g, filtering, anyActivity));
  const shown = filtering || open;
  const counts = subjectCounts(g.all);
  return (
    <div className="card m-subject">
      <button className="m-subject-head" onClick={() => setOpen(!open)} aria-expanded={shown}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bold">{g.name}</div>
          <div className="xs muted">{g.all.length} conteúdos · {counts.consolidated} consolidados</div>
          <div className="mt-sm"><DistBar counts={counts} /></div>
        </div>
        <span aria-hidden="true">{shown ? '▾' : '▸'}</span>
      </button>
      {shown && g.rows.map((t) => {
        const sit = situation(t, settings);
        return (
          <div key={t.id} className={`m-topic ${t.status === 'consolidated' ? 'cons' : ''}`} onClick={() => onOpen(t.id)} role="button" tabIndex={0}>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <span className="topic-name">{t.name}</span>
              <StatusBadge status={t.status} size="sm" />
            </div>
            {(t.status === 'review' || t.status === 'consolidated') && (
              <div className="m-rv">
                {t.reviews.map((r, i) => <ReviewCell key={i} review={r} n={i + 1} isNext={t.next_review_number === i + 1} locked={t.cycle_locked} />)}
              </div>
            )}
            <div className="row between xs muted">
              <span>{sit.text}</span>
              <span className="num">{t.last_percent != null ? `Último ${fmtPct(t.last_percent)} · ` : ''}{fmtDur(t.study_seconds, { zero: '0min' })}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
