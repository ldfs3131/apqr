import { useState } from 'react';
import { Activity, ArrowRightLeft, Bot, Building2, Database, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { setActingTenant, useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { auditLabel, ROLE_LABEL } from '../../lib/audit.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Avatar, Card, Confirm, Empty, Field, Modal, Seg, Stat } from '../../components/ui.jsx';
import { LinkBox } from '../../components/teacher.jsx';

/** Entra num ambiente como admin ONE UP (auditado) e abre a área da professora daquele ambiente. */
async function enterTenant(t, toast) {
  try {
    const r = await api.post(`/platform/tenants/${t.id}/enter`);
    setActingTenant({ id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug, brand: r.tenant.brand });
    window.location.assign('/professora');
  } catch (e) { toast.error(e); }
}

export function PlatformOverview() {
  const state = useAsync(() => api.get('/platform/overview'), []);
  const toast = useToast();
  const { user } = useAuth();
  return (
    <Page title={`Olá, ${user.name.split(' ')[0]}`} eyebrow="Console ONE UP" topbar={false} subtitle="Visão geral dos ambientes da plataforma.">
      <Async state={state}>
        {(d) => (
          <div className="stack" style={{ gap: 18 }}>
            <div className="grid g4">
              <Stat icon={Building2} label="Ambientes" value={d.totals.tenants} />
              <Stat icon={Users} label="Alunos" value={d.totals.students} />
              <Stat icon={Bot} label="Relatórios IA (30 dias)" value={d.totals.ai_reports_30d} sub={`Custo estimado US$ ${Number(d.totals.ai_cost_30d).toFixed(2)}`} />
              <Stat icon={Database} label="Sistema" value={d.system.database === 'postgres' ? 'PostgreSQL' : 'Local'} sub={`IA: ${d.system.ai.configured ? `${d.system.ai.provider} (${d.system.ai.model})` : 'não configurada'} · Node ${d.system.node}`} />
            </div>
            <Card title="Ambientes" icon={Building2} pad={false}>
              {d.tenants.length === 0 ? <div className="card-pad"><p className="small muted">Nenhum ambiente.</p></div> : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead><tr><th>Ambiente</th><th>Professora</th><th className="r">Alunos ativos</th><th className="r">Ativos em 7 dias</th><th className="r">Editais</th><th>Situação</th><th /></tr></thead>
                    <tbody>
                      {d.tenants.map((t) => (
                        <tr key={t.id}>
                          <td><b>{t.name}</b><div className="xs muted">{t.slug}</div></td>
                          <td className="small">{t.teacher_name || '—'}</td>
                          <td className="r num">{t.active_students}</td>
                          <td className="r num">{t.active_7d}</td>
                          <td className="r num">{t.editais}</td>
                          <td><span className={`tag ${t.status === 'active' ? 'good' : 'critical'}`}>{t.status === 'active' ? 'Ativo' : 'Suspenso'}</span></td>
                          <td className="r"><button className="btn btn-sm" onClick={() => enterTenant(t, toast)}><ArrowRightLeft size={15} aria-hidden="true" />Entrar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </Async>
    </Page>
  );
}

export function PlatformTenants() {
  const state = useAsync(() => api.get('/platform/overview'), []);
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [modal, setModal] = useState(null);
  const reload = () => state.reload({ silent: true });
  return (
    <Page title="Ambientes" eyebrow="Console ONE UP" topbar={false} subtitle="Cada professora tem um ambiente isolado: alunos, editais e dados nunca se misturam."
      actions={<button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Novo ambiente</button>}>
      <Async state={state}>
        {(d) => d.tenants.length === 0 ? <div className="card"><Empty icon={Building2} title="Nenhum ambiente">Crie o ambiente da professora e envie o convite para ela.</Empty></div> : (
          <div className="grid g2">
            {d.tenants.map((t) => (
              <Card key={t.id} title={t.name} subtitle={`${t.slug} · criado em ${fmtDate(t.created_at.slice(0, 10))}`}
                action={<span className={`tag ${t.status === 'active' ? 'good' : 'critical'}`}>{t.status === 'active' ? 'Ativo' : 'Suspenso'}</span>}>
                <dl className="kv small">
                  <dt>Professora</dt><dd>{t.teacher_name || '—'}</dd>
                  <dt>Alunos</dt><dd>{t.students} ({t.active_students} ativos, {t.active_7d} estudaram em 7 dias)</dd>
                  <dt>Editais</dt><dd>{t.editais}</dd>
                </dl>
                <div className="row wrap mt" style={{ gap: 6 }}>
                  <button className="btn btn-sm btn-primary" onClick={() => enterTenant(t, toast)}><ArrowRightLeft size={15} aria-hidden="true" />Entrar no ambiente</button>
                  <button className="btn btn-sm" onClick={async () => { try { setModal({ invite: (await api.post(`/platform/tenants/${t.id}/teacher-invite`)).invite }); } catch (e) { toast.error(e); } }}>Convite da professora</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setModal({ status: t })}>{t.status === 'active' ? 'Suspender' : 'Reativar'}</button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Async>
      {creating && <CreateTenantModal onClose={() => setCreating(false)} onCreated={reload} />}
      {modal?.invite && (
        <Modal title="Convite da professora" onClose={() => setModal(null)} footer={<button className="btn btn-primary" onClick={() => setModal(null)}>Concluir</button>}>
          <p className="small ink2">O convite anterior foi invalidado. Envie este link à professora.</p>
          <LinkBox url={modal.invite.url} note="Por segurança, o link só aparece agora." />
        </Modal>
      )}
      {modal?.status && (
        <Confirm title={modal.status.status === 'active' ? 'Suspender ambiente?' : 'Reativar ambiente?'} danger={modal.status.status === 'active'} confirmLabel={modal.status.status === 'active' ? 'Suspender' : 'Reativar'} onClose={() => setModal(null)}
          message={modal.status.status === 'active' ? 'A professora, a equipe e os alunos deste ambiente não conseguirão entrar até a reativação. Nenhum dado é apagado.' : 'O ambiente volta a funcionar normalmente.'}
          onConfirm={async () => { try { await api.patch(`/platform/tenants/${modal.status.id}`, { status: modal.status.status === 'active' ? 'suspended' : 'active' }); setModal(null); reload(); } catch (e) { toast.error(e); } }} />
      )}
    </Page>
  );
}

function CreateTenantModal({ onClose, onCreated }) {
  const [f, setF] = useState({ name: '', slug: '', teacher_name: '', teacher_email: '' });
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const slugify = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (done) {
    return (
      <Modal title="Ambiente criado" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Concluir</button>}>
        <p className="small ink2">Envie este link para <b>{done.teacher.name}</b> ({done.teacher.email}). Ela cria a senha e já entra na Central da mentoria. As regras do APQR começam com os padrões (mínimo de 20 questões, consolidação acima de 70%) — ela pode ajustar depois.</p>
        <LinkBox url={done.invite.url} note="Por segurança, o link só aparece agora. Se perder, gere outro no cartão do ambiente." />
      </Modal>
    );
  }
  return (
    <Modal title="Novo ambiente" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { setDone(await api.post('/platform/tenants', f)); onCreated(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
      }}>{busy ? 'Criando…' : 'Criar ambiente'}</button></>}>
      <Field label="Nome do ambiente" hint="Como aparece para os alunos (ex.: Mentoria Pollyana Lyra)."><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug && f.slug !== slugify(f.name) ? f.slug : slugify(e.target.value) })} /></Field>
      <Field label="Identificador" hint="Letras minúsculas, números e hífen. Usado no endereço do logotipo e, no futuro, no subdomínio."><input className="input" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Field>
      <div className="grid g2">
        <Field label="Nome da professora"><input className="input" value={f.teacher_name} onChange={(e) => setF({ ...f, teacher_name: e.target.value })} /></Field>
        <Field label="E-mail da professora"><input className="input" type="email" value={f.teacher_email} onChange={(e) => setF({ ...f, teacher_email: e.target.value })} /></Field>
      </div>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}

export function PlatformUsers() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState({ q: '', role: '' });
  const state = useAsync(() => api.get(`/platform/users${qs(query)}`), [query]);
  const toast = useToast();
  const { user: me } = useAuth();
  const [toggle, setToggle] = useState(null);
  return (
    <Page title="Usuários" eyebrow="Console ONE UP" topbar={false} subtitle="Busca global de professoras, monitores, alunos e administradores.">
      <Card pad={false}>
        <form className="card-pad row wrap" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); setQuery({ q, role }); }}>
          <div className="row" style={{ flex: '1 1 260px', gap: 6 }}><Search size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} /><input className="input input-sm" placeholder="Nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar usuário" /></div>
          <Seg value={role} onChange={(v) => { setRole(v); setQuery({ q, role: v }); }} ariaLabel="Papel" options={[{ value: '', label: 'Todos' }, { value: 'teacher', label: 'Professoras' }, { value: 'mentor', label: 'Monitores' }, { value: 'student', label: 'Alunos' }, { value: 'platform_admin', label: 'ONE UP' }]} />
          <button className="btn btn-sm">Buscar</button>
        </form>
        <Async state={state}>
          {({ users }) => users.length === 0 ? <div className="card-pad"><p className="small muted">Nenhum usuário encontrado.</p></div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Usuário</th><th>Papel</th><th className="hide-mobile">Ambiente</th><th className="hide-mobile">Último acesso</th><th>Situação</th><th /></tr></thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><div className="row" style={{ gap: 10 }}><Avatar name={u.name} /><div><div className="bold">{u.name}</div><div className="xs muted">{u.email}</div></div></div></td>
                      <td><span className="tag">{ROLE_LABEL[u.role]}</span></td>
                      <td className="small hide-mobile">{u.tenant_name || '—'}</td>
                      <td className="small hide-mobile">{u.last_login_at ? fmtDateTime(u.last_login_at) : '—'}</td>
                      <td><span className={`tag ${u.status === 'active' ? 'good' : u.status === 'invited' ? 'warning' : ''}`}>{u.status === 'active' ? 'Ativo' : u.status === 'invited' ? 'Convite pendente' : 'Desativado'}</span></td>
                      <td className="r">{u.status !== 'invited' && u.id !== me.id && <button className="btn btn-sm btn-ghost" onClick={() => setToggle(u)}>{u.status === 'active' ? 'Desativar' : 'Reativar'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Card>
      {toggle && <Confirm title={toggle.status === 'active' ? 'Desativar usuário?' : 'Reativar usuário?'} danger={toggle.status === 'active'} confirmLabel={toggle.status === 'active' ? 'Desativar' : 'Reativar'} onClose={() => setToggle(null)}
        message={`${toggle.name} (${toggle.email}). ${toggle.status === 'active' ? 'A pessoa sai de todas as sessões e não consegue mais entrar. Nenhum dado é apagado.' : 'A pessoa volta a entrar com a mesma senha.'}`}
        onConfirm={async () => { try { await api.patch(`/platform/users/${toggle.id}`, { status: toggle.status === 'active' ? 'disabled' : 'active' }); setToggle(null); state.reload({ silent: true }); } catch (e) { toast.error(e); } }} />}
    </Page>
  );
}

export function PlatformAudit() {
  const tenants = useAsync(() => api.get('/platform/overview'), []);
  const [tenant, setTenant] = useState('');
  const [action, setAction] = useState('');
  const state = useAsync(() => api.get(`/platform/audit${qs({ tenant_id: tenant, action })}`), [tenant, action]);
  return (
    <Page title="Auditoria" eyebrow="Console ONE UP" topbar={false} subtitle="Registro de ações sensíveis: acesso a dados de alunos, mudanças de regras, entradas da ONE UP nos ambientes. Os 300 mais recentes."
      actions={<>
        <select className="select input-sm" style={{ width: 'auto' }} value={tenant} onChange={(e) => setTenant(e.target.value)} aria-label="Ambiente">
          <option value="">Todos os ambientes</option>
          {(tenants.data?.tenants || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="select input-sm" style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)} aria-label="Tipo de ação">
          <option value="">Todas as ações</option>
          <option value="platform.">ONE UP (plataforma)</option>
          <option value="student.">Alunos</option>
          <option value="methodology.">Regras do método</option>
          <option value="apqr.">Correções APQR</option>
          <option value="auth.">Acesso e senha</option>
          <option value="ai.">IA</option>
        </select>
      </>}>
      <Async state={state}>
        {({ audit }) => audit.length === 0 ? <div className="card"><Empty icon={ShieldCheck} title="Nenhum registro">Nada registrado com esses filtros.</Empty></div> : (
          <Card pad={false}>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th className="hide-mobile">Ambiente</th><th className="hide-mobile">Detalhes</th></tr></thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id}>
                      <td className="small nowrap">{fmtDateTime(a.created_at)}</td>
                      <td className="small">{a.actor_name || 'Sistema'}{a.actor_role && <div className="xs muted">{ROLE_LABEL[a.actor_role]}</div>}</td>
                      <td className="small"><Activity size={13} aria-hidden="true" /> {auditLabel(a.action)}</td>
                      <td className="small hide-mobile">{a.tenant_name || '—'}</td>
                      <td className="xs muted hide-mobile" style={{ maxWidth: 320, wordBreak: 'break-word' }}>{a.payload ? JSON.stringify(a.payload).slice(0, 160) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </Async>
    </Page>
  );
}
