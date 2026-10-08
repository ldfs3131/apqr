/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Clock, PenLine, Play, Plus, RefreshCcw, Repeat, Target, Trash2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useData, useExam, useTimer, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ACTIVITY, NEXT_ACTION, NEXT_STATUS, PRODUCTION_KIND, STATUS, STATUSES, fmtDate, fmtDur, fmtPct, fmtDateTime, todayLocal } from '../lib/format.js';
import { Async, Confirm, Field, Modal, StatusBadge } from './ui.jsx';
import { ManualSessionModal } from './ManualSession.jsx';

const UNDO_WINDOW_MIN = 30;
const STAFF_ROLES = ['teacher', 'mentor', 'platform_admin'];
const ROLE_LABEL = { teacher: 'professora', mentor: 'mentoria', platform_admin: 'ONE UP' };
const ACTIVITY_FOR_STATUS = { not_started: 'assimilation', assimilation: 'assimilation', production: 'review', review: 'review', consolidated: 'review' };

const Ctx = createContext(null);
export const useTopicDrawer = () => useContext(Ctx);

export function TopicDrawerProvider({ children }) {
  const [topicId, setTopicId] = useState(null);
  const [intent, setIntent] = useState(null);
  const open = useCallback((id, opts = {}) => { setTopicId(id); setIntent(opts.intent || null); }, []);
  const close = useCallback(() => setTopicId(null), []);
  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      {topicId && <TopicDrawer topicId={topicId} intent={intent} onClose={close} />}
    </Ctx.Provider>
  );
}

function TopicDrawer({ topicId, intent, onClose }) {
  const { examId } = useExam();
  const { version } = useData();
  const state = useAsync(() => api.get(`/enrollments/${examId}/topics/${topicId}`), [examId, topicId, version]);
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Detalhes do conteúdo">
        <Async state={state} compact>
          {(d) => <TopicContent d={d} intent={intent} onClose={onClose} reload={() => state.reload({ silent: true })} />}
        </Async>
      </aside>
    </div>
  );
}

