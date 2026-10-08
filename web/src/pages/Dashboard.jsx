import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen, CalendarCheck, CheckCircle2, ChevronRight, Clock, Compass, Flag, Layers, Lightbulb, Map, PenLine, RefreshCcw, Sparkles, Target, Timer,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate, fmtDur, fmtPct, plural } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Alert, ApqrLegend, Async, Card, DistBar, Empty, Stat } from '../components/ui.jsx';
import { HoursChart, SubjectApqrBars } from '../components/Charts.jsx';
import { useTopicDrawer } from '../components/TopicDrawer.jsx';
import { InstallBanner, ReviseCard } from '../components/Brand.jsx';
import { NextEvent } from './Agenda.jsx';
import { ChamaShields, WeekCard } from './Pacto.jsx';

export function NoExam() {
  return (
    <Page title="Bem-vindo">
      <div className="card"><Empty icon={BookOpen} title="Você ainda não está em nenhum edital">Sua professora vai vincular você a um edital. Assim que isso acontecer, seu plano de estudos aparece aqui.</Empty></div>
    </Page>
  );
}

/** Avisos dentro do app: vencimento em 7 dias, bônus, Ajuste de Rota pronto, diagnóstico pendente. */
function Notices() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  useEffect(() => { api.get('/me/notices').then((r) => setList(r.notices || [])).catch(() => {}); }, []);
  if (!list.length) return null;
  const renew = user?.tenant?.brand?.renew_url;
  return (
    <div className="stack-sm" role="region" aria-label="Avisos">
      {list.map((n) => (
        <div key={n.kind} className={`notice notice-${n.tone}`}>
          <span>{n.text}</span>
          {n.action && (n.action.to === 'renew'
            ? (renew && <a className="btn btn-sm" href={renew} target="_blank" rel="noopener noreferrer">{n.action.label}</a>)
            : <Link className="btn btn-sm" to={n.action.to}>{n.action.label}</Link>)}
        </div>
      ))}
    </div>
  );
}

/** Links dos 2 grupos de WhatsApp da turma (avisos e alunos). A entrada é aprovada no próprio WhatsApp. */
function CohortLinks() {
  const [c, setC] = useState(null);
  useEffect(() => { api.get('/me/cohort').then((r) => setC(r.cohort)).catch(() => {}); }, []);
  if (!c || (!c.notices_url && !c.students_url)) return null;
  return (
    <section className="card card-pad row between wrap" style={{ gap: 12 }} aria-label="Grupos da turma">
      <div><b>Turma {c.name}</b><div className="xs muted">Entre nos grupos de WhatsApp. A equipe aprova a sua entrada.</div></div>
      <div className="row wrap" style={{ gap: 8 }}>
        {c.notices_url && <a className="btn btn-sm" href={c.notices_url} target="_blank" rel="noopener noreferrer">Grupo de avisos</a>}
        {c.students_url && <a className="btn btn-sm" href={c.students_url} target="_blank" rel="noopener noreferrer">Grupo de alunos</a>}
      </div>
    </section>
  );
}

/** Resumo do pacto no topo do Hoje: semana atual, Chama e Escudos; leva ao Mês colorido. */
function PactoStrip() {
  const [p, setP] = useState(null);
  useEffect(() => { api.get('/me/pacto').then((r) => setP(r.pacto)).catch(() => setP(false)); }, []);
  if (!p) return null;
  const w = p.current;
  return (
    <section className="card card-pad" aria-label="Pacto de estudo da semana">
      <div className="row between wrap" style={{ gap: 12 }}>
        <ChamaShields p={p} compact />
        <Link className="btn btn-sm" to="/pacto">{p.has_pacto ? 'Ver mês colorido' : 'Definir meu pacto'}</Link>
      </div>
      {w ? (
        <div className="mt-sm"><WeekCard w={w} /></div>
      ) : (
        <p className="small ink2 mt-sm">{p.reminders[0]?.text || 'Defina seu pacto de estudo da semana.'}</p>
      )}
      {p.suggestion && p.editable.current && <p className="small mt-sm">{p.suggestion.reason} <Link to="/pacto">Ajustar pacto</Link></p>}
    </section>
  );
}

