import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CalendarDays, Copy, Plus, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, plural } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Avatar, Card, Confirm, Empty, Field, Modal, Tabs } from '../../components/ui.jsx';
import { PlanEditor, StructureEditor } from '../../components/StructureEditor.jsx';

export default function Editais() {
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const state = useAsync(() => api.get(`/teacher/editais${showArchived ? '?archived=1' : ''}`), [showArchived]);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const canEdit = user.role !== 'mentor';
  return (
    <Page title="Editais" eyebrow="Conteúdo" topbar={false}
      subtitle="Cada edital é único: todos os alunos vinculados usam as mesmas matérias e conteúdos, e o progresso é individual."
      actions={<>
        <label className="check small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Mostrar arquivados</label>
        {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Novo edital</button>}
      </>}>
      <Async state={state}>
        {({ editais }) => editais.length === 0 ? (
          <div className="card"><Empty icon={BookOpen} title="Nenhum edital" action={canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}>Criar o primeiro edital</button>}>Crie o edital, cole as matérias e conteúdos e vincule os alunos.</Empty></div>
        ) : (
          <div className="grid g3">
            {editais.map((e) => (
              <Link key={e.id} to={`/professora/editais/${e.id}`} className="card card-pad stack-sm" style={{ color: 'inherit', textDecoration: 'none', opacity: e.archived_at ? 0.6 : 1 }}>
                <div className="row between"><BookOpen size={20} aria-hidden="true" style={{ color: 'var(--brand)' }} />{e.archived_at && <span className="tag">Arquivado</span>}</div>
                <b style={{ fontSize: 16 }}>{e.name}</b>
                <span className="xs muted">{[e.role_title, e.board].filter(Boolean).join(' · ') || 'Sem cargo/banca'}</span>
                <div className="row wrap small ink2" style={{ gap: 12 }}>
                  <span>{plural(e.subjects_count, 'matéria', 'matérias')}</span>
                  <span>{plural(e.topics_count, 'conteúdo', 'conteúdos')}</span>
                  <span className="row" style={{ gap: 4 }}><Users size={14} aria-hidden="true" />{e.students_count}</span>
                </div>
                {e.exam_date && <span className="xs muted row" style={{ gap: 4 }}><CalendarDays size={13} aria-hidden="true" />Prova em {fmtDate(e.exam_date)}</span>}
              </Link>
            ))}
          </div>
        )}
      </Async>
      {creating && <EditalFormModal onClose={() => setCreating(false)} onSaved={(ed) => nav(`/professora/editais/${ed.id}`)} />}
    </Page>
  );
}

