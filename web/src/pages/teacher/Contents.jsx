import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Link2, Pencil, PlayCircle, Plus, Sparkles, Trash2, Type, Upload } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Card, Confirm, Empty, Field, Modal, Seg } from '../../components/ui.jsx';
import { ContentList } from '../Contents.jsx';

const KIND = { text: { label: 'Texto', icon: Type }, video: { label: 'Vídeo', icon: PlayCircle }, link: { label: 'Link', icon: Link2 }, file: { label: 'Arquivo', icon: FileText } };
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Gestão dos Materiais: a professora publica textos, vídeos, links e arquivos para os alunos. */
export default function TeacherContents() {
  const { user } = useAuth();
  const canEdit = user.role !== 'mentor';
  const state = useAsync(() => api.get('/teacher/contents'), []);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(false);
  return (
    <Page title="Materiais" eyebrow="Conteúdo" topbar={false}
      subtitle="Vídeos do YouTube (não listados), PDFs, links do Google Drive e textos para os alunos. Só aparecem para eles depois de publicados. PDFs saem para o aluno com o nome dele na marca d'água."
      actions={<>
        <button className="btn" onClick={() => setPreview(!preview)}>{preview ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{preview ? 'Voltar à gestão' : 'Ver como aluno'}</button>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} aria-hidden="true" />Novo material</button>}
      </>}>
      <Async state={state}>
        {({ items }) => preview
          ? <ContentList items={items.filter((i) => i.published)} />
          : <ManageList items={items} canEdit={canEdit} onEdit={setEdit} reload={() => state.reload({ silent: true })} />}
      </Async>
      {edit && <ContentForm item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); state.reload({ silent: true }); }} />}
    </Page>
  );
}