export default function Dashboard() {
  const { examId, exams } = useExam();
  if (exams && !examId) return <NoExam />;
  if (!examId) return <Page title="Hoje"><div className="skeleton" style={{ height: 300 }} /></Page>;
  return <DashboardView examId={examId} />;
}

export function DashboardView({ examId, embedded }) {
  const { version } = useData();
  const state = useAsync(() => api.get(`/enrollments/${examId}/dashboard`), [examId, version]);
  const body = <Async state={state}>{(d) => <DashboardBody d={d} embedded={embedded} />}</Async>;
  return embedded ? body : <Page topbar>{body}</Page>;
}

const KIND_ICON = { review: RefreshCcw, continue: PenLine, new: Flag, low: Target, ready: Layers };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function DashboardBody({ d, embedded }) {
  const { summary: s, week, suggestions, insights, last14, subjects, settings } = d;
  const { user } = useAuth();
  const drawer = useTopicDrawer();
  const nav = useNavigate();
  const goFilter = (st) => !embedded && nav(`/edital?status=${st}`);
  const first = suggestions.items[0];
  const rest = suggestions.items.slice(1);
  const pending = s.total_topics - s.counts.consolidated;
  const [more, setMore] = useState(false);
  const FirstIcon = first ? KIND_ICON[first.kind] || Compass : Compass;
  // O alerta de matéria parada só aparece quando fala de OUTRA matéria que a recomendação acima.
  const neglected = suggestions.neglected_subject && suggestions.neglected_subject.id !== first?.subject_id ? suggestions.neglected_subject : null;
  const showPonderado = s.apqr_progress != null && Math.abs((s.apqr_progress ?? 0) - (s.consolidated_percent ?? 0)) >= 0.1;
  return (
    <div className="stack" style={{ gap: 20 }}>
      {!embedded && (
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <div className="eyebrow">Hoje</div>
            <h1>{greeting()}, {user?.name?.split(' ')[0]}.</h1>
            <p>{s.last_activity ? `Última atividade em ${fmtDate(s.last_activity, { year: false })}.` : 'Vamos começar? Escolha o primeiro conteúdo abaixo.'}</p>
          </div>
          {s.days_to_exam != null && s.days_to_exam >= 0 && (
            <Link to="/edital" className="countdown-card" aria-label={`${plural(s.days_to_exam, 'dia', 'dias')} para a prova. Abrir meu edital`}>
              <span className="countdown-ico" aria-hidden="true"><CalendarCheck size={22} /></span>
              <span><b className="num">{s.days_to_exam}</b><span className="countdown-txt">{s.days_to_exam === 1 ? 'dia' : 'dias'}<br />para a prova</span></span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {!embedded && <InstallBanner />}
      {!embedded && <NextEvent />}
      {!embedded && <Notices />}
      {!embedded && <PactoStrip />}
      {!embedded && <CohortLinks />}

      {/* 1. O que devo fazer agora? */}
      <section className="card card-pad" style={{ borderLeft: '4px solid var(--brand-2)' }} aria-labelledby="now-title">
        <div className="eyebrow" id="now-title">{embedded ? 'Próximo passo sugerido ao aluno' : 'O que fazer agora'}</div>
        {first ? (
          <div className="row wrap" style={{ gap: 16, alignItems: 'center', marginTop: 8 }}>
            <div className="sugg-icon" aria-hidden="true" style={{ width: 48, height: 48 }}><FirstIcon size={22} /></div>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div className="sugg-kind">{first.title}</div>
              <h2 style={{ margin: '2px 0 4px' }}>{first.topic_name}</h2>
              <div className="small ink2">{first.subject_name}</div>
              <div className="sugg-reasons">{first.reasons.map((r) => <span key={r}>{r}</span>)}</div>
            </div>
            {!embedded && (
              <button className="btn btn-primary btn-lg" onClick={() => drawer.open(first.topic_id, { intent: first.action === 'review' ? 'review' : null })}>
                {first.action === 'review' ? <><RefreshCcw size={18} aria-hidden="true" />Registrar revisão</> : <><Timer size={18} aria-hidden="true" />Começar</>}
              </button>
            )}
          </div>
        ) : (
          <Empty icon={CheckCircle2} title="Nada pendente por aqui">{s.total_topics ? 'Todos os conteúdos estão consolidados ou aguardando o rodízio.' : 'Sua professora ainda não cadastrou conteúdos neste edital.'}</Empty>
        )}
        {rest.length > 0 && (
          <div className="mt">
            <div className="xs muted bold" style={{ letterSpacing: '.04em' }}>DEPOIS</div>
            {rest.map((it) => {
              const Icon = KIND_ICON[it.kind] || Compass;
              return (
                <div key={`${it.kind}-${it.topic_id}`} className="sugg">
                  <div className="sugg-icon" aria-hidden="true"><Icon size={18} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sugg-kind">{it.title}</div>
                    <div className="sugg-title">{it.subject_name} — {it.topic_name}</div>
                    <div className="sugg-reasons">{it.reasons.map((r) => <span key={r}>{r}</span>)}</div>
                  </div>
                  {!embedded && <button className="btn btn-sm" onClick={() => drawer.open(it.topic_id, { intent: it.action === 'review' ? 'review' : null })}>{it.action === 'review' ? 'Revisar' : 'Abrir'}</button>}
                </div>
              );
            })}
          </div>
        )}
        {(suggestions.rotation || neglected) && (
          <div className="stack-sm mt">
            {suggestions.rotation && <Alert tone="info">{suggestions.rotation.message}</Alert>}
            {neglected && (
              <Alert tone="warning">
                {neglected.message} Se quiser equilibrar o estudo{embedded ? '' : <>, <Link to={`/edital?subject=${neglected.id}`}>veja os conteúdos dela</Link></>}.
              </Alert>
            )}
          </div>
        )}
        {suggestions.note && <p className="xs muted mt-sm">{suggestions.note}</p>}
      </section>

      {/* 2. Onde estou? */}
      <section className="card card-pad" aria-labelledby="where-title">
        <div className="row between wrap" style={{ alignItems: 'baseline' }}>
          <div className="eyebrow" id="where-title">{embedded ? 'Posição no edital' : 'Onde estou no edital'}</div>
          {!embedded && <Link className="small" to="/edital"><Map size={14} aria-hidden="true" /> Abrir meu edital</Link>}
        </div>
        <div className="row wrap" style={{ gap: 28, alignItems: 'flex-end', margin: '10px 0 14px' }}>
          <div><div className="stat-value num">{fmtPct(s.consolidated_percent, 1)}</div><div className="xs muted">{s.counts.consolidated} de {s.total_topics} conteúdos consolidados</div></div>
          {showPonderado && <div><div className="stat-value num" style={{ fontSize: 22 }}>{fmtPct(s.apqr_progress, 1)}</div><div className="xs muted">progresso APQR ponderado</div></div>}
        </div>
        <DistBar counts={s.counts} total={s.total_topics} large />
        <div className="kpi-inline mt" style={{ justifyContent: 'space-between', rowGap: 12 }}>
          {['not_started', 'assimilation', 'production', 'review', 'consolidated'].map((st) => (
            <button key={st} onClick={() => goFilter(st)} style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', cursor: embedded ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', color: 'inherit' }}>
              <b className="row" style={{ gap: 6 }}><span className={`dot bg-${st}`} />{s.counts[st]}</b>
              <span className="xs muted">{{ consolidated: 'Consolidados', review: 'Em revisão', production: 'Material pronto', assimilation: 'Em assimilação', not_started: 'Não iniciados' }[st]}</span>
            </button>
          ))}
        </div>
        <div className="mt-sm"><ApqrLegend compact /></div>
      </section>

      {/* 3. O que eu fiz? (últimos 7 dias) */}
      <div>
        <div className="eyebrow" style={{ marginBottom: 8 }}>{embedded ? 'Últimos 7 dias' : 'O que eu fiz nos últimos 7 dias'}</div>
        <div className="grid g4">
          <Stat icon={Clock} label="Horas de estudo" value={fmtDur(week.study_seconds)} sub={`${plural(week.study_days, 'dia estudado', 'dias estudados')}`} />
          <Stat icon={Target} label="Questões" value={week.questions.toLocaleString('pt-BR')} sub={week.questions ? `${fmtPct(week.accuracy, 1)} de acertos` : 'Nenhuma questão registrada'} />
          <Stat icon={PenLine} label="Materiais produzidos" value={week.productions} sub="Resumos, mapas, flashcards…" />
          <Stat icon={CalendarCheck} label="Sequência" value={plural(s.streak, 'dia', 'dias')} sub={`Total no edital: ${fmtDur(s.study_seconds)}`} />
        </div>
      </div>

      {/* 4. Detalhes (no celular começam recolhidos para a página não ficar longa) */}
      {!embedded && (
        <button className="btn btn-sm only-mobile" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(!more)} aria-expanded={more}>
          {more ? 'Ocultar detalhes' : 'Ver mais detalhes'}
        </button>
      )}
      <div className={`stack ${more || embedded ? '' : 'hide-mobile'}`} style={{ gap: 20 }}>
      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Card title="O que falta" icon={Flag}>
          <div className="stack-sm">
            <div className="row between small"><span>Conteúdos ainda não consolidados</span><b className="num">{pending}</b></div>
            <div className="row between small"><span>Não iniciados</span><b className="num">{s.counts.not_started}</b></div>
            <div className="row between small"><span>Revisões disponíveis agora</span><b className="num">{s.reviews_available}</b></div>
            {s.locked_topics > 0 && <div className="row between small"><span>Conteúdos aguardando rodízio</span><b className="num">{s.locked_topics}</b></div>}
            <p className="xs muted">Consolidar exige uma revisão com pelo menos {settings.min_questions_per_review} questões e acerto acima de {settings.consolidation_threshold}%.</p>
          </div>
        </Card>
        <Card title="Insights" icon={Lightbulb} action={!embedded && <Link className="small" to="/evolucao">Ver evolução</Link>}>
          {insights.length === 0 ? <p className="muted small">Os insights aparecem conforme você registra estudos, revisões e questões.</p> : insights.map((i) => (
            <div key={i.text} className={`insight ${i.tone}`}><span className="i-mark" /><span>{i.text}</span></div>
          ))}
        </Card>
      </div>

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Card title="Horas nos últimos 14 dias" subtitle="Horas medem esforço, não domínio.">
          <HoursChart daily={last14} height={200} />
        </Card>
        <Card title="Progresso por matéria" action={!embedded && <Link className="small" to="/edital">Abrir edital</Link>}>
          <SubjectApqrBars subjects={subjects} />
        </Card>
      </div>
      </div>
      {!embedded && (
        <Link to="/conteudos" className="card card-pad row" style={{ gap: 12, color: 'inherit', textDecoration: 'none' }}>
          <Sparkles size={20} aria-hidden="true" style={{ color: 'var(--brand)' }} />
          <div style={{ flex: 1 }}><b>Materiais</b><div className="xs muted">Aulas, PDFs e links da sua professora.</div></div>
        </Link>
      )}
      {!embedded && <ReviseCard dismissible />}
    </div>
  );
}
