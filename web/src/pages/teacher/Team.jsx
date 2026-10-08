import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDateTime } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Alert, Async, Avatar, Card, Field, Modal } from '../../components/ui.jsx';
import { LinkBox } from '../../components/teacher.jsx';

const ROLES = {
  teacher: { label: 'Professora / Administrador', hint: 'Acesso total: alunos, financeiro, regras do método e equipe. Cada pessoa usa um e-mail próprio.' },
  coordinator: { label: 'Coordenadora', hint: 'Vê todos os alunos, edita cadastro (inclusive CPF), acessos e editais. Não vê financeiro nem configurações.' },
  mentor: { label: 'Monitor', hint: 'Somente editais e materiais. Não vê nenhum dado de aluno.' },
};

/** Equipe: professora/administrador (cada um com login próprio), coordenadora e monitores. */
export default function Team() {
  const state = useAsync(() => api.get('/teacher/team'), []);
  const [creating, setCreating] = useState(false);
  return (
    <Page title="Equipe" eyebrow="Ambiente" topbar={false}
      subtitle="Cada pessoa entra com o próprio e-mail. O perfil define o que ela enxerga."
      actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><UserPlus size={16} aria-hidden="true" />Convidar pessoa</button>}>
      <Async state={state}>{(t) => (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Pessoa</th><th>Perfil</th><th className="hide-mobile">Último acesso</th></tr></thead>
              <tbody>
                {t.team.map((m) => (
                  <tr key={m.id}>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={m.name} /><div><div className="bold">{m.name}</div><div className="xs muted">{m.email}</div></div></div></td>
                    <td><span className={`tag ${m.role === 'teacher' ? 'brand' : ''}`}>{ROLES[m.role]?.label || m.role}</span>{m.status === 'invited' && <span className="tag warning" style={{ marginLeft: 4 }}>Convite pendente</span>}</td>
                    <td className="small hide-mobile">{m.last_login_at ? fmtDateTime(m.last_login_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}</Async>
      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={() => state.reload({ silent: true })} />}
    </Page>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', email: '', role: 'coordinator' });
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  if (done) {
    return (
      <Modal title="Convite criado" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Concluir</button>}>
        <p className="small ink2">Envie este link para <b>{done.user.name}</b>. Pelo link, a pessoa cria a própria senha.</p>
        <LinkBox url={done.invite.url} note="Por segurança, o link só aparece agora." />
      </Modal>
    );
  }
  return (
    <Modal title="Convidar pessoa" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={f.name.trim().length < 3 || !f.email.includes('@')} onClick={async () => {
        setErr(null);
        try { setDone(await api.post('/teacher/team', f)); onCreated(); } catch (e) { setErr(e.message); }
      }}>Criar convite</button></>}>
      <Field label="Perfil">
        <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      <p className="small muted">{ROLES[f.role].hint}</p>
      {f.role === 'teacher' && <Alert tone="info">O e-mail é único na plataforma. Para a mesma pessoa ter dois logins (professora e administrador), use e-mails diferentes, por exemplo nome@gmail.com e nome+apqr@gmail.com.</Alert>}
      <Field label="Nome"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
