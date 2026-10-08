import { useState } from 'react';
import { BrandSymbol } from '../components/Brand.jsx';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Compass } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useExam, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { STATUS, STATUSES, fmtDate } from '../lib/format.js';
import { Async } from '../components/ui.jsx';
import { RoutineEditor } from './Routine.jsx';

const STEPS = ['Boas-vindas', 'Método APQR', 'Sua semana', 'Pronto'];

/** Primeiro acesso do aluno: apresenta o edital, o método (com as regras vigentes) e a rotina. */
export default function Onboarding() {
  const { user, setUser } = useAuth();
  const { active, examId } = useExam();
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const finish = async () => {
    try {
      const r = await api.patch('/auth/profile', { onboarding_done: true });
      setUser(r.user);
      nav('/', { replace: true });
    } catch (e) { toast.error(e); }
  };
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const tenantName = user.tenant?.brand?.display_name || user.tenant?.name;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="content" style={{ maxWidth: 820 }}>
        <div className="row between mb">
          <div className="row"><BrandSymbol size={38} /><b>{tenantName || 'Método APQR'}</b></div>
          <button className="btn btn-ghost btn-sm" onClick={finish}>Pular</button>
        </div>
        <ol className="row wrap mb" style={{ gap: 6, listStyle: 'none', padding: 0 }} aria-label="Etapas">
          {STEPS.map((s, i) => (
            <li key={s} className="tag" aria-current={i === step ? 'step' : undefined} style={{ background: i === step ? 'var(--brand)' : undefined, color: i === step ? '#fff' : undefined, opacity: i < step ? 0.6 : 1 }}>{i + 1}. {s}</li>
          ))}
        </ol>
        <div className="card card-pad">
          {step === 0 && (
            <div className="stack">
              <div className="eyebrow">Bem-vindo(a)</div>
              <h1>Olá, {user.name.split(' ')[0]}!</h1>
              <p className="ink2">Aqui você acompanha seus estudos pelo Método APQR{tenantName ? `, junto com ${tenantName}` : ''}. Em qualquer momento você vai conseguir responder quatro perguntas: <b>o que eu fiz, onde estou, o que falta e o que devo fazer agora</b>.</p>
              {active?.length ? (
                <div className="stack-sm">
                  <div className="xs muted bold">SEU{active.length > 1 ? 'S' : ''} EDITA{active.length > 1 ? 'IS' : 'L'}</div>
                  {active.map((e) => (
                    <div key={e.id} className="row card card-pad" style={{ boxShadow: 'none', gap: 12 }}>
                      <BookOpen size={20} aria-hidden="true" style={{ color: 'var(--brand)' }} />
                      <div><b>{e.name}</b><div className="xs muted">{[e.role_title, e.board, e.exam_date ? `Prova em ${fmtDate(e.exam_date)}` : null].filter(Boolean).join(' · ') || 'Edital da mentoria'}</div></div>
                    </div>
                  ))}
                </div>
              ) : <div className="info-box">Sua professora ainda vai vincular você a um edital. Você já pode conhecer o método e montar sua rotina.</div>}
              <div className="row"><button className="btn btn-primary" onClick={next}>Continuar <ArrowRight size={16} aria-hidden="true" /></button></div>
            </div>
          )}
          {step === 1 && <MethodStep examId={examId} onNext={next} />}
          {step === 2 && (
            <div className="stack">
              <h2 className="row" style={{ gap: 8 }}><CalendarDays size={22} aria-hidden="true" />Mapa de Rotinas</h2>
              <p className="muted">Monte sua semana típica. Os blocos de ESTUDO mostram sua carga horária potencial. Não é um cronograma obrigatório — você pode mudar quando quiser.</p>
              <RoutineStep />
              <div className="row"><button className="btn btn-primary" onClick={next}>Continuar <ArrowRight size={16} aria-hidden="true" /></button></div>
            </div>
          )}
          {step === 3 && (
            <div className="stack" style={{ alignItems: 'flex-start' }}>
              <CheckCircle2 size={36} aria-hidden="true" style={{ color: 'var(--good)' }} />
              <h2>Tudo pronto</h2>
              <p className="ink2">Na tela <b>Hoje</b> você vê sempre o próximo passo sugerido. Sugestões são orientações: quem decide o que estudar é você, com a sua professora.</p>
              <button className="btn btn-primary btn-lg" onClick={finish}><Compass size={18} aria-hidden="true" />Ir para o meu painel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MethodStep({ examId, onNext }) {
  const state = useAsync(() => (examId ? api.get(`/enrollments/${examId}/topics`) : Promise.resolve({ settings: null })), [examId]);
  return (
    <div className="stack">
      <h2>Como funciona o APQR</h2>
      <div className="stack-sm">
        {STATUSES.map((s) => (
          <div key={s} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <span className={`dot bg-${s}`} style={{ width: 14, height: 14, marginTop: 4, flexShrink: 0 }} aria-hidden="true" />
            <div><b>{STATUS[s].label}</b><div className="small ink2">{STATUS[s].desc}</div></div>
          </div>
        ))}
      </div>
      <Async state={state} compact>
        {({ settings: st }) => (
          <div className="info-box small">
            <b>Regras importantes:</b> você muda a etapa manualmente, e só para frente. {st
              ? <>Para consolidar, uma revisão precisa ter acerto <b>acima de {st.consolidation_threshold}%</b> (exatamente {st.consolidation_threshold}% não consolida), com no mínimo {st.min_questions_per_review} questões. São no máximo {st.max_reviews_per_cycle} revisões por ciclo — depois disso, avance pelos demais conteúdos do edital (rodízio).</>
              : <>Para consolidar, uma revisão precisa ter acerto acima do percentual definido pela sua professora, com um número mínimo de questões. Há um limite de revisões por ciclo — depois dele, avance pelos demais conteúdos (rodízio).</>} Atualizar o material durante a revisão é normal e não muda a etapa.
            {!st && <div className="xs muted mt-sm">Os valores exatos são definidos pela sua professora e aparecem aqui quando você estiver em um edital.</div>}
          </div>
        )}
      </Async>
      <div className="row"><button className="btn btn-primary" onClick={onNext}>Continuar <ArrowRight size={16} aria-hidden="true" /></button></div>
    </div>
  );
}

function RoutineStep() {
  const state = useAsync(() => api.get('/me/routine'), []);
  return <Async state={state} compact>{({ routine }) => <RoutineEditor routine={routine} compact onSaved={() => state.reload({ silent: true })} />}</Async>;
}
