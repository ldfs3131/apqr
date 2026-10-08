import { useState } from 'react';
import { Award, Check, ClipboardList, FileText, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate } from '../../lib/format.js';
import { Alert, Async, Card, Empty, Field } from '../../components/ui.jsx';
import { brl } from '../Consultoria.jsx';

const LV = { insuficiente: 'dados insuficientes', inicial: 'dados iniciais', confiavel: 'confiável' };
const fmtH = (s) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;

/** Aba Consultoria da ficha do aluno (professora e coordenadora). */
export default function ConsultoriaStaff({ studentId }) {
  const state = useAsync(() => api.get(`/teacher/students/${studentId}/consultoria`), [studentId]);
  return (
    <Async state={state}>
      {({ consultoria: c }) => !c
        ? <div className="card"><Empty icon={Award} title="Aluno sem consultoria">A aba aparece quando o aluno tem um acesso do tipo consultoria (cadastre em Cadastro → Acessos).</Empty></div>
        : <Body c={c} studentId={studentId} reload={() => state.reload({ silent: true })} />}
    </Async>
  );
}

function Body({ c, studentId, reload }) {
  const { user } = useAuth();
  const isTeacher = user.role === 'teacher';
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Journey j={c.journey} studentId={studentId} reload={reload} />
      <Bonus c={c} isTeacher={isTeacher} reload={reload} />
      <Diag diag={c.diagnostic} />
      <Plan plan={c.plan} studentId={studentId} reload={reload} />
      <Reports c={c} studentId={studentId} isTeacher={isTeacher} reload={reload} />
    </div>
  );
}

function Journey({ j, studentId, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ scheduled_on: j.scheduled_on || '', session_link: j.session_link || '', done_on: j.done_on || '', note: j.note || '', continued: j.continued == null ? '' : j.continued ? 'sim' : 'nao' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      const body = { scheduled_on: f.scheduled_on || null, session_link: f.session_link || null, note: f.note || null, continued: f.continued === '' ? null : f.continued === 'sim' };
      if (f.done_on && f.done_on !== j.done_on) body.done_on = f.done_on;
      await api.patch(`/teacher/students/${studentId}/consultoria`, body);
      toast.success('Jornada atualizada.'); reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Jornada da consultoria" icon={ClipboardList}>
      <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
        {j.steps.map((s) => <span key={s.key} className={`tag ${s.state === 'done' ? 'good' : s.state === 'current' ? 'warning' : ''}`}>{s.state === 'done' ? '✓ ' : ''}{s.label}</span>)}
      </div>
      <div className="grid g3">
        <Field label="Sessão agendada para"><input type="date" className="input" value={f.scheduled_on} onChange={set('scheduled_on')} /></Field>
        <Field label="Link da sessão"><input className="input" type="url" placeholder="https://" value={f.session_link} onChange={set('session_link')} /></Field>
        <Field label="Encontro realizado em" hint="Ao informar, o acesso do aluno passa a valer 30 dias a partir desta data."><input type="date" className="input" value={f.done_on} onChange={set('done_on')} /></Field>
        <Field label="Continuidade"><select className="select" value={f.continued} onChange={set('continued')}><option value="">Ainda não definida</option><option value="sim">Continua na mentoria</option><option value="nao">Não continua</option></select></Field>
        <Field label="Observação interna"><input className="input" maxLength={600} value={f.note} onChange={set('note')} /></Field>
      </div>
      {j.report_due_on && <p className="xs muted">Relatório previsto até {fmtDate(j.report_due_on)}.</p>}
      <div className="row"><button className="btn btn-primary" disabled={busy} onClick={save}>Salvar jornada</button></div>
    </Card>
  );
}

