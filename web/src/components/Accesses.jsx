import { useEffect, useState } from 'react';
import { CalendarCheck, Pause, Play, Plus, ShieldPlus, XCircle } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDate } from '../lib/format.js';
import { Alert, Async, Card, Field, Modal } from './ui.jsx';

const SIT = { active: ['Ativo', 'success'], paused: ['Pausado', 'warning'], expired: ['Vencido', 'danger'], canceled: ['Cancelado', 'danger'], pending_meeting: ['Aguardando encontro', 'warning'] };
const KIND = { turma: 'Turma', consultoria: 'Consultoria', plataforma: 'Só plataforma' };

/** Acessos do aluno: várias vigências, pausa (1 por acesso), consultoria contada do encontro, cancelamento com motivo. */
export default function Accesses({ studentId, onChanged, onLoaded }) {
  const { user } = useAuth();
  const toast = useToast();
  const state = useAsync(() => api.get(`/teacher/students/${studentId}/accesses`), [studentId]);
  const [modal, setModal] = useState(null);
  useEffect(() => { if (state.data) onLoaded?.(state.data.accesses); }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const isTeacher = user.role === 'teacher' || user.role === 'platform_admin';
  const run = async (fn, ok) => { try { await fn(); toast.success(ok); setModal(null); await state.reload({ silent: true }); onChanged?.(); } catch (e) { toast.error(e); } };
  return (
    <Card title="Acessos" icon={CalendarCheck} subtitle="Cada acesso tem a sua vigência. O aluno entra enquanto tiver algum ativo."
      action={<button className="btn btn-sm" onClick={() => setModal({ kind: 'new' })}><Plus size={15} aria-hidden="true" />Novo acesso</button>}>
      <Async state={state}>{(d) => (
        <div className="stack-sm">
          {!d.accesses.length && <p className="small muted">Nenhum acesso cadastrado. A validade antiga (se houver) continua valendo.</p>}
          {d.accesses.map((a) => {
            const [lab, tone] = SIT[a.situation] || [a.situation, ''];
            return (
              <div key={a.id} className="card" style={{ padding: 12, boxShadow: 'none' }}>
                <div className="row between wrap" style={{ gap: 8 }}>
                  <div>
                    <b>{KIND[a.kind]}</b>{a.label ? <span className="muted"> · {a.label}</span> : null}
                    <div className="xs muted">{fmtDate(a.starts_on)} → {a.ends_on ? fmtDate(a.ends_on) : 'sem data (aguarda o encontro)'}{a.paused_from ? ` · pausado desde ${fmtDate(a.paused_from)}` : ''}</div>
                    {a.status === 'canceled' && <div className="xs muted">Motivo: {a.cancel_reason}</div>}
                  </div>
                  <span className={`tag ${tone}`}>{lab}</span>
                </div>
                {a.status !== 'canceled' && (
                  <div className="row wrap mt-sm" style={{ gap: 6 }}>
                    {a.kind === 'consultoria' && <button className="btn btn-sm" onClick={() => setModal({ kind: 'meeting', a })}>Encontro realizado</button>}
                    <button className="btn btn-sm" onClick={() => setModal({ kind: 'edit', a })}>Alterar datas</button>
                    {a.paused_from
                      ? <button className="btn btn-sm" onClick={() => run(() => api.post(`/teacher/accesses/${a.id}/resume`), 'Acesso retomado; o tempo parado foi somado.')}><Play size={14} aria-hidden="true" />Retomar</button>
                      : <button className="btn btn-sm" disabled={!a.can_pause} title={a.long ? (a.can_pause ? '' : 'A pausa já foi usada.') : `Só vale para acessos de ${d.long_days} dias ou mais.`} onClick={() => run(() => api.post(`/teacher/accesses/${a.id}/pause`), 'Acesso pausado.')}><Pause size={14} aria-hidden="true" />Pausar</button>}
                    {isTeacher && a.long && !a.can_pause && !a.paused_from && <button className="btn btn-sm" onClick={() => run(() => api.post(`/teacher/accesses/${a.id}/extra-pause`, {}), 'Pausa extra liberada.')}><ShieldPlus size={14} aria-hidden="true" />Liberar pausa extra</button>}
                    <button className="btn btn-sm btn-ghost" onClick={() => setModal({ kind: 'cancel', a })}><XCircle size={14} aria-hidden="true" />Cancelar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}</Async>
      {modal?.kind === 'new' && <NewAccess onClose={() => setModal(null)} onSave={(body) => run(() => api.post(`/teacher/students/${studentId}/accesses`, body), 'Acesso criado.')} />}
      {modal?.kind === 'edit' && <EditAccess a={modal.a} onClose={() => setModal(null)} onSave={(body) => run(() => api.patch(`/teacher/accesses/${modal.a.id}`, body), 'Datas atualizadas.')} />}
      {modal?.kind === 'meeting' && <DateModal title="Encontro realizado" label="Data do encontro" hint="O prazo de 30 dias da consultoria passa a contar desta data." onClose={() => setModal(null)} onSave={(date) => run(() => api.post(`/teacher/accesses/${modal.a.id}/meeting`, { date }), 'Encontro registrado.')} />}
      {modal?.kind === 'cancel' && <CancelModal onClose={() => setModal(null)} onSave={(reason) => run(() => api.post(`/teacher/accesses/${modal.a.id}/cancel`, { reason }), 'Acesso cancelado.')} />}
    </Card>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

function NewAccess({ onClose, onSave }) {
  const [f, setF] = useState({ kind: 'plataforma', label: '', starts_on: todayIso(), days: 90 });
  return (
    <Modal title="Novo acesso" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onSave({ kind: f.kind, label: f.label || null, starts_on: f.starts_on, ...(f.kind === 'consultoria' ? {} : { days: Number(f.days) }) })}>Criar acesso</button></>}>
      <Field label="Tipo"><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Descrição (opcional)"><input className="input" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex.: Turma ANVISA 2026 · semestral" /></Field>
      <Field label="Início"><input className="input" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
      {f.kind === 'consultoria'
        ? <Alert tone="info">Na consultoria o prazo de 30 dias só começa a contar quando você marcar "Encontro realizado".</Alert>
        : <Field label="Duração (dias)"><input className="input" type="number" min="1" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>}
    </Modal>
  );
}
function EditAccess({ a, onClose, onSave }) {
  const [f, setF] = useState({ starts_on: a.starts_on, ends_on: a.ends_on || '' });
  return (
    <Modal title="Alterar datas" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onSave({ starts_on: f.starts_on, ends_on: f.ends_on || null })}>Salvar</button></>}>
      <Field label="Início"><input className="input" type="date" value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
      <Field label="Fim"><input className="input" type="date" value={f.ends_on} onChange={(e) => setF({ ...f, ends_on: e.target.value })} /></Field>
    </Modal>
  );
}
function DateModal({ title, label, hint, onClose, onSave }) {
  const [v, setV] = useState(todayIso());
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={() => onSave(v)}>Confirmar</button></>}>
      <Field label={label} hint={hint}><input className="input" type="date" value={v} onChange={(e) => setV(e.target.value)} /></Field>
    </Modal>
  );
}
function CancelModal({ onClose, onSave }) {
  const [r, setR] = useState('');
  return (
    <Modal title="Cancelar acesso" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Voltar</button><button className="btn btn-danger" disabled={r.trim().length < 3} onClick={() => onSave(r)}>Cancelar acesso</button></>}>
      <Field label="Motivo do cancelamento" hint="Fica registrado na auditoria."><input className="input" autoFocus value={r} onChange={(e) => setR(e.target.value)} /></Field>
    </Modal>
  );
}