function EditalFormModal({ edital, onClose, onSaved }) {
  const [f, setF] = useState({ name: edital?.name || '', role_title: edital?.role_title || '', board: edital?.board || '', exam_date: edital?.exam_date || '', description: edital?.description || '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...f, exam_date: f.exam_date || null };
      const r = edital ? await api.patch(`/teacher/editais/${edital.id}`, body) : await api.post('/teacher/editais', body);
      onSaved(r.edital);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={edital ? 'Dados do edital' : 'Novo edital'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || f.name.trim().length < 2} onClick={save}>{busy ? 'Salvando…' : edital ? 'Salvar' : 'Criar edital'}</button></>}>
      <Field label="Nome do concurso"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex.: SES-GO 2026 — Farmacêutico" /></Field>
      <div className="grid g2">
        <Field label="Cargo"><input className="input" value={f.role_title} onChange={(e) => setF({ ...f, role_title: e.target.value })} placeholder="Farmacêutico" /></Field>
        <Field label="Banca"><input className="input" value={f.board} onChange={(e) => setF({ ...f, board: e.target.value })} /></Field>
      </div>
      <Field label="Data da prova (se conhecida)"><input type="date" className="input" value={f.exam_date} onChange={(e) => setF({ ...f, exam_date: e.target.value })} /></Field>
      <Field label="Descrição (opcional)"><textarea className="textarea" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

export function EditalEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const [showArchived, setShowArchived] = useState(false);
  const state = useAsync(() => api.get(`/teacher/editais/${id}${showArchived ? '?archived=1' : ''}`), [id, showArchived]);
  const canEdit = user.role !== 'mentor';
  return (
    <Page topbar={false}>
      <div className="row mb"><Link to="/professora/editais" className="small row" style={{ gap: 4 }}><ArrowLeft size={15} aria-hidden="true" />Editais</Link></div>
      <Async state={state}>{(d) => <EditorBody d={d} canEdit={canEdit} reload={() => state.reload({ silent: true })} showArchived={showArchived} setShowArchived={setShowArchived} />}</Async>
    </Page>
  );
}

function EditorBody({ d, canEdit, reload, showArchived, setShowArchived }) {
  const { edital, subjects, plan, enrollments } = d;
  const [tab, setTab] = useState('structure');
  const [modal, setModal] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const topics = subjects.reduce((a, s) => a + s.topics.filter((t) => !t.archived_at).length, 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card card-pad">
        <div className="row between wrap" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="eyebrow">Edital{edital.archived_at ? ' · arquivado' : ''}</div>
            <h1 style={{ margin: '2px 0 4px' }}>{edital.name}</h1>
            <div className="small ink2">{[edital.role_title, edital.board, edital.exam_date ? `Prova em ${fmtDate(edital.exam_date)}` : null].filter(Boolean).join(' · ') || 'Sem cargo, banca ou data'}</div>
            <div className="xs muted mt-sm">{plural(subjects.filter((s) => !s.archived_at).length, 'matéria', 'matérias')} · {plural(topics, 'conteúdo', 'conteúdos')} · {plural(enrollments.filter((e) => e.status === 'active').length, 'aluno', 'alunos')}</div>
          </div>
          {canEdit && (
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setModal('edit')}>Editar dados</button>
              <button className="btn btn-sm" onClick={() => setModal('duplicate')}><Copy size={15} aria-hidden="true" />Duplicar</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setModal('archive')}>{edital.archived_at ? 'Restaurar' : 'Arquivar'}</button>
            </div>
          )}
        </div>
      </section>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'structure', label: 'Matérias e conteúdos' }, { value: 'plan', label: 'Plano Global' }, { value: 'students', label: `Alunos (${enrollments.filter((e) => e.status === 'active').length})` }]} />
      {tab === 'structure' && (
        <>
          <label className="check small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />Mostrar arquivados</label>
          <StructureEditor editalId={edital.id} subjects={subjects} canEdit={canEdit && !edital.archived_at} onChange={reload} showArchived={showArchived} />
        </>
      )}
      {tab === 'plan' && <PlanEditor key={JSON.stringify(plan)} editalId={edital.id} subjects={subjects} plan={plan} canEdit={canEdit && !edital.archived_at} onChange={reload} />}
      {tab === 'students' && <EditalStudents edital={edital} enrollments={enrollments} onChange={reload} />}

      {modal === 'edit' && <EditalFormModal edital={edital} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast.success('Edital atualizado.'); reload(); }} />}
      {modal === 'duplicate' && <Confirm title="Duplicar edital?" confirmLabel="Duplicar" onClose={() => setModal(null)} message="Cria uma cópia com as mesmas matérias, conteúdos e Plano Global — sem alunos. Útil para um novo concurso do mesmo órgão."
        onConfirm={async () => { try { const r = await api.post(`/teacher/editais/${edital.id}/duplicate`); toast.success('Edital duplicado.'); setModal(null); nav(`/professora/editais/${r.edital.id}`); } catch (e) { toast.error(e); } }} />}
      {modal === 'archive' && <Confirm title={edital.archived_at ? 'Restaurar edital?' : 'Arquivar edital?'} danger={!edital.archived_at} confirmLabel={edital.archived_at ? 'Restaurar' : 'Arquivar'} onClose={() => setModal(null)}
        message={edital.archived_at ? 'O edital volta a aparecer para os alunos vinculados.' : 'Os alunos deixam de ver este edital. Nada é apagado e dá para restaurar depois.'}
        onConfirm={async () => { try { await api.post(`/teacher/editais/${edital.id}/archive`, { archived: !edital.archived_at }); setModal(null); reload(); } catch (e) { toast.error(e); } }} />}
    </div>
  );
}

function EditalStudents({ edital, enrollments, onChange }) {
  const toast = useToast();
  const all = useAsync(() => api.get('/teacher/students'), []);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState([]);
  const active = enrollments.filter((e) => e.status === 'active');
  const enrolledIds = new Set(active.map((e) => e.student_id));
  const candidates = (all.data?.students || []).filter((s) => !enrolledIds.has(s.id) && s.status !== 'disabled');
  return (
    <Card title="Alunos vinculados" action={candidates.length > 0 && !edital.archived_at && <button className="btn btn-sm btn-primary" onClick={() => { setSel([]); setPicking(true); }}><Plus size={15} aria-hidden="true" />Vincular alunos</button>}>
      {active.length === 0 ? <p className="small muted">Nenhum aluno vinculado a este edital.</p> : active.map((e) => (
        <Link key={e.id} to={`/professora/alunos/${e.student_id}`} className="row between" style={{ padding: '9px 0', borderTop: '1px solid var(--border)', color: 'inherit' }}>
          <span className="row" style={{ gap: 10 }}><Avatar name={e.name} /><span><b>{e.name}</b><div className="xs muted">{e.email}</div></span></span>
          <span className="xs muted">{e.user_status === 'invited' ? 'Convite pendente' : `desde ${fmtDate(e.created_at.slice(0, 10))}`}</span>
        </Link>
      ))}
      {picking && (
        <Modal title="Vincular alunos ao edital" onClose={() => setPicking(false)}
          footer={<><button className="btn" onClick={() => setPicking(false)}>Cancelar</button><button className="btn btn-primary" disabled={!sel.length} onClick={async () => {
            try { await api.post(`/teacher/editais/${edital.id}/enrollments`, { student_ids: sel }); toast.success(`${sel.length} aluno(s) vinculado(s).`); setPicking(false); onChange(); } catch (e) { toast.error(e); }
          }}>Vincular {sel.length || ''}</button></>}>
          <div className="stack-sm">
            <label className="check small"><input type="checkbox" checked={sel.length === candidates.length} onChange={(e) => setSel(e.target.checked ? candidates.map((c) => c.id) : [])} /><b>Selecionar todos</b></label>
            {candidates.map((c) => (
              <label key={c.id} className="check small"><input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id])} /><span>{c.name} <span className="muted xs">· {c.email}</span></span></label>
            ))}
          </div>
        </Modal>
      )}
    </Card>
  );
}
