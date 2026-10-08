import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/store.jsx';
import { Field, Loading } from '../components/ui.jsx';
import { BrandLogo, OneUpSignature, ReviseLink, ThemeMenu } from '../components/Brand.jsx';
import { BRAND } from '../lib/brand.js';

export function homeFor(user) {
  if (!user) return '/login';
  if (user.role === 'platform_admin') return '/plataforma';
  if (user.role === 'mentor') return '/professora/editais';
  if (user.role === 'teacher' || user.role === 'coordinator') return '/professora';
  return '/';
}

function AuthShell({ children, wide, tenant }) {
  return (
    <div className="auth-wrap">
      <div className="auth-side">
        <div className="auth-side-center">
          <BrandLogo tenant={tenant} forceVariant="white" className="auth-hero-logo" />
          <div className="auth-product">{BRAND.product}</div>
        </div>
        <OneUpSignature tone="on-dark" />
      </div>
      <div className="auth-form">
        <ThemeMenu className="auth-theme" />
        <div className="auth-stack">
          <div className="auth-logo-mobile"><BrandLogo tenant={tenant} forceVariant="form" /><span className="auth-product-sm">{BRAND.product}</span></div>
          <div className={`auth-card ${wide ? 'wide' : ''}`}>{children}</div>
          <div className="auth-foot"><ReviseLink /><OneUpSignature tone="adaptive" className="auth-foot-sig" /></div>
        </div>
      </div>
    </div>
  );
}

/** Campo com ícone (e-mail, senha) e botão de mostrar/ocultar a senha. */
function IconField({ label, icon: Icon, type = 'text', value, onChange, autoComplete, placeholder, reveal }) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-icon">
        <Icon size={18} aria-hidden="true" />
        <input id={id} className="input" type={reveal && show ? 'text' : type} autoComplete={autoComplete} placeholder={placeholder} required value={value} onChange={onChange} />
        {reveal && <button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
      </div>
    </div>
  );
}

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const u = await login(f.email, f.password);
      const from = loc.state?.from;
      nav(from && from !== '/login' ? from : homeFor(u), { replace: true });
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell>
      <div><h1>Entrar</h1><p className="muted mt-sm">Bem-vindo de volta.</p></div>
      <form className="stack" onSubmit={submit}>
        <IconField label="E-mail" icon={Mail} type="email" autoComplete="email" placeholder="Seu e-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <IconField label="Senha" icon={Lock} type="password" autoComplete="current-password" placeholder="Sua senha" reveal value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {err && <div className="error-box" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block btn-enter" disabled={busy}><span>{busy ? 'Entrando…' : 'Entrar'}</span><ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <div className="row between small">
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </div>
      <p className="xs muted">Ainda não tem acesso? O cadastro é feito pelo link de convite enviado pela sua professora.</p>
    </AuthShell>
  );
}

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const maskCpf = (v) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (v) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length <= 10 ? d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2') : d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2'); };
const maskCep = (v) => v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

/** Campos de cadastro do aluno (CPF, telefone, endereço) + aceite dos termos. */
function ProfileFields({ f, set, errors }) {
  const e = errors || {};
  return (
    <>
      <div className="g2 grid">
        <Field label="CPF" error={e.cpf}><input className="input" inputMode="numeric" required value={f.cpf} onChange={(ev) => set('cpf', maskCpf(ev.target.value))} placeholder="000.000.000-00" /></Field>
        <Field label="Telefone (WhatsApp)" error={e.phone}><input className="input" inputMode="tel" required autoComplete="tel" value={f.phone} onChange={(ev) => set('phone', maskPhone(ev.target.value))} placeholder="(00) 00000-0000" /></Field>
      </div>
      <Field label="Data de nascimento" error={e.birth_date}><input className="input" type="date" required value={f.birth_date || ''} onChange={(ev) => set('birth_date', ev.target.value)} /></Field>
      <div className="g3 grid">
        <Field label="CEP" error={e.postal_code}><input className="input" inputMode="numeric" required autoComplete="postal-code" value={f.postal_code} onChange={(ev) => set('postal_code', maskCep(ev.target.value))} placeholder="00000-000" /></Field>
        <div style={{ gridColumn: 'span 2' }}><Field label="Endereço" error={e.address_line}><input className="input" required autoComplete="address-line1" value={f.address_line} onChange={(ev) => set('address_line', ev.target.value)} placeholder="Rua, avenida…" /></Field></div>
      </div>
      <div className="g3 grid">
        <Field label="Número" error={e.address_number}><input className="input" required value={f.address_number} onChange={(ev) => set('address_number', ev.target.value)} /></Field>
        <div style={{ gridColumn: 'span 2' }}><Field label="Complemento (opcional)"><input className="input" value={f.address_complement} onChange={(ev) => set('address_complement', ev.target.value)} /></Field></div>
      </div>
      <div className="g3 grid">
        <Field label="Bairro" error={e.district}><input className="input" required value={f.district} onChange={(ev) => set('district', ev.target.value)} /></Field>
        <Field label="Cidade" error={e.city}><input className="input" required autoComplete="address-level2" value={f.city} onChange={(ev) => set('city', ev.target.value)} /></Field>
        <Field label="UF" error={e.state}>
          <select className="select input" required value={f.state} onChange={(ev) => set('state', ev.target.value)}>
            <option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <label className="check small">
        <input type="checkbox" checked={f.terms_accepted} onChange={(ev) => set('terms_accepted', ev.target.checked)} />
        <span>Li e aceito os termos de uso e a política de privacidade. Meus dados são usados apenas pela mentoria para acompanhar meus estudos e não são compartilhados com outros alunos.</span>
      </label>
      <TermsReader />
    </>
  );
}