function Bonus({ c, isTeacher, reload }) {
  const toast = useToast();
  const live = c.bonus_live; const issued = c.bonus_issued;
  const apply = async () => { try { await api.post(`/teacher/bonuses/${issued.id}/apply`, {}); toast.success('Bônus marcado como aplicado.'); reload(); } catch (e) { toast.error(e); } };
  return (
    <Card title="Bônus de Execução" icon={Award} subtitle="Medição automática (nada é gravado até aprovar o relatório). O desconto é aplicado manualmente por você.">
      {!live.started ? <p className="small muted">Começa a ser medido quando o encontro for registrado.</p> : (
        <div className="stack-sm">
          <div className="small">Janela: {fmtDate(live.window.from)} a {fmtDate(live.window.to)} · metas cumpridas: <b>{live.goals_met} de 3</b> · medalha parcial: <b>{live.medal || 'nenhuma ainda'}</b>{live.discount_cents != null ? ` (${brl(live.discount_cents)})` : ''}</div>
          {Object.entries(live.goals).map(([k, g]) => <div key={k} className="small">{g.met ? '✓' : '○'} {{ constancy: 'Constância', questions: 'Questões', plan: 'Plano' }[k]}: {g.label}</div>)}
        </div>
      )}
      {issued && (
        <Alert tone={issued.applied ? 'info' : issued.expired ? 'warning' : 'success'}>
          <span>Bônus emitido: <b>{issued.medal_label}</b>{issued.discount_cents != null ? ` · ${brl(issued.discount_cents)}` : ''} · válido até {fmtDate(issued.valid_until)}{issued.applied ? ' · já aplicado' : issued.expired ? ' · vencido' : ` · ${issued.days_left} dia(s) restantes`}</span>
          {!issued.applied && !issued.expired && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={apply}>Marcar como aplicado</button>}
        </Alert>
      )}
      {!isTeacher && <p className="xs muted mt-sm">Somente a professora aprova o relatório (é isso que emite o bônus).</p>}
    </Card>
  );
}