function TopicContent({ d, intent, onClose, reload }) {
  const { topic, row, subject, reviews: allReviews, sessions, practice, productions = [], history, rotation, settings } = d;
  const reviews = allReviews.filter((r) => !r.voided_at);
  const voided = allReviews.filter((r) => r.voided_at);
  const { user } = useAuth();
  const { examId, isAdminView } = useExam();
  const { bump } = useData();
  const toast = useToast();
  const timer = useTimer();
  const isAdmin = ['teacher', 'mentor', 'platform_admin'].includes(user.role);
  const [modal, setModal] = useState(intent === 'review' && row?.next_review_number ? 'review' : null);
  const [delProd, setDelProd] = useState(null);

  const done = () => { bump(); reload(); };
  const act = async (fn, okMsg) => {
    try { const r = await fn(); if (okMsg) toast.success(typeof okMsg === 'function' ? okMsg(r) : okMsg); done(); return r; } catch (e) { toast.error(e); return null; }
  };
  const cycleReviews = reviews.filter((r) => r.cycle === topic.current_cycle);
  const lastReview = cycleReviews[cycleReviews.length - 1];
  const canStudentUndo = lastReview && (Date.now() - new Date(lastReview.created_at).getTime()) / 60000 <= UNDO_WINDOW_MIN;
  const slots = Math.max(settings.max_reviews_per_cycle, cycleReviews.length, row.next_review_number || 0);
  const totalQ = row.review_questions + row.practice_questions;
  const totalC = row.review_correct + row.practice_correct;
  const timerOnThis = timer?.timer?.topic_id === topic.id;

  const startStudy = async () => {
    try {
      const r = await timer.start(examId, topic.id, ACTIVITY_FOR_STATUS[topic.status] || 'study');
      toast.info('Cronômetro iniciado. Bons estudos!');
      if (r.suggest_status === 'assimilation') setModal('suggest-assim');
    } catch (e) { toast.error(e); }
  };

  return (
    <>
      <div className="drawer-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="muted small bold">{subject.name}</div>
          <h2 style={{ fontSize: 20, margin: '2px 0 8px' }}>{topic.name}</h2>
          <div className="row wrap">
            <StatusBadge status={topic.status} locked={!!topic.cycle_locked_at} />
            {topic.current_cycle > 1 && <span className="tag">Ciclo {topic.current_cycle}</span>}
          </div>
        </div>
        <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      </div>

      <div className="drawer-body">
        {/* Etapas APQR */}
        <section className="card card-pad">
          <div className="row between wrap" style={{ gap: 8 }}>
            <h3>Etapa APQR</h3>
            <span className="muted xs">A mudança de etapa é manual e só avança.</span>
          </div>
          <Stepper status={topic.status} topic={topic} />
          <div className="row wrap mt">
            {!isAdminView && NEXT_STATUS[topic.status] && (
              <button className="btn btn-primary" onClick={() => setModal('advance')}>
                <span className={`dot bg-${NEXT_STATUS[topic.status]}`} aria-hidden="true" />{NEXT_ACTION[topic.status].label}
              </button>
            )}
            {!isAdminView && row.next_review_number && (
              <button className="btn btn-primary" onClick={() => setModal('review')}><RefreshCcw size={16} aria-hidden="true" />Registrar Q/R-{row.next_review_number}{row.next_review_number > settings.max_reviews_per_cycle ? ' (extra)' : ''}</button>
            )}
            {!isAdminView && !timerOnThis && !timer.timer && (
              <button className="btn" onClick={startStudy}><Play size={16} aria-hidden="true" />Iniciar cronômetro</button>
            )}
            {!isAdminView && timerOnThis && <span className="tag"><Clock size={13} aria-hidden="true" /> Cronômetro ativo neste conteúdo</span>}
            {!isAdminView && <button className="btn" onClick={() => setModal('manual')}><Plus size={16} aria-hidden="true" />Registrar estudo</button>}
            {!isAdminView && ['assimilation', 'production'].includes(topic.status) && <button className="btn" onClick={() => setModal('production')}><PenLine size={16} aria-hidden="true" />Registrar material</button>}
            {!isAdminView && ['review', 'consolidated'].includes(topic.status) && (
              <button className="btn btn-ghost" onClick={() => setModal('material')} title="Acrescentar conteúdo ao resumo não muda a etapa"><PenLine size={16} aria-hidden="true" />Atualizei meu material</button>
            )}
          </div>
          {topic.status === 'consolidated' && (
            <div className="info-box mt" style={{ background: 'var(--s-cons-soft)', color: 'var(--s-cons-ink)' }}>
              <b>Meta atingida.</b> Conteúdo consolidado em {fmtDate(topic.consolidated_at)} com {fmtPct(row.last_percent)} — mais de {lastReview?.threshold_used ?? settings.consolidation_threshold}%. O ciclo de revisões foi encerrado.
            </div>
          )}
        </section>

        {/* Rodízio */}
        {rotation.locked && (
          <section className="card card-pad" style={{ borderColor: 'var(--s-red)' }}>
            <h3 className="row" style={{ gap: 8 }}><Repeat size={18} aria-hidden="true" />Limite de {settings.max_reviews_per_cycle} revisões atingido</h3>
            <p className="ink2 mt-sm">{rotation.message}</p>
            {rotation.eligible_count > 0 && (
              <p className="small muted mt-sm">Rodízio: {rotation.reviewed_count} de {rotation.eligible_count} outros conteúdos em revisão foram revisados desde o bloqueio.</p>
            )}
            <div className="row wrap mt-sm">
              {(isAdmin || rotation.can_student_release) && (
                <button className="btn" onClick={() => setModal('release')}>Liberar novo ciclo (Q/R-1 a Q/R-{settings.max_reviews_per_cycle})</button>
              )}
            </div>
          </section>
        )}

        {/* Revisões */}
        <section className="card card-pad">
          <div className="row between">
            <h3>Revisões {topic.current_cycle > 1 ? `· ciclo ${topic.current_cycle}` : ''}</h3>
            {lastReview && ((isAdmin) || (!isAdminView && canStudentUndo)) && (
              <button className="btn btn-ghost btn-sm" onClick={() => setModal('undo')}>Desfazer Q/R-{lastReview.number}</button>
            )}
          </div>
          <div className="grid g4 mt-sm" style={{ gap: 8 }}>
            {Array.from({ length: slots }, (_, i) => {
              const r = cycleReviews.find((x) => x.number === i + 1);
              const isNext = row.next_review_number === i + 1;
              return (
                <div key={i} className="card" title={r ? `Regra aplicada: acerto acima de ${r.threshold_used}% · mínimo ${r.min_questions_used} questões (configuração v${r.config_version})` : undefined} style={{ padding: 10, textAlign: 'center', boxShadow: 'none', background: r?.consolidated ? 'var(--s-cons)' : isNext ? 'var(--s-green-soft)' : 'var(--surface)', color: r?.consolidated ? '#fff' : undefined, borderStyle: r ? 'solid' : 'dashed' }}>
                  <div className="xs bold" style={{ opacity: .75 }}>Q/R-{i + 1}{(r?.extra || i + 1 > settings.max_reviews_per_cycle) ? ' · extra' : ''}</div>
                  <div className="bold num" style={{ fontSize: 20 }}>{r ? fmtPct(r.percent) : isNext ? 'Disponível' : '—'}</div>
                  <div className="xs" style={{ opacity: .75 }}>{r ? `${r.correct}/${r.questions} · ${fmtDate(r.date, { year: false })}` : ' '}</div>
                </div>
              );
            })}
          </div>
          {row.total_reviews > 0 && (
            <div className="kpi-inline mt">
              <div><b>{fmtPct(row.last_percent)}</b><span>Percentual atual</span></div>
              <div><b>{fmtPct(row.avg_percent)}</b><span>Média das revisões</span></div>
              <div><b>{fmtPct(row.best_percent)}</b><span>Melhor resultado</span></div>
            </div>
          )}
          {topic.status === 'review' && !rotation.locked && (
            <p className="xs muted mt-sm">Consolida com MAIS de {settings.consolidation_threshold}% (exatamente {settings.consolidation_threshold}% não consolida). Mínimo de {settings.min_questions_per_review} questões por revisão.</p>
          )}
          {row.extra_reviews_allowed && <p className="xs muted mt-sm">Sua professora liberou revisões extras para você: depois da Q/R-{settings.max_reviews_per_cycle}, você pode continuar revisando sem esperar o rodízio.</p>}
          {voided.length > 0 && (
            <details className="mt-sm">
              <summary className="small muted" style={{ cursor: 'pointer' }}>Revisões desfeitas ({voided.length})</summary>
              <ul className="small ink2">
                {voided.map((r) => <li key={r.id} style={{ textDecoration: 'line-through' }}>Ciclo {r.cycle} · Q/R-{r.number} · {fmtDate(r.date)} · {r.correct}/{r.questions}{r.void_reason ? ` — ${r.void_reason}` : ''}</li>)}
              </ul>
            </details>
          )}
          {reviews.some((r) => r.cycle < topic.current_cycle) && (
            <details className="mt-sm">
              <summary className="small muted" style={{ cursor: 'pointer' }}>Ciclos anteriores</summary>
              <ul className="small ink2">
                {reviews.filter((r) => r.cycle < topic.current_cycle).map((r) => <li key={r.id}>Ciclo {r.cycle} · Q/R-{r.number} · {fmtDate(r.date)} · {r.correct}/{r.questions} · {fmtPct(r.percent)}</li>)}
              </ul>
            </details>
          )}
        </section>

        {/* Números */}
        <section className="card card-pad">
          <h3>Resumo do conteúdo</h3>
          <div className="grid g2 mt-sm small" style={{ gap: '10px 18px' }}>
            <Info label="Começou em" value={fmtDate(topic.started_at)} />
            <Info label="Material concluído em" value={fmtDate(topic.material_done_at)} />
            <Info label="Início das revisões" value={fmtDate(topic.review_started_at)} />
            <Info label="Consolidado em" value={fmtDate(topic.consolidated_at)} />
            <Info label="Horas estudadas" value={fmtDur(row.study_seconds)} />
            <Info label="Sessões de estudo" value={row.sessions_count} />
            <Info label="Total de questões" value={totalQ} />
            <Info label="Total de acertos" value={totalC} />
            <Info label="Materiais produzidos" value={productions.length} />
            <Info label="Atualizações do material" value={topic.material_updates} />
            <Info label="Questões avulsas (treino)" value={row.practice_questions ? `${row.practice_questions} (${fmtPct(row.practice_correct / row.practice_questions * 100)})` : '—'} />
          </div>
          {!isAdminView && <button className="btn btn-sm mt" onClick={() => setModal('practice')}><Target size={15} aria-hidden="true" />Questões avulsas (treino/simulado)</button>}
        </section>

        {/* Mentor */}
        {isAdmin && (
          <section className="card card-pad">
            <h3>Ações da professora</h3>
            <p className="small muted mt-sm">Correções ficam registradas no histórico do aluno.</p>
            <div className="row wrap mt-sm">
              <button className="btn btn-sm" onClick={() => setModal('correct')}>Corrigir etapa</button>
            </div>
          </section>
        )}

        {/* Histórico */}
        <section className="card card-pad">
          <h3>Como chegou aqui</h3>
          <div className="timeline mt">
            {history.length === 0 && <p className="muted small">Sem registros ainda.</p>}
            {history.map((h) => <HistoryItem key={h.id} h={h} />)}
          </div>
        </section>

        <section className="card card-pad">
          <h3>Sessões e registros</h3>
          {sessions.length === 0 ? <p className="muted small mt-sm">Nenhuma sessão registrada.</p> : (
            <div className="mt-sm">
              {sessions.slice(0, 30).map((s) => (
                <div key={s.id} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                  <span>{fmtDate(s.date, { weekday: true })} {s.started_at && <span className="muted">· {fmtDateTime(s.started_at).split(' ')[1]}</span>}</span>
                  <span className="row"><span className="tag">{s.source === 'timer' ? 'cronômetro' : 'manual'}</span>{s.activity && s.activity !== 'study' && <span className="tag">{ACTIVITY[s.activity]}</span>}<b className="num">{fmtDur(s.duration_seconds)}</b></span>
                </div>
              ))}
            </div>
          )}
          {productions.length > 0 && (
            <>
              <h3 className="mt">Materiais produzidos</h3>
              {productions.map((p) => (
                <div key={p.id} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                  <span>{fmtDate(p.date)} · <b>{PRODUCTION_KIND[p.kind] || 'Material'}</b>{p.is_update ? ' (atualização)' : ''} {p.note && <span className="muted">· {p.note}</span>}</span>
                  {!isAdminView && <button className="btn btn-ghost btn-sm" aria-label="Remover registro" onClick={() => setDelProd(p)}><Trash2 size={14} /></button>}
                </div>
              ))}
            </>
          )}
          {practice.length > 0 && (
            <>
              <h3 className="mt">Questões avulsas</h3>
              {practice.map((p) => (
                <div key={p.id} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
                  <span>{fmtDate(p.date)} {p.note && <span className="muted">· {p.note}</span>}</span>
                  <span className="num">{p.correct}/{p.questions} · {fmtPct(p.correct / p.questions * 100)}</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      {modal === 'advance' && <AdvanceModal topic={topic} onClose={() => setModal(null)} onDone={(msg) => { setModal(null); toast.success(msg); done(); }} examId={examId} />}
      {modal === 'review' && <ReviewModal topic={topic} row={row} settings={settings} examId={examId} onClose={() => setModal(null)} onDone={(r) => { setModal(null); if (r.outcome === 'consolidated') toast.success(r.message); else toast.info(r.message); done(); }} />}
      {modal === 'manual' && <ManualSessionModal fixedTopic={{ id: topic.id, name: topic.name }} onClose={() => setModal(null)} onSaved={() => { setModal(null); done(); }} />}
      {modal === 'suggest-assim' && (
        <Confirm title="Marcar como Em assimilação?" confirmLabel="Sim, marcar" onClose={() => setModal(null)}
          message="Você começou a estudar um conteúdo que está como Não iniciado. Quer marcar este conteúdo como Em assimilação? (A etapa só muda se você confirmar.)"
          onConfirm={async () => { await act(() => api.post(`/enrollments/${examId}/topics/${topic.id}/status`, { status: 'assimilation' }), 'Conteúdo em assimilação.'); setModal(null); }} />
      )}
      {modal === 'material' && <MaterialModal examId={examId} topic={topic} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Atualização do resumo registrada. O conteúdo continua na mesma etapa.'); done(); }} />}
      {modal === 'undo' && <UndoModal examId={examId} topic={topic} review={lastReview} isAdmin={isAdmin} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.info(`Q/R-${lastReview.number} desfeita.`); done(); }} />}
      {modal === 'release' && (
        <Confirm title="Liberar novo ciclo de revisões?" confirmLabel="Liberar ciclo" onClose={() => setModal(null)}
          message={`Um novo ciclo (Q/R-1 a Q/R-${settings.max_reviews_per_cycle}) será liberado para este conteúdo. O histórico do ciclo atual é mantido.`}
          onConfirm={async () => { await act(() => api.post(`/enrollments/${examId}/topics/${topic.id}/release-cycle`), 'Novo ciclo liberado.'); setModal(null); }} />
      )}
      {modal === 'correct' && <CorrectModal examId={examId} topic={topic} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Etapa corrigida.'); done(); }} />}
      {modal === 'production' && <ProductionModal examId={examId} topic={topic} onClose={() => setModal(null)} onDone={(r) => { setModal(null); toast.success(r?.suggest_status ? 'Material registrado. Se ele estiver pronto, marque a etapa como Material pronto.' : 'Material registrado.'); done(); }} />}
      {delProd && <Confirm title="Remover registro de material?" danger confirmLabel="Remover" onClose={() => setDelProd(null)} message="O registro sai das contagens, mas fica no histórico do conteúdo."
        onConfirm={async () => { await act(() => api.del(`/enrollments/${examId}/productions/${delProd.id}`), 'Registro removido.'); setDelProd(null); }} />}
      {modal === 'practice' && <PracticeModal examId={examId} topic={topic} onClose={() => setModal(null)} onDone={() => { setModal(null); toast.success('Questões registradas.'); done(); }} />}
    </>
  );
}

function Info({ label, value }) {
  return <div><div className="muted xs">{label}</div><div className="bold num">{value ?? '—'}</div></div>;
}

function Stepper({ status, topic }) {
  const idx = STATUSES.indexOf(status);
  const dates = [null, topic.started_at, topic.material_done_at, topic.review_started_at, topic.consolidated_at];
  return (
    <div className="apqr-steps mt">
      {STATUSES.map((s, i) => (
        <div key={s} className="apqr-step" style={{ opacity: i <= idx ? 1 : 0.5, borderColor: i === idx ? `var(--s-${['red', 'orange', 'yellow', 'green', 'cons'][i]})` : undefined, borderWidth: i === idx ? 2 : 1 }}>
          <div className="row" style={{ gap: 6 }}><span className={`dot bg-${s}`} /> <b className="xs">{STATUS[s].short}</b></div>
          <div className="xs muted mt-sm">{i === 0 ? ' ' : dates[i] ? fmtDate(dates[i]) : i < idx ? '—' : ' '}</div>
        </div>
      ))}
    </div>
  );
}

const EVENT_TEXT = {
  created: () => 'Conteúdo criado',
  status_change: (h) => `${h.to_status === 'assimilation' ? 'Iniciou o estudo' : h.to_status === 'production' ? 'Concluiu o material de revisão' : h.to_status === 'review' ? 'Iniciou a revisão' : STATUS[h.to_status]?.short}${h.payload?.skipped ? ' (etapas anteriores registradas juntas)' : ''}`,
  review: (h) => `Ciclo ${h.payload.cycle} · Q/R-${h.payload.number}${h.payload.extra ? ' (extra)' : ''}: ${h.payload.correct}/${h.payload.questions} → ${fmtPct(h.payload.percent)}`,
  consolidated: (h) => `Consolidado (${fmtPct(h.payload?.percent)})`,
  cycle_locked: (h) => `Limite de ${h.payload.max} revisões atingido — rodízio`,
  cycle_released: (h) => `Novo ciclo liberado (ciclo ${h.payload.to_cycle}) · ${['mentor', 'staff', 'professora'].includes(h.payload.by) ? 'pela professora' : 'rodízio cumprido'}`,
  review_undone: (h) => `Revisão Q/R-${h.payload.number} desfeita (${h.payload.reason})`,
  material_updated: (h) => `Atualizou o material${h.payload?.note ? `: ${h.payload.note}` : ''} (etapa mantida)`,
  production: (h) => `Produziu material${h.payload?.kind ? ` (${PRODUCTION_KIND[h.payload.kind] || h.payload.kind})` : ''}`,
  production_removed: () => 'Registro de material removido',
  practice: (h) => `Questões avulsas: ${h.payload.correct}/${h.payload.questions}`,
  practice_removed: () => 'Registro de questões avulsas removido',
  extra_reviews_enabled: () => 'Professora liberou revisões extras',
  study_session: (h) => `Estudou ${fmtDur(h.payload.seconds)}${h.payload.activity && h.payload.activity !== 'study' ? ` · ${ACTIVITY[h.payload.activity]}` : ''} (${h.payload.source === 'timer' ? 'cronômetro' : 'registro manual'})`,
  study_session_removed: (h) => `Sessão de ${fmtDur(h.payload.seconds)} removida`,
  correction: (h) => `Correção da professora: ${STATUS[h.from_status]?.short} → ${STATUS[h.to_status]?.short} (${h.payload?.reason})`,
  renamed: (h) => `Renomeado de “${h.payload.from}” para “${h.payload.to}”${h.payload.via ? ' (retificação do edital)' : ''}`,
  archived: (h) => `Arquivado${h.payload?.via ? ' (retificação do edital)' : ''}`,
  unarchived: () => 'Restaurado',
};
const EVENT_KIND = { consolidated: 'k-consolidated', review: 'k-review', status_change: 'k-status', cycle_locked: 'k-lock', correction: 'k-status' };

export function HistoryItem({ h, showTopic }) {
  const text = (EVENT_TEXT[h.event_type] || (() => h.event_type))(h);
  return (
    <div className={`tl-item ${EVENT_KIND[h.event_type] || ''}`}>
      <div className="tl-date">{fmtDate(h.date)}{STAFF_ROLES.includes(h.actor_role) ? ` · por ${h.actor_name} (${ROLE_LABEL[h.actor_role]})` : ''}</div>
      <div className="small">{showTopic && <b>{h.subject_name} — {h.topic_name}: </b>}{text}</div>
    </div>
  );
}

function AdvanceModal({ topic, examId, onClose, onDone }) {
  const next = NEXT_STATUS[topic.status];
  const [date, setDate] = useState(todayLocal());
  const [target, setTarget] = useState(next);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const forward = STATUSES.slice(STATUSES.indexOf(topic.status) + 1, 4);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post(`/enrollments/${examId}/topics/${topic.id}/status`, { status: target, date });
      onDone(`${topic.name}: ${STATUS[target].short}.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={NEXT_ACTION[topic.status].label} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Confirmar'}</button></>}>
      <p className="ink2">{NEXT_ACTION[topic.status].confirm}</p>
      {target === 'production' && <div className="info-box">Material pronto (amarelo) NÃO significa “comecei a estudar”: significa que o material de revisão está <b>pronto</b>.</div>}
      {target === 'review' && <div className="info-box">A partir de agora o conteúdo entra no ciclo de revisões com questões. Cada revisão exige resolução de questões.</div>}
      <div className="field"><label>Data</label><input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /><span className="hint">Use uma data anterior se estiver migrando da planilha.</span></div>
      {forward.length > 1 && (
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Migrando da planilha? Avançar direto para outra etapa</summary>
          <div className="row wrap mt-sm">
            {forward.map((s) => <button key={s} className={`chip ${target === s ? 'on' : ''}`} onClick={() => setTarget(s)}><span className={`dot bg-${s}`} />{STATUS[s].short}</button>)}
          </div>
        </details>
      )}
      <p className="xs muted">No método APQR não existe retrocesso: depois de confirmar, só a sua professora pode corrigir.</p>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

function ReviewModal({ topic, row, settings, examId, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [c, setC] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const qn = Number(q);
  const cn = Number(c);
  const valid = Number.isInteger(qn) && Number.isInteger(cn) && q !== '' && c !== '' && qn >= settings.min_questions_per_review && cn >= 0 && cn <= qn && qn <= 500;
  const percent = q !== '' && c !== '' && qn > 0 && cn <= qn ? (cn / qn) * 100 : null;
  const consolidates = valid && cn * 100 > settings.consolidation_threshold * qn;
  const n = row.next_review_number;
  const save = async () => {
    setBusy(true); setErr(null);
    try { onDone(await api.post(`/enrollments/${examId}/topics/${topic.id}/reviews`, { questions: qn, correct: cn, date })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Registrar Q/R-${n} — ${topic.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!valid || busy} onClick={save}>{busy ? 'Salvando…' : `Salvar Q/R-${n}`}</button></>}>
      <div className="grid g2">
        <Field label="Questões resolvidas" hint={`Mínimo ${settings.min_questions_per_review}`}><input className="input num" inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} autoFocus /></Field>
        <Field label="Acertos"><input className="input num" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
      <Field label="Data da revisão"><input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="card card-pad" style={{ boxShadow: 'none', textAlign: 'center', background: consolidates ? 'var(--s-cons-soft)' : 'var(--surface-2)' }}>
        <div className="muted xs bold">PERCENTUAL CALCULADO</div>
        <div className="num" style={{ fontSize: 34, fontWeight: 750 }}>{percent == null ? '—' : fmtPct(percent)}</div>
        <div className="small ink2">
          {q !== '' && qn < settings.min_questions_per_review ? `Faltam ${settings.min_questions_per_review - qn} questões para o mínimo.` :
            c !== '' && cn > qn ? 'Acertos não podem ser maiores que as questões.' :
              percent == null ? 'Informe questões e acertos.' :
                consolidates ? 'Este resultado CONSOLIDA o conteúdo (acima de ' + settings.consolidation_threshold + '%).' :
                  n >= settings.max_reviews_per_cycle && !row.extra_reviews_allowed ? `Não consolida. Esta é a última revisão do ciclo: depois dela, avance para os demais conteúdos.` :
                    `Não consolida (precisa de MAIS de ${settings.consolidation_threshold}%). Q/R-${n + 1} ficará disponível.`}
        </div>
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

function MaterialModal({ examId, topic, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal title="Atualizei meu material" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await api.post(`/enrollments/${examId}/topics/${topic.id}/material-update`, { note: note || undefined }); onDone(); } catch (e) { toast.error(e); } finally { setBusy(false); } }}>Registrar</button></>}>
      <div className="info-box">Descobrir conteúdo novo nas questões e acrescentar ao resumo é <b>parte da consolidação</b>. O conteúdo continua em {STATUS[topic.status].short}.</div>
      <Field label="O que você acrescentou? (opcional)"><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: exceções da crase antes de pronomes" /></Field>
    </Modal>
  );
}

function UndoModal({ examId, topic, review, isAdmin, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Confirm title={`Desfazer Q/R-${review.number}?`} danger confirmLabel="Desfazer revisão" onClose={onClose}
      message={`Q/R-${review.number}: ${review.correct}/${review.questions} (${fmtPct(review.percent)}) em ${fmtDate(review.date)}. ${review.consolidated ? 'O conteúdo deixará de estar consolidado.' : ''}`}
      onConfirm={async () => { setErr(null); try { await api.post(`/enrollments/${examId}/topics/${topic.id}/reviews/undo`, { reason: reason || undefined }); onDone(); } catch (e) { setErr(e.message); } }}>
      {isAdmin ? <Field label="Motivo da correção (obrigatório)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        : <p className="xs muted">Você pode desfazer até {UNDO_WINDOW_MIN} minutos após o registro (para corrigir erro de digitação).</p>}
      {err && <div className="error-box">{err}</div>}
    </Confirm>
  );
}

function CorrectModal({ examId, topic, onClose, onDone }) {
  const [status, setStatus] = useState('not_started');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Confirm title="Corrigir etapa" confirmLabel="Aplicar correção" onClose={onClose}
      onConfirm={async () => { setErr(null); try { await api.post(`/enrollments/${examId}/topics/${topic.id}/correct-status`, { status, reason }); onDone(); } catch (e) { setErr(e.message); } }}>
      <p className="small ink2">Use para corrigir um clique errado do aluno. Só é possível quando o conteúdo ainda não tem revisões registradas. Fica no histórico.</p>
      <Field label="Nova etapa">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.slice(0, 4).filter((s) => s !== topic.status).map((s) => <option key={s} value={s}>{STATUS[s].short}</option>)}
        </select>
      </Field>
      <Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {err && <div className="error-box">{err}</div>}
    </Confirm>
  );
}

function PracticeModal({ examId, topic, onClose, onDone }) {
  const [f, setF] = useState({ questions: '', correct: '', date: todayLocal(), note: '' });
  const [err, setErr] = useState(null);
  return (
    <Confirm title="Questões avulsas" confirmLabel="Registrar" onClose={onClose}
      onConfirm={async () => { setErr(null); try { await api.post(`/enrollments/${examId}/practice`, { topic_id: topic.id, date: f.date, questions: Number(f.questions), correct: Number(f.correct), note: f.note || null }); onDone(); } catch (e) { setErr(e.message); } }}>
      <p className="small ink2">Treinos e simulados entram no seu desempenho em questões, mas <b>não mudam a etapa APQR</b> e não contam como revisão.</p>
      <div className="grid g2">
        <Field label="Questões"><input className="input" inputMode="numeric" value={f.questions} onChange={(e) => setF({ ...f, questions: e.target.value.replace(/\D/g, '') })} /></Field>
        <Field label="Acertos"><input className="input" inputMode="numeric" value={f.correct} onChange={(e) => setF({ ...f, correct: e.target.value.replace(/\D/g, '') })} /></Field>
      </div>
      <Field label="Data"><input type="date" className="input" value={f.date} max={todayLocal()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Observação (opcional)"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex.: simulado banca X" /></Field>
      {err && <div className="error-box">{err}</div>}
    </Confirm>
  );
}


function ProductionModal({ examId, topic, onClose, onDone }) {
  const [f, setF] = useState({ kind: 'resumo', note: '', date: todayLocal() });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { onDone(await api.post(`/enrollments/${examId}/topics/${topic.id}/productions`, { kind: f.kind, note: f.note || undefined, date: f.date })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Registrar material produzido" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Registrar'}</button></>}>
      <p className="small ink2">A produção do material (P) é o que prepara a revisão. Registrar o material <b>não muda a etapa</b> — quando ele estiver pronto, marque “Material pronto”.</p>
      <Field label="Tipo de material">
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.entries(PRODUCTION_KIND).map(([k, v]) => <button key={k} type="button" className={`chip ${f.kind === k ? 'on' : ''}`} onClick={() => setF({ ...f, kind: k })}>{v}</button>)}
        </div>
      </Field>
      <Field label="Data"><input type="date" className="input" value={f.date} max={todayLocal()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Observação (opcional)"><input className="input" maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Ex.: resumo das classes de antibióticos" /></Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