const EMPTY_PROFILE = { birth_date: '', cpf: '', phone: '', postal_code: '', address_line: '', address_number: '', address_complement: '', district: '', city: '', state: '', terms_accepted: false };

export function Invite() {
  const { token } = useParams();
  const { setUser } = useAuth();
  const nav = useNavigate();
  const [inv, setInv] = useState(undefined);
  const [loadErr, setLoadErr] = useState(null);
  const [f, setF] = useState({ name: '', password: '', password2: '', ...EMPTY_PROFILE });
  const [err, setErr] = useState(null);
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/auth/invite/${encodeURIComponent(token)}`)
      .then((r) => { setInv(r.invite); setF((x) => ({ ...x, name: r.invite.name })); })
      .catch((e) => { setInv(null); setLoadErr(e.message); });
  }, [token]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setErrors(null);
    if (f.password !== f.password2) return setErr('As senhas não conferem.');
    if (inv.requires_profile && !f.terms_accepted) return setErr('É preciso aceitar os termos de uso e a política de privacidade.');
    setBusy(true);
    try {
      const r = await api.post(`/auth/invite/${encodeURIComponent(token)}`, { ...f, password2: undefined });
      setUser(r.user);
      nav(homeFor(r.user), { replace: true });
    } catch (e2) {
      setErr(e2.message);
      if (e2.details && !Array.isArray(e2.details)) setErrors(e2.details);
    } finally { setBusy(false); }
  };
  if (inv === undefined) return <AuthShell><Loading compact /></AuthShell>;
  if (!inv) return (
    <AuthShell>
      <h1>Convite indisponível</h1>
      <div className="error-box">{loadErr}</div>
      <Link className="small" to="/login">Ir para o login</Link>
    </AuthShell>
  );
  const roleLabel = inv.role === 'student' ? 'aluno(a)' : inv.role === 'mentor' ? 'monitor(a)' : inv.role === 'coordinator' ? 'coordenador(a)' : 'professor(a)';
  return (
    <AuthShell wide={inv.requires_profile} tenant={inv.tenant}>
      <div>
        <div className="eyebrow">{inv.tenant?.brand?.display_name || inv.tenant?.name}</div>
        <h1>Complete seu cadastro</h1>
        <p className="muted mt-sm">Você foi convidado(a) como {roleLabel}. Seu acesso será feito com o e-mail <b>{inv.email}</b>.</p>
      </div>
      <form className="stack" onSubmit={submit} noValidate={false}>
        <Field label="Nome completo"><input className="input" required minLength={3} autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        {inv.requires_profile && <ProfileFields f={f} set={set} errors={errors} />}
        <div className="g2 grid">
          <Field label="Crie uma senha" hint="Mínimo de 8 caracteres, com letras e números."><input className="input" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
          <Field label="Repita a senha"><input className="input" type="password" required autoComplete="new-password" value={f.password2} onChange={(e) => set('password2', e.target.value)} /></Field>
        </div>
        {err && <div className="error-box" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Salvando…' : 'Concluir cadastro e entrar'}</button>
      </form>
      <p className="xs muted row" style={{ gap: 6 }}><ShieldCheck size={14} aria-hidden="true" />Seus dados ficam protegidos e visíveis apenas para a sua professora e a equipe ONE UP.</p>
    </AuthShell>
  );
}

/** Alunos migrados da V1 completam CPF/endereço antes de continuar. */
export function CompleteProfile() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ ...EMPTY_PROFILE, phone: user?.phone ? maskPhone(user.phone) : '' });
  const [err, setErr] = useState(null);
  const [errors, setErrors] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setErrors(null);
    if (!f.terms_accepted) return setErr('É preciso aceitar os termos de uso e a política de privacidade.');
    setBusy(true);
    try {
      const r = await api.post('/auth/complete-profile', f);
      setUser(r.user);
      nav('/', { replace: true });
    } catch (e2) {
      setErr(e2.message);
      if (e2.details && !Array.isArray(e2.details)) setErrors(e2.details);
    } finally { setBusy(false); }
  };
  return (
    <AuthShell wide tenant={user?.tenant}>
      <div>
        <div className="eyebrow">Atualização de cadastro</div>
        <h1>Olá, {user?.name?.split(' ')[0]}!</h1>
        <p className="muted mt-sm">A plataforma foi atualizada. Para continuar, complete seus dados de cadastro — leva menos de um minuto. Todo o seu histórico de estudos foi mantido.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <ProfileFields f={f} set={set} errors={errors} />
        {err && <div className="error-box" role="alert">{err}</div>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar e continuar'}</button>
      </form>
      <button className="btn btn-ghost btn-sm" onClick={async () => { await logout(); nav('/login'); }}>Sair</button>
    </AuthShell>
  );
}

export function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <div><h1>Recuperar senha</h1><p className="muted mt-sm">Enviaremos um link para criar uma nova senha.</p></div>
      {msg ? <div className="info-box">{msg}</div> : (
        <form className="stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { setMsg((await api.post('/auth/forgot', { email })).message); } catch (e2) { setErr(e2.message); } finally { setBusy(false); } }}>
          <Field label="E-mail"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {err && <div className="error-box" role="alert">{err}</div>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>Enviar link</button>
        </form>
      )}
      <Link className="small" to="/login">← Voltar ao login</Link>
    </AuthShell>
  );
}

export function Reset() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const token = sp.get('token');
  return (
    <AuthShell>
      <div><h1>Nova senha</h1></div>
      {!token ? <div className="error-box">Link inválido. Solicite um novo.</div> : done ? (
        <><div className="info-box">{done}</div><button className="btn btn-primary" onClick={() => nav('/login')}>Ir para o login</button></>
      ) : (
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault(); setErr(null);
          if (pw !== pw2) return setErr('As senhas não conferem.');
          try { setDone((await api.post('/auth/reset', { token, password: pw })).message); } catch (e2) { setErr(e2.message); }
        }}>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números."><input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <Field label="Repita a senha"><input className="input" type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
          {err && <div className="error-box" role="alert">{err}</div>}
          <button className="btn btn-primary btn-lg btn-block">Salvar nova senha</button>
        </form>
      )}
    </AuthShell>
  );
}

/** Texto dos termos vigentes, recolhido por padrão (a pessoa lê antes de aceitar). */
export function TermsReader({ authed = false }) {
  const [t, setT] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || t) return;
    api.get(authed ? '/me/terms' : '/public/terms').then((r) => setT(r.terms)).catch(() => setT(false));
  }, [open, t, authed]);
  return (
    <div className="small">
      <button type="button" className="btn btn-sm btn-ghost" style={{ paddingLeft: 0 }} onClick={() => setOpen(!open)}>{open ? 'Ocultar os termos' : 'Ler os termos e a política de privacidade'}</button>
      {open && (t === null ? <p className="muted">Carregando…</p> : t === false ? <p className="muted">Não foi possível carregar os termos agora.</p> : (
        <div className="card" style={{ padding: 12, maxHeight: 280, overflowY: 'auto', whiteSpace: 'pre-wrap', boxShadow: 'none' }}>
          <b>{t.title}</b> <span className="muted xs">· versão {t.version}</span>
          {'\n\n'}{t.body}
        </div>
      ))}
    </div>
  );
}
