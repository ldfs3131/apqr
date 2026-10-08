import { useMemo, useState } from 'react';
import { CircleCheck, ExternalLink, FileText, FolderOpen, Link2, PlayCircle, Sparkles, Type } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { Page } from '../components/Layout.jsx';
import { Async, Empty, Modal } from '../components/ui.jsx';

const KIND = {
  text: { label: 'Texto', icon: Type },
  video: { label: 'Vídeo', icon: PlayCircle },
  link: { label: 'Link', icon: Link2 },
  file: { label: 'Arquivo', icon: FileText },
};

/** Converte links do YouTube/Vimeo em endereço de incorporação; outros vídeos abrem em nova aba. */
export function embedUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v') || (/^\/(shorts|embed|live)\/([\w-]{6,})/.exec(u.pathname) || [])[2];
      return v ? `https://www.youtube-nocookie.com/embed/${v}` : null;
    }
    if (u.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes('vimeo.com')) { const id = u.pathname.split('/').filter(Boolean).pop(); return /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null; }
  } catch { /* ignore */ }
  return null;
}

const isDrive = (url) => { try { const h = new URL(url).hostname; return h === 'drive.google.com' || h === 'docs.google.com'; } catch { return false; } };

/** Materiais da mentoria: aulas em vídeo, PDFs, links do Drive e orientações (somente leitura para o aluno; ele marca o que já viu). */
export default function Contents() {
  const state = useAsync(() => api.get('/me/contents'), []);
  return (
    <Page title="Materiais" eyebrow="Mentoria" subtitle="Aulas, PDFs, links e orientações da sua professora, inclusive sobre como usar inteligência artificial nos estudos.">
      <Async state={state}>{({ items }) => <ContentList items={items} onChanged={() => state.reload({ silent: true })} />}</Async>
    </Page>
  );
}

export function ContentList({ items, onChanged }) {
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(null);
  const cats = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const list = items.filter((i) => !cat || i.category === cat);
  if (!items.length) return <div className="card"><Empty icon={Sparkles} title="Nenhum material publicado ainda">Quando a sua professora publicar vídeos, PDFs, links ou textos, eles aparecem aqui.</Empty></div>;
  return (
    <div className="stack">
      {cats.length > 1 && (
        <div className="row wrap" style={{ gap: 6 }} role="group" aria-label="Categorias">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Todos</button>
          {cats.map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      <div className="grid g3">
        {list.map((it) => {
          const K = KIND[it.kind] || KIND.text;
          return (
            <button key={it.id} className="card content-card" onClick={() => setOpen(it)} style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
              <span className="content-kind"><K.icon size={14} aria-hidden="true" />{K.label} · {it.category}{it.done && <span className="content-done"><CircleCheck size={13} aria-hidden="true" />Visto</span>}</span>
              <b>{it.title}</b>
              {it.summary && <span className="small ink2">{it.summary}</span>}
            </button>
          );
        })}
      </div>
      {open && <ContentModal item={open} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </div>
  );
}

function ContentModal({ item, onClose, onChanged }) {
  const toast = useToast();
  const [done, setDone] = useState(!!item.done);
  const toggle = async () => {
    const next = !done;
    try { await api.post(`/me/contents/${item.id}/done`, { done: next }); setDone(next); onChanged?.(); } catch (e) { toast.error(e); }
  };
  const embed = item.kind === 'video' && item.url ? embedUrl(item.url) : null;
  return (
    <Modal title={item.title} onClose={onClose} wide footer={<button className={`btn ${done ? '' : 'btn-primary'}`} onClick={toggle}><CircleCheck size={16} aria-hidden="true" />{done ? 'Visto (desmarcar)' : 'Marcar como visto'}</button>}>
      {item.summary && <p className="ink2">{item.summary}</p>}
      {embed && <div className="video-frame"><iframe src={embed} title={item.title} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>}
      {item.body && <div className="content-body">{item.body.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}</div>}
      {item.url && !embed && <a className="btn" href={item.url} target="_blank" rel="noopener noreferrer">{isDrive(item.url) ? <FolderOpen size={16} aria-hidden="true" /> : <ExternalLink size={16} aria-hidden="true" />}{isDrive(item.url) ? 'Abrir no Google Drive' : `Abrir ${item.kind === 'video' ? 'vídeo' : 'link'}`}</a>}
      {item.file_id && <a className="btn" href={`/api/files/${item.file_id}`} target="_blank" rel="noopener noreferrer"><FileText size={16} aria-hidden="true" />{item.file_mime === 'application/pdf' ? 'Abrir PDF' : 'Baixar arquivo'}</a>}
    </Modal>
  );
}