function Diag({ diag }) {
  return (
    <Card title="Diagnóstico enviado pelo aluno" icon={FileText}>
      {!diag ? <p className="small muted">O aluno ainda não enviou o diagnóstico.</p> : (
        <div className="stack-sm">
          <p className="xs muted">Enviado em {fmtDate(String(diag.created_at).slice(0, 10))} · autorização de uso registrada{diag.terms_version ? ` (termos v${diag.terms_version})` : ''}.</p>
          {diag.questions.filter((q) => diag.answers[q.key]).map((q) => (
            <div key={q.key}><div className="xs muted">{q.label}</div><div className="small"><b>{diag.answers[q.key]}</b></div></div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Plan({ plan, studentId, reload }) {
  const toast = useToast();
  const [title, setTitle] = useState(plan?.title || 'Plano de ação');
  const [items, setItems] = useState(plan?.items?.map((i) => ({ text: i.text, due_on: i.due_on || '' })) || [{ text: '', due_on: '' }]);
  const [busy, setBusy] = useState(false);
  const upd = (i, k, v) => setItems(items.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const save = async (publish) => {
    setBusy(true);
    try {
      await api.put(`/teacher/students/${studentId}/consultoria/plan`, { title, publish, items: items.filter((x) => x.text.trim()).map((x) => ({ text: x.text, due_on: x.due_on || null })) });
      toast.success(publish ? 'Plano publicado para o aluno.' : 'Plano salvo (o aluno ainda não vê).'); reload();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Plano de ação" icon={Check} subtitle={plan?.published_at ? `Publicado · ${plan.done} de ${plan.total} feitas (${plan.pct}%)` : 'Rascunho: o aluno só vê depois de publicar.'}>
      <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      {plan?.items?.some((i) => i.done) && <p className="xs muted mt-sm">Marcadas pelo aluno: {plan.items.filter((i) => i.done).map((i) => `${i.text.slice(0, 40)} (${fmtDate(String(i.done_at).slice(0, 10))})`).join(' · ')}</p>}
      <div className="stack-sm mt-sm">
        {items.map((it, i) => (
          <div key={i} className="row" style={{ gap: 6 }}>
            <input className="input" style={{ flex: 1 }} maxLength={240} placeholder="Ação (ex.: resolver 40 questões de Legislação)" value={it.text} onChange={(e) => upd(i, 'text', e.target.value)} />
            <input type="date" className="input" style={{ width: 150 }} aria-label="Prazo" value={it.due_on} onChange={(e) => upd(i, 'due_on', e.target.value)} />
            <button className="btn btn-ghost btn-sm icon-btn" aria-label="Remover ação" onClick={() => setItems(items.filter((_, n) => n !== i))}><Trash2 size={15} /></button>
          </div>
        ))}
        <div className="row wrap" style={{ gap: 6 }}>
          <button className="btn btn-sm" disabled={items.length >= 40} onClick={() => setItems([...items, { text: '', due_on: '' }])}><Plus size={14} aria-hidden="true" />Ação</button>
          <button className="btn btn-sm" disabled={busy} onClick={() => save(false)}>Salvar rascunho</button>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(true)}>{plan?.published_at ? 'Salvar (já publicado)' : 'Publicar para o aluno'}</button>
        </div>
      </div>
    </Card>
  );
}

function Reports({ c, studentId, isTeacher, reload }) {
  const toast = useToast();
  const draft = c.reports.find((r) => r.status === 'draft');
  const approved = c.reports.filter((r) => r.status === 'approved');
  const [body, setBody] = useState(draft?.body || '');
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); reload(); } catch (e) { toast.error(e); } finally { setBusy(false); } };
  const f = draft?.facts;
  return (
    <Card title="Relatório de 30 dias" icon={FileText} subtitle="Os números são calculados pelo sistema, sem IA. Você escreve a análise e a professora aprova.">
      {!draft && <button className="btn btn-primary btn-sm" disabled={busy || !c.journey.done_on} onClick={() => run(() => api.post(`/teacher/students/${studentId}/consultoria/report`, {}), 'Rascunho preparado com os números do período.')}>Preparar relatório</button>}
      {!draft && !c.journey.done_on && <p className="xs muted mt-sm">Registre o encontro realizado primeiro.</p>}
      {draft && f && (
        <div className="stack-sm">
          <p className="small">Período {fmtDate(f.period.from)} a {fmtDate(f.period.to)} · estudo: <b>{fmtH(f.hours.seconds)}</b> ({f.hours.basis}) · questões: <b>{f.questions.total}</b>{f.questions.accuracy != null ? ` · acerto ${f.questions.accuracy}%` : ' · acerto sem amostra mínima'}</p>
          {f.questions.subjects.map((s) => <div key={s.subject} className="xs">{s.subject}: {s.questions} questões · {s.accuracy != null ? `${s.accuracy}%` : `faltam ${s.missing} para analisar`} <span className="muted">({LV[s.level]})</span></div>)}
          <Field label="Análise da equipe (o aluno lê isto)"><textarea className="input" rows={8} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.patch(`/teacher/consult-reports/${draft.id}`, { body }), 'Texto salvo.')}>Salvar texto</button>
            <button className="btn btn-sm" disabled={busy} onClick={() => run(() => api.post(`/teacher/students/${studentId}/consultoria/report`, { body }), 'Números atualizados.')}>Atualizar números</button>
            {isTeacher && <button className="btn btn-primary btn-sm" disabled={busy || body.trim().length < 20} onClick={() => run(async () => { await api.patch(`/teacher/consult-reports/${draft.id}`, { body }); await api.post(`/teacher/consult-reports/${draft.id}/approve`, {}); }, 'Relatório aprovado e bônus emitido.')}>Aprovar e emitir bônus</button>}
          </div>
          {!isTeacher && <p className="xs muted">A aprovação é da professora.</p>}
        </div>
      )}
      {approved.length > 0 && <p className="xs muted mt-sm">Aprovados: {approved.map((r) => fmtDate(String(r.approved_at).slice(0, 10))).join(', ')}.</p>}
    </Card>
  );
}
