import CadastroEditor from '../../components/CadastroEditor.jsx';
import Accesses from '../../components/Accesses.jsx';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarClock, FileText, KeyRound, Mail, MapPin, MessageCircle, Phone, Plus, Power, RefreshCcw, StickyNote, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { FixedExamScope, useAuth, useData, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDateTime, fmtDur, fmtPct, plural } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Alert, Async, Avatar, Card, Confirm, Empty, Field, Modal, Stat, Tabs } from '../../components/ui.jsx';
import { HistoryItem, TopicDrawerProvider } from '../../components/TopicDrawer.jsx';
import { DiagnosticList, LinkBox, SevBadge, WeekBars, useEditais } from '../../components/teacher.jsx';
import { DashboardView } from '../Dashboard.jsx';
import { EditalView } from '../Edital.jsx';
import { StudiesView } from '../Studies.jsx';
import { AnalyticsView } from '../Analytics.jsx';
import { RoutineEditor } from '../Routine.jsx';
import ConsultoriaStaff from './ConsultoriaStaff.jsx';
import { AiReport } from '../../components/AiReport.jsx';
import { waLink } from '../../lib/whatsapp.js';

const TABS = [
  { value: 'overview', label: 'Visão geral' }, { value: 'edital', label: 'Edital (APQR)' }, { value: 'hours', label: 'Horas' },
  { value: 'analytics', label: 'Evolução' }, { value: 'ai', label: 'Relatório IA' }, { value: 'history', label: 'Histórico' }, { value: 'routine', label: 'Rotina' },
  { value: 'consultoria', label: 'Consultoria' }, { value: 'notes', label: 'Anotações' }, { value: 'account', label: 'Cadastro' },
];

export default function StudentXray() {
  const { id } = useParams();
  const { version } = useData();
  const state = useAsync(() => api.get(`/teacher/students/${id}/xray`), [id, version]);
  return (
    <Page topbar={false}>
      <div className="row mb"><Link to="/professora/alunos" className="small row" style={{ gap: 4 }}><ArrowLeft size={15} aria-hidden="true" />Alunos</Link></div>
      <Async state={state}>{(d) => <XrayBody d={d} reload={() => state.reload({ silent: true })} />}</Async>
    </Page>
  );
}