function ManageList({ items, canEdit, onEdit, reload }) {
  const toast = useToast();
  const [del, setDel] = useState(null);
  const run = async (fn, msg) => { try { await fn(); if (msg) toast.success(msg); reload(); } catch (e) { toast.error(e); } };
  if (!items.length) return <div className="card"><Empty icon={Sparkles} title="Nenhum material ainda" action={canEdit && <button className="btn btn-primary" onClick={() => onEdit({})}>Criar o primeiro</button>}>Sugestões: um guia de prompts para revisar conteúdos, um vídeo mostrando como gerar questões com IA, cuidados com respostas erradas da IA.</Empty></div>;
  const move = (i, dir) => { const ids = items.map((x) => x.id); const j = i + dir; [ids[i], ids[j]] = [ids[j], ids[i]]; return run(() => api.post('/teacher/contents/reorder', { ids })); };
  return (
    <Card pad={false}>
      {items.map((it, i) => {
        const K = KIND[it.kind];
        return (
          <div key={it.id} className="row between wrap" style={{ padding: '14px 18px', borderTop: i ? '1px solid var(--border)' : 0, gap: 10 }}>
            <div className="row" style={{ gap: 12, minWidth: 0, flex: '1 1 300px' }}>
              <span className="sugg-icon" aria-hidden="true"><K.icon size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 6 }}><b className="ellipsis">{it.title}</b><span className={`tag ${it.published ? 'good' : ''}`}>{it.published ? 'Publicado' : 'Rascunho'}</span><span className="tag">{it.category}</span>{it.cohort && <span className="tag warn">Turma: {it.cohort}</span>}</div>
                <div className="xs muted ellipsis">{K.label}{it.file_name ? ` · ${it.file_name} (${fmtSize(it.file_size)})` : it.url ? ` · ${it.url}` : ''} · atualizado em {fmtDate(it.updated_at.slice(0, 10))}</div>
              </div>
            </div>
            {canEdit && (
              <div className="row" style={{ gap: 2 }}>
                <button className="btn btn-ghost btn-sm icon-btn" aria-label="Subir" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                <button className="btn btn-ghost btn-sm icon-btn" aria-label="Descer" disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                <button className="btn btn-sm" onClick={() => run(() => api.patch(`/teacher/contents/${it.id}`, { published: !it.published }), it.published ? 'Material despublicado.' : 'Material publicado para os alunos.')}>{it.published ? 'Despublicar' : 'Publicar'}</button>
                <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Editar ${it.title}`} onClick={() => onEdit(it)}><Pencil size={15} /></button>
                <button className="btn btn-ghost btn-sm icon-btn" aria-label={`Arquivar ${it.title}`} onClick={() => setDel(it)}><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        );
      })}
      {del && <Confirm title="Arquivar material?" danger confirmLabel="Arquivar" onClose={() => setDel(null)} message={`“${del.title}” sai da área dos alunos. O registro fica guardado.`}
        onConfirm={async () => { await run(() => api.patch(`/teacher/contents/${del.id}`, { archived: true }), 'Material arquivado.'); setDel(null); }} />}
    </Card>
  );
}

function ContentForm({ item, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !item.id;
  const [f, setF] = useState({ kind: item.kind || 'text', title: item.title || '', category: item.category || 'geral', summary: item.summary || '', body: item.body || '', url: item.url || '', file_id: item.file_id || null, file_name: item.file_name || null, published: !!item.published, cohort: item.cohort || '' });
  const cohorts = useAsync(() => api.get('/teacher/cohorts'), []);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (publish) => {
    setBusy(true); setErr(null);
    const body = { kind: f.kind, title: f.title, category: f.category, summary: f.summary, body: f.kind === 'text' ? f.body : f.body || null, url: ['video', 'link'].includes(f.kind) ? f.url : null, file_id: f.kind === 'file' ? f.file_id : null, published: publish ?? f.published, cohort: f.cohort || null };
    try {
      if (isNew) await api.post('/teacher/contents', body); else await api.patch(`/teacher/contents/${item.id}`, body);
      toast.success(body.published ? 'Material publicado.' : 'Rascunho salvo.');
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const onFile = async (file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setErr('Arquivo grande demais (máximo 20 MB).');
    setUploading(true); setErr(null);
    try { const r = await api.upload('/files?purpose=content', file); setF((x) => ({ ...x, file_id: r.file.id, file_name: r.file.original_name, title: x.title || file.name.replace(/\.[^.]+$/, '') })); }
    catch (e) { setErr(e.message); } finally { setUploading(false); }
  };
  return (
    <Modal title={isNew ? 'Novo material' : 'Editar material'} wide onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn" disabled={busy} onClick={() => save(false)}>Salvar rascunho</button><button className="btn btn-primary" disabled={busy || uploading} onClick={() => save(true)}>Publicar</button></>}>
      <Field label="Tipo">
        <Seg value={f.kind} onChange={(v) => set('kind', v)} ariaLabel="Tipo de material" options={Object.entries(KIND).map(([value, k]) => ({ value, label: k.label }))} />
      </Field>
      <div className="grid g2">
        <Field label="Título"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Como pedir à IA questões no estilo da banca" /></Field>
        <Field label="Categoria" hint="Agrupa os materiais para o aluno (ex.: Prompts, Cuidados, Ferramentas)."><input className="input" value={f.category} onChange={(e) => set('category', e.target.value)} /></Field>
      </div>
      <Field label="Turma" hint="Deixe em “Todas as turmas” para valer para todos; ou escolha uma turma para só ela ver.">
        <select className="select" value={f.cohort} onChange={(e) => set('cohort', e.target.value)}>
          <option value="">Todas as turmas</option>
          {(cohorts.data?.cohorts || []).map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
          {f.cohort && !(cohorts.data?.cohorts || []).some((c) => c.name === f.cohort) && <option value={f.cohort}>{f.cohort}</option>}
        </select>
      </Field>
      <Field label="Resumo (opcional)"><input className="input" maxLength={400} value={f.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
      {(f.kind === 'video' || f.kind === 'link') && (
        <Field label={f.kind === 'video' ? 'Link do vídeo' : 'Link'} hint={f.kind === 'video' ? 'YouTube e Vimeo abrem dentro da plataforma; outros links abrem em nova aba.' : 'Precisa começar com https://. Para arquivos no Google Drive: Compartilhar → “Qualquer pessoa com o link” → copie o link.'}>
          <input className="input" inputMode="url" value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </Field>
      )}
      {f.kind === 'file' && (
        <Field label="Arquivo" hint="PDF, imagem (PNG, JPG, WEBP) ou Office (DOCX, PPTX, XLSX), até 20 MB.">
          <div className="row wrap" style={{ gap: 8 }}>
            <label className="btn"><Upload size={16} aria-hidden="true" />{uploading ? 'Enviando…' : f.file_id ? 'Trocar arquivo' : 'Escolher arquivo'}<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} /></label>
            {f.file_name && <span className="small"><FileText size={14} aria-hidden="true" /> {f.file_name}</span>}
          </div>
        </Field>
      )}
      <Field label={f.kind === 'text' ? 'Texto' : 'Texto complementar (opcional)'} hint="Separe parágrafos com uma linha em branco.">
        <textarea className="textarea" rows={f.kind === 'text' ? 10 : 4} value={f.body} onChange={(e) => set('body', e.target.value)} />
      </Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
