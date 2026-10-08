import { Check, MessageCircle, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Card, Empty } from '../../components/ui.jsx';

/** Abre o WhatsApp com texto pronto. O sistema nunca envia nada sozinho. */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Fila da Coordenação: listas calculadas dos dados, com motivo, WhatsApp com texto pronto e "feito". */
export default function Fila() {
  const [showDone, setShowDone] = useState(false);
  const state = useAsync(() => api.get(`/teacher/fila${showDone ? '?done=1' : ''}`), [showDone]);
  const toast = useToast();
  const nav = useNavigate();
  const mark = async (it, undo) => {
    try { await api.post('/teacher/fila/done', { student_id: it.student_id, kind: it.kind, ref: it.ref, undo }); toast.success(undo ? 'Reaberto.' : 'Marcado como feito.'); state.reload({ silent: true }); } catch (e) { toast.error(e); }
  };
  return (
    <Page title="Fila da Coordenação" eyebrow="Mentoria" topbar={false}
      subtitle="O que precisa de uma ação hoje, calculado a partir dos dados. Tarefas gerais ficam fora desta fila."
      actions={<label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Mostrar feitos</label>}>
      <Async state={state}>{(d) => !d.groups.length
        ? <Card><Empty icon={Check} title="Fila vazia">Nada pendente agora. Bom trabalho!</Empty></Card>
        : <div className="stack">{d.groups.map((g) => (
          <Card key={g.kind} title={g.label} subtitle={`${g.items.length} ${g.items.length === 1 ? 'item' : 'itens'}`} pad={false}>
            {g.items.map((it, i) => {
              const wa = it.whatsapp_text ? waLink(it.phone, it.whatsapp_text) : null;
              return (
                <div key={`${it.student_id}${it.ref}`} className="row between wrap" style={{ padding: '12px 18px', borderTop: i ? '1px solid var(--border)' : 0, gap: 10, opacity: it.done ? 0.6 : 1 }}>
                  <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <button className="linklike bold" onClick={() => nav(`/professora/alunos/${it.student_id}`)}>{it.student_name}</button>
                    <div className="small ink2">{it.reason}</div>
                    {it.done && <div className="xs muted">Feito por {it.done.by || '—'} em {fmtDateTime(it.done.at)}</div>}
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {it.due_on && <span className="tag">{fmtDate(it.due_on, { year: false })}</span>}
                    {wa && <a className="btn btn-sm" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} aria-hidden="true" />WhatsApp</a>}
                    {it.done ? <button className="btn btn-sm btn-ghost" onClick={() => mark(it, true)}><Undo2 size={15} aria-hidden="true" />Reabrir</button>
                      : <button className="btn btn-sm btn-primary" onClick={() => mark(it, false)}><Check size={15} aria-hidden="true" />Marquei como feito</button>}
                  </div>
                </div>
              );
            })}
          </Card>
        ))}</div>}
      </Async>
    </Page>
  );
}