function XrayBody({ d, reload }) {
  const { student: s, indicators, enrollments } = d;
  const active = enrollments.filter((e) => e.status === 'active');
  const [eid, setEid] = useState(active[0]?.id || null);
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(sp.get('aba') || 'overview');
  const ind = indicators.find((x) => x.enrollment_id === eid) || null;
  const exam = active.find((e) => e.id === eid);
  const wa = waLink(s.phone, `Olá, ${s.name.split(' ')[0]}! Aqui é da equipe da Prof. Pollyana Lyra. Tudo bem?`);
  const statusTag = { active: ['Ativo', 'good'], invited: ['Convite pendente', 'warning'], disabled: ['Desativado', ''] }[s.status] || [s.status, ''];
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <Avatar name={s.name} size="lg" photo={s.photo_file_id} />
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <div className="eyebrow">Raio-X do aluno</div>
            <h1 style={{ margin: '2px 0 6px' }}>{s.name}</h1>
            <div className="row wrap small ink2" style={{ gap: 14 }}>
              <span className={`tag ${statusTag[1]}`}>{statusTag[0]}</span>
              <span className="row" style={{ gap: 5 }}><Mail size={14} aria-hidden="true" />{s.email}</span>
              {s.phone && <span className="row" style={{ gap: 5 }}><Phone size={14} aria-hidden="true" />{s.phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3')}</span>}
              {s.city && <span className="row" style={{ gap: 5 }}><MapPin size={14} aria-hidden="true" />{s.city}/{s.state}</span>}
            </div>
            <div className="xs muted mt-sm">
              {s.goal ? `Objetivo: ${s.goal} · ` : ''}Último acesso: {s.last_login_at ? fmtDateTime(s.last_login_at) : 'nunca'}{s.access_until ? ` · Acesso até ${fmtDate(s.access_until)}` : ''}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
            {ind?.severity && <SevBadge severity={ind.severity} />}
            {wa
              ? <a className="btn btn-sm" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" />WhatsApp</a>
              : <button className="btn btn-sm" disabled title="Telefone ausente ou inválido. Corrija na aba Cadastro."><MessageCircle size={15} aria-hidden="true" />WhatsApp</button>}
            <button className="btn btn-sm" onClick={() => setTab('notes')}><StickyNote size={15} aria-hidden="true" />Anotação rápida</button>
          </div>
        </div>
      </section>

      {active.length === 0 ? (
        <div className="card"><Empty icon={BookOpen} title="Aluno sem edital" action={<button className="btn btn-primary" onClick={() => setTab('account')}>Vincular a um edital</button>}>Vincule o aluno a um edital para ele começar a registrar os estudos.</Empty></div>
      ) : (
        <>
          {active.length > 1 && (
            <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Edital">
              {active.map((e) => <button key={e.id} className={`chip ${eid === e.id ? 'on' : ''}`} onClick={() => setEid(e.id)}>{e.edital_name}</button>)}
            </div>
          )}
          {ind && <p className="xs muted" style={{ margin: '0 0 -8px' }}>Indicadores e diagnóstico calculados só com os registros de <b>{ind.edital_name}</b>.</p>}
          {ind && <IndicatorStrip ind={ind} />}
          {ind && (
            <Card title="Diagnóstico" subtitle="Regras fixas aplicadas aos registros do aluno. Cada item mostra os números que o justificam.">
              <DiagnosticList items={ind.diagnostics} />
            </Card>
          )}
        </>
      )}

      <Tabs value={tab} onChange={setTab} options={TABS.filter((t) => active.length || ['notes', 'account', 'routine', 'consultoria'].includes(t.value))} />
      <div>
        {exam && ['overview', 'edital', 'hours', 'analytics', 'history', 'ai'].includes(tab) && (
          <FixedExamScope exam={{ id: exam.id, name: exam.edital_name }}>
            <TopicDrawerProvider>
            {tab === 'overview' && <DashboardView examId={exam.id} embedded />}
            {tab === 'edital' && <><p className="small muted mb">Clique em um conteúdo para ver o histórico completo. Correções de etapa, desfazer revisão e liberar novo ciclo ficam registrados.</p><EditalView examId={exam.id} /></>}
            {tab === 'hours' && <StudiesView examId={exam.id} readOnly />}
            {tab === 'analytics' && <AnalyticsView examId={exam.id} />}
            {tab === 'history' && <HistoryTab eid={exam.id} />}
            {tab === 'ai' && <AiReport key={exam.id} enrollmentId={exam.id} />}
            <div className="row mt"><Link className="btn btn-sm" to={`/professora/relatorio/${exam.id}`}><FileText size={15} aria-hidden="true" />Relatório para imprimir</Link></div>
            </TopicDrawerProvider>
          </FixedExamScope>
        )}
        {tab === 'routine' && <RoutineTab studentId={s.id} />}
        {tab === 'consultoria' && <ConsultoriaStaff studentId={s.id} />}
        {tab === 'notes' && <NotesTab studentId={s.id} />}
        {tab === 'account' && <AccountTab d={d} reload={reload} />}
      </div>
    </div>
  );
}

function IndicatorStrip({ ind }) {
  return (
    <div className="grid g4">
      <Stat label="Consolidação" value={fmtPct(ind.consolidation_pct, 1)} sub={`${ind.counts.consolidated} de ${ind.topics_total} conteúdos`} />
      <Stat label="Constância" value={ind.constancy ?? '—'} sub={ind.constancy == null ? `Aluno novo (${plural(ind.days_enrolled, 'dia', 'dias')})` : `${ind.active_days_28} dias ativos em 4 semanas`} trend={<WeekBars weeks={ind.weeks} />} />
      <Stat label="Evolução (4 semanas)" value={ind.evolution_pp == null ? '—' : `${ind.evolution_pp > 0 ? '+' : ''}${ind.evolution_pp.toLocaleString('pt-BR')} p.p.`} sub={`${ind.consolidated_delta >= 0 ? '+' : ''}${ind.consolidated_delta} consolidados · ${ind.reviewed_topics_delta >= 0 ? '+' : ''}${ind.reviewed_topics_delta} revisados`} />
      <Stat label="Últimas 4 semanas" value={fmtDur(ind.study_seconds_28)} sub={ind.questions_28 ? `${ind.questions_28} questões · ${fmtPct(ind.accuracy_28, 1)}` : 'Nenhuma questão'} />
    </div>
  );
}

function HistoryTab({ eid }) {
  const state = useAsync(() => api.get(`/enrollments/${eid}/history?limit=200`), [eid]);
  return (
    <Card title="Histórico do aluno" subtitle="Tudo o que foi registrado, em ordem cronológica inversa.">
      <Async state={state} compact>{({ history }) => history.length === 0 ? <p className="muted small">Sem registros.</p> : <div className="timeline">{history.map((h) => <HistoryItem key={h.id} h={h} showTopic />)}</div>}</Async>
    </Card>
  );
}

function RoutineTab({ studentId }) {
  const state = useAsync(() => api.get(`/teacher/students/${studentId}/routine`), [studentId]);
  return <Async state={state}>{({ routine }) => routine.blocks.length ? <RoutineEditor routine={routine} readOnly /> : <div className="card"><Empty icon={CalendarClock} title="Rotina não preenchida">O aluno ainda não montou o Mapa de Rotinas.</Empty></div>}</Async>;
}

function NotesTab({ studentId }) {
  const state = useAsync(() => api.get(`/teacher/students/${studentId}/notes`), [studentId]);
  const { user } = useAuth();
  const toast = useToast();
  const [body, setBody] = useState('');
  const [del, setDel] = useState(null);
  return (
    <Card title="Anotações da mentoria" icon={StickyNote} subtitle="Visíveis só para a professora e a equipe. O aluno não vê.">
      <div className="stack-sm">
        <textarea className="textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ex.: conversamos sobre a rotina; vai priorizar Farmacologia nas próximas 2 semanas." aria-label="Nova anotação" />
        <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={!body.trim()} onClick={async () => {
          try { await api.post(`/teacher/students/${studentId}/notes`, { body }); setBody(''); state.reload({ silent: true }); } catch (e) { toast.error(e); }
        }}><Plus size={15} aria-hidden="true" />Adicionar anotação</button>
      </div>
      <Async state={state} compact>
        {({ notes }) => (
          <div className="mt">
            {notes.length === 0 && <p className="small muted">Nenhuma anotação ainda.</p>}
            {notes.map((n) => (
              <div key={n.id} className="row between" style={{ padding: '10px 0', borderTop: '1px solid var(--border)', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}><div className="xs muted">{fmtDateTime(n.created_at)} · {n.author_name}</div><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div></div>
                {(n.author_id === user.id || user.role !== 'mentor') && <button className="btn btn-ghost btn-sm" aria-label="Excluir anotação" onClick={() => setDel(n)}><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
        )}
      </Async>
      {del && <Confirm title="Excluir anotação?" danger confirmLabel="Excluir" onClose={() => setDel(null)} message="A anotação deixa de aparecer."
        onConfirm={async () => { try { await api.del(`/teacher/notes/${del.id}`); setDel(null); state.reload({ silent: true }); } catch (e) { toast.error(e); } }} />}
    </Card>
  );
}

function AccountTab({ d, reload }) {
  const { student: s, enrollments } = d;
  const { user } = useAuth();
  const toast = useToast();
  const { bump } = useData();
  const editais = useEditais();
  const [modal, setModal] = useState(null);
  const [hasAcc, setHasAcc] = useState(false);
  const isTeacher = user.role !== 'mentor';
  const patch = async (body, msg) => { try { await api.patch(`/teacher/students/${s.id}`, body); toast.success(msg); bump(); } catch (e) { toast.error(e); } };
  const active = enrollments.filter((e) => e.status === 'active');
  const available = (editais.data?.editais || []).filter((e) => !active.some((a) => a.edital_id === e.id));
  return (
    <div className="grid g2">
      <Card title="Editais vinculados" icon={BookOpen}>
        {active.length === 0 && <p className="small muted">Nenhum edital.</p>}
        {active.map((e) => (
          <div key={e.id} className="row between small" style={{ padding: '8px 0', borderTop: '1px solid var(--border)' }}>
            <span>{e.edital_name} <span className="muted xs">· desde {fmtDate(e.created_at.slice(0, 10))}</span></span>
            <button className="btn btn-ghost btn-sm" onClick={() => setModal({ unenroll: e })}>Desvincular</button>
          </div>
        ))}
        {available.length > 0 && (
          <div className="row mt-sm" style={{ gap: 6 }}>
            <select className="select input-sm" id="enroll-select" defaultValue="" aria-label="Edital para vincular">
              <option value="" disabled>Vincular a outro edital…</option>
              {available.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button className="btn btn-sm" onClick={async () => {
              const v = document.getElementById('enroll-select').value;
              if (!v) return;
              try { await api.post(`/teacher/students/${s.id}/enrollments`, { edital_id: v }); toast.success('Aluno vinculado ao edital.'); bump(); } catch (e) { toast.error(e); }
            }}>Vincular</button>
          </div>
        )}
      </Card>

      <Card title="Método" icon={RefreshCcw}>
        <label className="check">
          <input type="checkbox" checked={!!s.extra_reviews_allowed} disabled={!isTeacher} onChange={(e) => setModal({ extra: e.target.checked })} />
          <span><b>Permitir revisões extras</b><br /><span className="xs muted">Depois do limite de {d.settings.max_reviews_per_cycle} revisões do ciclo, o aluno pode continuar revisando sem esperar o rodízio. Não muda o critério de consolidação.</span></span>
        </label>
        {!isTeacher && <p className="xs muted mt-sm">Somente a professora altera esta opção.</p>}
      </Card>

      {!hasAcc && <Card title="Plano na mentoria" icon={CalendarClock}>
        <div className="stack-sm">
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="row" style={{ gap: 8 }}>
              <span className={`eng-badge ${s.plan === 'ended' ? 'eng-ended-soft' : 'eng-active-soft'}`}>{s.plan === 'ended' ? 'Plano encerrado' : 'Plano ativo'}</span>
              {s.cohort && <span className="small">{s.cohort}</span>}
            </span>
            {isTeacher && (s.plan === 'ended'
              ? <span className="xs muted">Para reativar, informe uma nova data de fim abaixo.</span>
              : <button className="btn btn-sm btn-ghost" onClick={() => setModal({ endPlan: true })}>Encerrar plano</button>)}
          </div>
          {(s.legacy_class || s.legacy_last_login) && (
            <p className="xs muted" style={{ margin: 0 }}>Veio da plataforma anterior{s.legacy_class ? ` · turma "${s.legacy_class}"` : ''}{s.legacy_last_login ? ` · último login lá em ${fmtDate(s.legacy_last_login)}` : ''}.</p>
          )}
          <Field label="Fim do plano (acesso válido até)" hint="Depois desta data o aluno não consegue entrar. Uma data futura reativa um plano encerrado (renovação).">
            <input type="date" className="input" defaultValue={s.access_until || ''} disabled={!isTeacher && s.plan === 'ended'} onBlur={(e) => { if ((e.target.value || null) !== (s.access_until || null)) patch({ access_until: e.target.value || null }, 'Fim do plano atualizado.'); }} />
          </Field>
        </div>
      </Card>}

      <Card title="Acesso" icon={KeyRound}>
        <div className="stack-sm">
          <div className="row wrap" style={{ gap: 6 }}>
            {s.status === 'invited' && <button className="btn btn-sm" onClick={async () => { try { setModal({ link: (await api.post(`/teacher/students/${s.id}/invite`)).invite.url, kind: 'invite' }); } catch (e) { toast.error(e); } }}><Mail size={15} aria-hidden="true" />Gerar novo convite</button>}
            {s.status === 'active' && <button className="btn btn-sm" onClick={async () => { try { setModal({ link: (await api.post(`/teacher/students/${s.id}/reset-link`)).url, kind: 'reset' }); } catch (e) { toast.error(e); } }}><KeyRound size={15} aria-hidden="true" />Link para nova senha</button>}
            {s.status !== 'invited' && <button className="btn btn-sm btn-ghost" onClick={() => setModal({ toggle: true })}><Power size={15} aria-hidden="true" />{s.status === 'active' ? 'Desativar acesso' : 'Reativar acesso'}</button>}
          </div>
        </div>
      </Card>

      {isTeacher && <CohortCard s={s} patch={patch} />}

      <Accesses studentId={s.id} onChanged={reload} onLoaded={(list) => setHasAcc(list.length > 0)} />

      <Card title="Dados cadastrais">
        <dl className="kv">
          <dt>CPF</dt><dd>{s.cpf || '—'}</dd>
          <dt>Telefone</dt><dd>{s.phone ? s.phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '—'}</dd>
          <dt>Nascimento</dt><dd>{s.birth_date ? String(s.birth_date).slice(0, 10).split('-').reverse().join('/') : '—'}</dd>
          <dt>Cidade</dt><dd>{s.city ? `${s.city}/${s.state}` : '—'}</dd>
          <dt>Cadastro</dt><dd>{s.profile_complete ? 'Completo' : 'Incompleto'}</dd>
          <dt>Aluno desde</dt><dd>{fmtDate(s.created_at?.slice(0, 10))}</dd>
        </dl>
        <p className="xs muted mt-sm">CPF parcialmente oculto. Endereço completo só aparece na ficha cadastral (acesso registrado na auditoria).</p>
        <FullProfileButton studentId={s.id} onChanged={reload} />
      </Card>

      {modal?.link && (
        <Modal title={modal.kind === 'invite' ? 'Novo convite' : 'Link para nova senha'} onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Concluir</button>}>
          <p className="small ink2">{modal.kind === 'invite' ? 'O convite anterior foi invalidado. Envie este link ao aluno.' : 'Envie este link ao aluno. Ele vale por 1 hora e só pode ser usado uma vez.'}</p>
          <LinkBox url={modal.link} note="Por segurança, o link só aparece agora." />
        </Modal>
      )}
      {modal?.toggle && (
        <Confirm title={s.status === 'active' ? 'Desativar acesso?' : 'Reativar acesso?'} danger={s.status === 'active'} confirmLabel={s.status === 'active' ? 'Desativar' : 'Reativar'} onClose={() => setModal(null)}
          message={s.status === 'active' ? 'O aluno sai de todas as sessões e não consegue mais entrar. Todo o histórico é mantido.' : 'O aluno volta a entrar com a mesma senha.'}
          onConfirm={async () => { await patch({ active: s.status !== 'active' }, s.status === 'active' ? 'Acesso desativado.' : 'Acesso reativado.'); setModal(null); }} />
      )}
      {modal && 'extra' in modal && (
        <Confirm title={modal.extra ? 'Permitir revisões extras?' : 'Remover revisões extras?'} confirmLabel="Confirmar" onClose={() => setModal(null)}
          message={modal.extra ? 'Conteúdos que atingiram o limite do ciclo voltam a aceitar revisões. Fica registrado no histórico do aluno.' : 'A partir de agora vale de novo o limite de revisões por ciclo. As revisões extras já feitas são mantidas.'}
          onConfirm={async () => { await patch({ extra_reviews_allowed: modal.extra }, 'Configuração atualizada.'); setModal(null); reload(); }} />
      )}
      {modal?.endPlan && (
        <Confirm title="Encerrar o plano?" danger confirmLabel="Encerrar plano" onClose={() => setModal(null)}
          message="O aluno sai de todas as sessões e não consegue mais entrar. Todo o histórico de estudo é mantido. Para renovar depois, basta informar uma nova data de fim do plano."
          onConfirm={async () => { await patch({ plan_status: 'ended' }, 'Plano encerrado.'); setModal(null); }} />
      )}
      {modal?.unenroll && (
        <Confirm title="Desvincular do edital?" danger confirmLabel="Desvincular" onClose={() => setModal(null)}
          message={`O aluno deixa de ver “${modal.unenroll.edital_name}”. Nenhum registro é apagado: se vincular de novo, o histórico volta.`}
          onConfirm={async () => { try { await api.del(`/teacher/students/${s.id}/enrollments/${modal.unenroll.id}`); toast.info('Aluno desvinculado.'); setModal(null); bump(); } catch (e) { toast.error(e); } }} />
      )}
    </div>
  );
}

function CohortCard({ s, patch }) {
  const state = useAsync(() => api.get('/teacher/cohorts'), []);
  const list = state.data?.cohorts || [];
  return (
    <Card title="Turma" icon={BookOpen}>
      <Field label="Turma do aluno" hint="Define os materiais e os grupos de WhatsApp que ele vê.">
        <select className="select" value={s.cohort || ''} onChange={(e) => patch({ cohort: e.target.value || null }, 'Turma atualizada.')}>
          <option value="">Sem turma</option>
          {list.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </Field>
    </Card>
  );
}

function FullProfileButton({ studentId, onChanged }) {
  const [data, setData] = useState(null);
  const toast = useToast();
  const reload = async () => { try { setData(await api.get(`/teacher/students/${studentId}/profile`)); onChanged?.(); } catch (e) { toast.error(e); } };
  if (data) {
    const s = data.student;
    return (
      <Alert tone="info" className="mt-sm">
        <div className="small">
          <div>CPF: <b>{s.cpf || '—'}</b></div>
          <div>Endereço: <b>{[s.address_line, s.address_number, s.address_complement].filter(Boolean).join(', ') || '—'}</b></div>
          <div>{[s.district, s.city && `${s.city}/${s.state}`, s.postal_code && `CEP ${s.postal_code.replace(/(\d{5})(\d{3})/, '$1-$2')}`].filter(Boolean).join(' · ')}</div>
          <div>Nascimento: <b>{s.birth_date ? s.birth_date.split('-').reverse().join('/') : '—'}</b></div>
          <div className="xs muted">Termos aceitos em {s.terms_accepted_at ? fmtDateTime(s.terms_accepted_at) : '—'}</div>
          <div className="mt-sm"><CadastroEditor initial={s} editable={data.editable} endpoint={`/teacher/students/${studentId}/cadastro`} onSaved={reload} /></div>
        </div>
      </Alert>
    );
  }
  return <button className="btn btn-sm btn-ghost mt-sm" onClick={async () => { try { setData(await api.get(`/teacher/students/${studentId}/profile`)); } catch (e) { toast.error(e); } }}>Ver ficha cadastral completa</button>;
}
