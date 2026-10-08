import { useState } from 'react';
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Compass, Layers, Pencil, Plus, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/store.jsx';
import { RELEVANCE } from '../lib/format.js';
import { Alert, Confirm, Empty, Field, Modal } from './ui.jsx';

/** Divide uma lista colada do edital: uma linha por conteúdo, removendo marcadores e numeração. */
export const splitLines = (s) => s.split('\n').map((x) => x.replace(/^[\s•\-–*\d.)]+/, '').trim()).filter(Boolean);

/**
 * Editor de matérias e conteúdos de um edital (professora).
 * `data` = resposta de GET /teacher/editais/:id; `onChange` recarrega.
 * O edital é ÚNICO para todos os alunos: mudanças valem para todos, sem apagar histórico.
 */
export function StructureEditor({ editalId, subjects, canEdit, onChange, showArchived }) {
  const toast = useToast();
  const [newSubject, setNewSubject] = useState('');
  const [newTopics, setNewTopics] = useState('');
  const [addTo, setAddTo] = useState(null);
  const [rename, setRename] = useState(null);
  const [archive, setArchive] = useState(null);
  const base = `/teacher/editais/${editalId}`;
  const run = async (fn, msg) => { try { await fn(); if (msg) toast.success(msg); await onChange(); return true; } catch (e) { toast.error(e); return false; } };
  const activeSubjects = subjects.filter((s) => !s.archived_at);
  const move = (list, idx, dir, kind) => {
    const ids = list.map((x) => x.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return null;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    return run(() => api.post(`${base}/reorder`, kind === 's' ? { subject_ids: ids } : { topic_ids: ids, subject_id: list[0].subject_id }));
  };
  return (
    <div className="stack">
      {subjects.length === 0 && <Empty icon={Layers} title="Nenhuma matéria ainda">Adicione a primeira matéria e cole a lista de conteúdos do edital (um por linha).</Empty>}
      {subjects.map((s, si) => {
        const topics = s.topics.filter((t) => showArchived || !t.archived_at);
        const archivedS = !!s.archived_at;
        return (
          <div key={s.id} className="card" style={{ boxShadow: 'none', opacity: archivedS ? 0.6 : 1 }}>
            <div className="row between wrap" style={{ padding: '12px 14px', borderBottom: topics.length ? '1px solid var(--border)' : 0, gap: 8 }}>
              <div className="row" style={{ minWidth: 0, gap: 8 }}>
                <b className="ellipsis">{s.name}</b>
                <span className="tag">{s.topics.filter((t) => !t.archived_at).length} conteúdo(s)</span>
                {archivedS && <span className="tag">arquivada</span>}
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 2 }}>
                  {!archivedS && <>
                    <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Subir ${s.name}`} onClick={() => move(activeSubjects, activeSubjects.indexOf(s), -1, 's')} disabled={activeSubjects.indexOf(s) === 0}><ArrowUp size={15} /></button>
                    <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Descer ${s.name}`} onClick={() => move(activeSubjects, activeSubjects.indexOf(s), 1, 's')} disabled={activeSubjects.indexOf(s) === activeSubjects.length - 1}><ArrowDown size={15} /></button>
                    <button className="btn btn-sm" onClick={() => { setAddTo(s); setNewTopics(''); }}><Plus size={15} aria-hidden="true" />Conteúdos</button>
                    <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Renomear ${s.name}`} onClick={() => setRename({ kind: 'subject', item: s, name: s.name })}><Pencil size={15} /></button>
                  </>}
                  <button className="btn btn-ghost btn-sm icon-btn" aria-label={archivedS ? `Restaurar ${s.name}` : `Arquivar ${s.name}`} onClick={() => (archivedS ? run(() => api.patch(`${base}/subjects/${s.id}`, { archived: false }), 'Matéria restaurada.') : setArchive({ kind: 'subject', item: s }))}>{archivedS ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                </div>
              )}
            </div>
            {topics.map((t, ti) => {
              const live = s.topics.filter((x) => !x.archived_at);
              const li = live.indexOf(t);
              return (
                <div key={t.id} className="row between" style={{ padding: '7px 14px', borderTop: ti ? '1px solid var(--border)' : 0, opacity: t.archived_at ? 0.55 : 1 }}>
                  <span className="small ellipsis">{t.name}{t.archived_at && <span className="tag" style={{ marginLeft: 6 }}>arquivado</span>}</span>
                  {canEdit && !archivedS && (
                    <div className="row" style={{ gap: 2 }}>
                      {!t.archived_at && <>
                        <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Subir ${t.name}`} onClick={() => move(live, li, -1, 't')} disabled={li === 0}><ArrowUp size={14} /></button>
                        <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Descer ${t.name}`} onClick={() => move(live, li, 1, 't')} disabled={li === live.length - 1}><ArrowDown size={14} /></button>
                        <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Editar ${t.name}`} onClick={() => setRename({ kind: 'topic', item: t, name: t.name, subject_id: t.subject_id })}><Pencil size={14} /></button>
                      </>}
                      <button className="btn btn-ghost btn-sm icon-btn" aria-label={t.archived_at ? `Restaurar ${t.name}` : `Arquivar ${t.name}`} onClick={() => (t.archived_at ? run(() => api.patch(`${base}/topics/${t.id}`, { archived: false }), 'Conteúdo restaurado.') : setArchive({ kind: 'topic', item: t }))}>{t.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {canEdit && (
        <div className="card card-pad" style={{ boxShadow: 'none', borderStyle: 'dashed' }}>
          <h3>Nova matéria</h3>
          <div className="grid g2 mt-sm">
            <Field label="Nome da matéria"><input className="input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Ex.: Legislação do SUS" /></Field>
            <Field label="Conteúdos (um por linha)" hint="Cole direto do edital; marcadores e numeração são removidos."><textarea className="textarea" style={{ minHeight: 90 }} value={newTopics} onChange={(e) => setNewTopics(e.target.value)} placeholder={'Lei 8.080/1990\nLei 8.142/1990\nControle social'} /></Field>
          </div>
          <button className="btn btn-primary mt-sm" disabled={!newSubject.trim()} onClick={async () => {
            if (await run(() => api.post(`${base}/subjects`, { name: newSubject, topics: splitLines(newTopics) }), 'Matéria adicionada.')) { setNewSubject(''); setNewTopics(''); }
          }}><Plus size={16} aria-hidden="true" />Adicionar matéria{splitLines(newTopics).length ? ` com ${splitLines(newTopics).length} conteúdo(s)` : ''}</button>
        </div>
      )}

      {addTo && (
        <Modal title={`Adicionar conteúdos — ${addTo.name}`} onClose={() => setAddTo(null)}
          footer={<><button className="btn" onClick={() => setAddTo(null)}>Cancelar</button><button className="btn btn-primary" disabled={!splitLines(newTopics).length} onClick={async () => { if (await run(() => api.post(`${base}/topics`, { subject_id: addTo.id, names: splitLines(newTopics) }), 'Conteúdos adicionados.')) setAddTo(null); }}>Adicionar {splitLines(newTopics).length || ''}</button></>}>
          <Field label="Conteúdos (um por linha)"><textarea className="textarea" style={{ minHeight: 160 }} autoFocus value={newTopics} onChange={(e) => setNewTopics(e.target.value)} /></Field>
          <p className="xs muted">Os novos conteúdos aparecem para todos os alunos do edital como “Não iniciado”.</p>
        </Modal>
      )}
      {rename && (
        <Modal title={rename.kind === 'subject' ? 'Renomear matéria' : 'Editar conteúdo'} onClose={() => setRename(null)}
          footer={<><button className="btn" onClick={() => setRename(null)}>Cancelar</button><button className="btn btn-primary" onClick={async () => {
            const url = rename.kind === 'subject' ? `${base}/subjects/${rename.item.id}` : `${base}/topics/${rename.item.id}`;
            const body = rename.kind === 'subject' ? { name: rename.name } : { name: rename.name, subject_id: rename.subject_id };
            if (await run(() => api.patch(url, body), 'Alteração salva.')) setRename(null);
          }}>Salvar</button></>}>
          <Field label="Nome"><input className="input" autoFocus value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} /></Field>
          {rename.kind === 'topic' && (
            <Field label="Matéria" hint="Mover o conteúdo mantém todo o histórico dos alunos.">
              <select className="select" value={rename.subject_id} onChange={(e) => setRename({ ...rename, subject_id: e.target.value })}>
                {activeSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <p className="xs muted">A alteração vale para todos os alunos do edital, sem perder o progresso deles.</p>
        </Modal>
      )}
      {archive && (
        <Confirm title={`Arquivar ${archive.kind === 'subject' ? 'matéria' : 'conteúdo'}?`} confirmLabel="Arquivar" danger onClose={() => setArchive(null)}
          message={`“${archive.item.name}” sai do edital de todos os alunos, mas nenhum histórico é apagado (horas, revisões e questões ficam guardados) e dá para restaurar depois.`}
          onConfirm={async () => {
            const url = archive.kind === 'subject' ? `${base}/subjects/${archive.item.id}` : `${base}/topics/${archive.item.id}`;
            if (await run(() => api.patch(url, { archived: true }), 'Arquivado.')) setArchive(null);
          }} />
      )}
    </div>
  );
}

/** Plano Global — ordem de relevância das matérias (orienta as sugestões; não é cronograma). */
export function PlanEditor({ editalId, subjects, plan, canEdit, onChange }) {
  const toast = useToast();
  const initial = plan.items.map((i) => ({ subject_id: i.subject_id, relevance: i.relevance, note: i.note || '' }));
  const [items, setItems] = useState(initial);
  const [notes, setNotes] = useState(plan.notes || '');
  const [busy, setBusy] = useState(false);
  const active = subjects.filter((s) => !s.archived_at);
  const inPlan = new Set(items.map((i) => i.subject_id));
  const notIn = active.filter((s) => !inPlan.has(s.id));
  const name = (id) => active.find((s) => s.id === id)?.name || '—';
  const dirty = JSON.stringify(items) !== JSON.stringify(initial) || notes !== (plan.notes || '');
  return (
    <div className="stack">
      <Alert tone="info" icon={Compass}><span>O Plano Global <b>orienta</b> quais matérias são mais relevantes neste edital e alimenta a sugestão “o que fazer agora” dos alunos. Não é cronograma.</span></Alert>
      {items.length === 0 && <p className="muted small">Nenhuma matéria priorizada ainda.</p>}
      {items.map((it, i) => (
        <div key={it.subject_id} className="row between wrap card" style={{ padding: '10px 12px', boxShadow: 'none', gap: 8 }}>
          <div className="row" style={{ minWidth: 0, gap: 8 }}><b className="num" style={{ width: 24 }}>{i + 1}.</b><span className="ellipsis">{name(it.subject_id)}</span></div>
          {canEdit ? (
            <div className="row" style={{ gap: 4 }}>
              <select className="select input-sm" style={{ width: 120 }} value={it.relevance} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, relevance: e.target.value } : x)))} aria-label="Relevância">
                {Object.entries(RELEVANCE).map(([k, v]) => <option key={k} value={k}>Relevância {v.toLowerCase()}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm icon-btn" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setItems(n); }} aria-label="Subir"><ArrowUp size={15} /></button>
              <button className="btn btn-ghost btn-sm icon-btn" disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setItems(n); }} aria-label="Descer"><ArrowDown size={15} /></button>
              <button className="btn btn-ghost btn-sm icon-btn" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remover do plano"><X size={15} /></button>
            </div>
          ) : <span className="tag">Relevância {RELEVANCE[it.relevance]?.toLowerCase()}</span>}
        </div>
      ))}
      {canEdit && notIn.length > 0 && (
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="small muted">Adicionar ao plano:</span>
          {notIn.map((s) => <button key={s.id} className="chip" onClick={() => setItems([...items, { subject_id: s.id, relevance: 'media', note: '' }])}><Plus size={13} aria-hidden="true" />{s.name}</button>)}
        </div>
      )}
      <Field label="Orientação geral para os alunos (opcional)">
        <textarea className="textarea" rows={3} disabled={!canEdit} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: Farmacologia e SUS somam mais da metade da prova — priorize-as nas primeiras semanas." />
      </Field>
      {canEdit && (
        <div className="row">
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={async () => {
            setBusy(true);
            try { await api.put(`/teacher/editais/${editalId}/plan`, { items, notes }); toast.success('Plano Global salvo.'); await onChange(); } catch (e) { toast.error(e); } finally { setBusy(false); }
          }}>Salvar Plano Global</button>
          {dirty && <button className="btn btn-ghost" onClick={() => { setItems(initial); setNotes(plan.notes || ''); }}>Descartar alterações</button>}
        </div>
      )}
    </div>
  );
}
