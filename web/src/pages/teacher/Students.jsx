import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, UserPlus, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, todayLocal } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Avatar, Card, Empty, Field, Modal, Seg } from '../../components/ui.jsx';
import { LinkBox, useEditais } from '../../components/teacher.jsx';

const STATUS = { active: { label: 'Ativo', cls: 'good' }, invited: { label: 'Convite pendente', cls: 'warning' }, disabled: { label: 'Desativado', cls: '' } };
const daysUntil = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayLocal()}T00:00:00Z`)) / 86400000);
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
  vence: (a, b) => (a.access_until || '9999').localeCompare(b.access_until || '9999') || a.name.localeCompare(b.name, 'pt-BR'),
  parados: (a, b) => (a.last_activity || '').localeCompare(b.last_activity || '') || a.name.localeCompare(b.name, 'pt-BR'),
};
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function Students() {
  const state = useAsync(() => api.get('/teacher/students'), []);
  const [sp, setSp] = useSearchParams();
  const creating = sp.get('novo') === '1';
  const setCreating = (v) => { const n = new URLSearchParams(sp); if (v) n.set('novo', '1'); else n.delete('novo'); setSp(n, { replace: true }); };
  return (
    <Page title="Alunos" eyebrow="Mentoria" topbar={false}
      subtitle="Convide alunos, vincule a editais e acompanhe cada um pelo Raio-X."
      actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><UserPlus size={16} aria-hidden="true" />Convidar aluno</button>}>
      <Async state={state}>{({ students }) => <StudentList students={students} />}</Async>
      {creating && <CreateStudentModal onClose={() => setCreating(false)} onCreated={() => state.reload({ silent: true })} />}
    </Page>
  );
}

function StudentList({ students }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const hasEnded = students.some((s) => s.plan === 'ended');
  const [plan, setPlan] = useState(hasEnded ? 'active' : 'all');
  const [limit, setLimit] = useState(200);
  const [sort, setSort] = useState('name');
  const byPlan = students.filter((s) => plan === 'all' || s.plan === plan);
  const list = byPlan.filter((s) => (status === 'all' || s.status === status) && (!q || norm(s.name).includes(norm(q)) || norm(s.email).includes(norm(q)))).sort(SORTS[sort]);
  const count = (st) => byPlan.filter((s) => s.status === st).length;
  if (!students.length) return <div className="card"><Empty icon={Users} title="Nenhum aluno cadastrado">Use “Convidar aluno”: você informa nome e e-mail, e o aluno completa o cadastro pelo link.</Empty></div>;
  return (
    <Card pad={false}>
      <div className="card-pad row wrap" style={{ gap: 10 }}>
        <div className="row" style={{ flex: '1 1 260px', gap: 6 }}>
          <Search size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
          <input className="input input-sm" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar aluno" />
        </div>
        {hasEnded && <Seg value={plan} onChange={setPlan} ariaLabel="Plano" options={[
          { value: 'active', label: `Plano ativo (${students.filter((s) => s.plan === 'active').length})` },
          { value: 'ended', label: `Encerrados (${students.filter((s) => s.plan === 'ended').length})` },
          { value: 'all', label: 'Todos' },
        ]} />}
        <select className="select input-sm" style={{ maxWidth: 210 }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
          <option value="name">Ordenar: nome</option>
          <option value="vence">Ordenar: vence primeiro</option>
          <option value="parados">Ordenar: parados primeiro</option>
        </select>
        <Seg value={status} onChange={setStatus} ariaLabel="Situação" options={[
          { value: 'all', label: `Todos (${byPlan.length})` }, { value: 'active', label: `Ativos (${count('active')})` },
          { value: 'invited', label: `Convite pendente (${count('invited')})` }, { value: 'disabled', label: `Desativados (${count('disabled')})` },
        ]} />
      </div>
      <div className="table-wrap">
        <table className="tbl clickable">
          <thead><tr><th>Aluno</th><th className="hide-mobile">Editais</th><th className="hide-mobile">Turma</th><th className="hide-mobile">Fim do plano</th><th>Última atividade</th><th>Situação</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((s) => (
              <tr key={s.id} onClick={() => nav(`/professora/alunos/${s.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/professora/alunos/${s.id}`)}>
                <td><div className="row" style={{ gap: 10 }}><Avatar name={s.name} photo={s.photo_file_id} /><div style={{ minWidth: 0 }}><div className="bold ellipsis">{s.name}</div><div className="xs muted ellipsis">{s.email}</div></div></div></td>
                <td className="hide-mobile small">{s.enrollments.map((e) => e.edital_name).join(', ') || <span className="muted">Sem edital</span>}</td>
                <td className="hide-mobile small"><span className="ellipsis" style={{ display: 'block', maxWidth: 200 }}>{s.cohort || '—'}</span></td>
                <td className="hide-mobile small">{s.plan === 'ended' ? <span className="eng-badge eng-ended-soft">Encerrado</span> : s.access_until ? <>{fmtDate(s.access_until)}<VenceTag iso={s.access_until} /></> : <span className="muted">—</span>}</td>
                <td className="small">{s.last_activity ? fmtDate(s.last_activity) : <span className="muted">—</span>}</td>
                <td><span className={`tag ${STATUS[s.status]?.cls || ''}`}>{STATUS[s.status]?.label || s.status}</span>{s.extra_reviews_allowed && <span className="tag brand" style={{ marginLeft: 4 }}>Revisões extras</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <div className="card-pad"><p className="small muted">Nenhum aluno encontrado.</p></div>}
      {list.length > limit && <div className="card-pad"><button className="btn btn-sm" onClick={() => setLimit(limit + 300)}>Mostrar mais ({list.length - limit} restantes)</button></div>}
    </Card>
  );
}

function VenceTag({ iso }) {
  const n = daysUntil(iso);
  if (n > 30) return null;
  const tone = n < 0 ? 'danger' : n <= 7 ? 'danger' : 'warning';
  const dias = (k) => `${k} ${k === 1 ? 'dia' : 'dias'}`;
  return <div className="xs" style={{ color: tone === 'danger' ? 'var(--critical)' : 'var(--warning)', fontWeight: 650, whiteSpace: 'nowrap' }}>{n < 0 ? `venceu há ${dias(-n)}` : n === 0 ? 'vence hoje' : `vence em ${dias(n)}`}</div>;
}

export function CreateStudentModal({ onClose, onCreated }) {
  const editais = useEditais();
  const { user } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', edital_ids: [] });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const toggle = (id) => setF((x) => ({ ...x, edital_ids: x.edital_ids.includes(id) ? x.edital_ids.filter((y) => y !== id) : [...x.edital_ids, id] }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/teacher/students', f);
      setDone(r);
      toast.success('Aluno cadastrado.');
      onCreated?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (done) {
    return (
      <Modal title="Convite criado" onClose={onClose} footer={<><button className="btn" onClick={() => { setDone(null); setF({ name: '', email: '', edital_ids: f.edital_ids }); }}>Convidar outro</button><button className="btn btn-primary" onClick={onClose}>Concluir</button></>}>
        <p className="ink2">Envie este link para <b>{done.user.name}</b> ({done.user.email}). Pelo link, o aluno informa CPF, telefone e endereço, aceita os termos e cria a senha.</p>
        <LinkBox url={done.invite.url} note={`Válido até ${fmtDate(done.invite.expires_at.slice(0, 10))}. Por segurança, o link só aparece agora — se perder, gere um novo no Raio-X do aluno.`} />
      </Modal>
    );
  }
  const list = editais.data?.editais || [];
  return (
    <Modal title="Convidar aluno" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || f.name.trim().length < 3 || !f.email.includes('@')} onClick={save}>{busy ? 'Criando…' : 'Criar convite'}</button></>}>
      <Field label="Nome completo"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="E-mail" hint="É o login do aluno."><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Editais">
        {list.length === 0 ? <p className="small muted">{user.role === 'teacher' ? 'Crie um edital antes para já vincular o aluno (ou vincule depois).' : 'Nenhum edital disponível.'}</p> : (
          <div className="stack-sm">
            {list.map((e) => (
              <label key={e.id} className="check"><input type="checkbox" checked={f.edital_ids.includes(e.id)} onChange={() => toggle(e.id)} /><span>{e.name} <span className="muted xs">· {e.topics_count} conteúdos</span></span></label>
            ))}
          </div>
        )}
      </Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
