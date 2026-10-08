import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Flame, Map, Award, ClipboardList, RefreshCcw, Timer, TrendingUp, Sparkles, CalendarDays, User, LayoutDashboard, Users, BookOpen, Trophy,
  FileText, Settings, UsersRound, Wallet, CalendarClock, Building2, ShieldCheck, Activity, LogOut, Menu, ArrowLeftRight,
} from 'lucide-react';
import { useAuth, useExam, getActingTenant, setActingTenant, useTenantBrand } from '../lib/store.jsx';
import { TimerBar } from './TimerBar.jsx';
import { Modal } from './ui.jsx';
import { BrandLogo, BrandSymbol, InstallButton, OfflineBar, OneUpSignature, ThemeMenu } from './Brand.jsx';
import { BRAND, MAKER } from '../lib/brand.js';
import { useOnline } from '../lib/pwa.js';

/** Menu do aluno agrupado: Hoje · Meu edital · Estudar · Evolução · Materiais · (Consultoria) · Mais. */
export const STUDENT_NAV = [
  { to: '/', label: 'Hoje', icon: Home, end: true },
  { to: '/edital', label: 'Meu edital', icon: Map },
  { to: '/estudos', label: 'Estudar', icon: Timer, group: ['/estudos', '/revisoes', '/questoes'] },
  { to: '/evolucao', label: 'Evolução', icon: TrendingUp, group: ['/evolucao', '/pacto', '/rota'] },
  { to: '/conteudos', label: 'Materiais', icon: Sparkles },
  { to: '/consultoria', label: 'Consultoria', icon: Award, consultoriaOnly: true },
  { section: 'Mais' },
  { to: '/agenda', label: 'Agenda', icon: CalendarClock },
  { to: '/rotina', label: 'Rotina', icon: CalendarDays },
  { to: '/perfil', label: 'Perfil', icon: User },
];
const STUDENT_BOTTOM = ['/', '/edital', '/estudos', '/evolucao'];

/** Abas dentro de cada grupo (Estudar e Evolução). */
export const STUDENT_TABS = {
  estudar: [{ to: '/estudos', label: 'Registrar' }, { to: '/revisoes', label: 'Revisões' }, { to: '/questoes', label: 'Questões' }],
  evolucao: [{ to: '/evolucao', label: 'Resumo' }, { to: '/pacto', label: 'Pacto' }, { to: '/rota', label: 'Ajuste de Rota', flag: 'route_adjust_enabled' }],
};

export const TEACHER_NAV = [
  { section: 'Mentoria' },
  { to: '/professora', label: 'Central', icon: LayoutDashboard, end: true, students: true },
  { to: '/professora/alunos', label: 'Alunos', icon: Users, students: true },
  { to: '/professora/fila', label: 'Fila da Coordenação', icon: ClipboardList, queue: true },
  { to: '/professora/turmas', label: 'Turmas', icon: UsersRound, students: true },
  { to: '/professora/ranking', label: 'Ranking', icon: Trophy, students: true },
  { to: '/professora/relatorios', label: 'Relatórios', icon: FileText, students: true },
  { to: '/professora/agenda', label: 'Agenda', icon: CalendarClock, students: true },
  { section: 'Conteúdo' },
  { to: '/professora/editais', label: 'Editais', icon: BookOpen },
  { to: '/professora/conteudos', label: 'Materiais', icon: Sparkles },
  { section: 'Ambiente' },
  { to: '/professora/financeiro', label: 'Financeiro', icon: Wallet, teacherOnly: true },
  { to: '/professora/equipe', label: 'Equipe', icon: UsersRound, teacherOnly: true },
  { to: '/professora/configuracoes', label: 'Configurações', icon: Settings, teacherOnly: true },
  { to: '/professora/perfil', label: 'Perfil', icon: User },
];
const TEACHER_BOTTOM = ['/professora', '/professora/alunos', '/professora/ranking', '/professora/editais'];

export const PLATFORM_NAV = [
  { to: '/plataforma', label: 'Visão geral', icon: Activity, end: true },
  { to: '/plataforma/ambientes', label: 'Ambientes', icon: Building2 },
  { to: '/plataforma/usuarios', label: 'Usuários', icon: Users },
  { to: '/plataforma/auditoria', label: 'Auditoria', icon: ShieldCheck },
  { to: '/plataforma/perfil', label: 'Perfil', icon: User },
];
const PLATFORM_BOTTOM = ['/plataforma', '/plataforma/ambientes', '/plataforma/usuarios', '/plataforma/auditoria'];

const inGroup = (n, path) => !!n.group && n.group.some((g) => path === g || path.startsWith(`${g}/`));

/** Abas do grupo atual (Estudar / Evolução). O Ajuste de Rota só aparece com a chave ligada pela professora. */
function StudentTabs({ path }) {
  const group = ['/estudos', '/revisoes', '/questoes'].some((g) => path === g || path.startsWith(`${g}/`)) ? 'estudar'
    : ['/evolucao', '/pacto', '/rota'].some((g) => path === g || path.startsWith(`${g}/`)) ? 'evolucao' : null;
  const [flags, setFlags] = useState({});
  useEffect(() => { if (group === 'evolucao') api.get('/me/config').then((r) => setFlags(r.config || {})).catch(() => {}); }, [group]);
  if (!group) return null;
  const tabs = STUDENT_TABS[group].filter((t) => !t.flag || flags[t.flag]);
  return (
    <div className="subtabs-wrap"><nav className="subtabs" aria-label={group === 'estudar' ? 'Estudar' : 'Evolução'}>
      {tabs.map((t) => <NavLink key={t.to} to={t.to} end className={({ isActive }) => (isActive ? 'on' : '')}>{t.label}</NavLink>)}
    </nav></div>
  );
}

function Brand({ area }) {
  const sub = area === 'platform' ? 'Console da plataforma' : area === 'teacher' ? 'Central da mentoria' : BRAND.product;
  return (
    <div className="brand">
      {area === 'platform'
        ? <img className="brand-logo-oneup" src={MAKER.logoOnDark} alt="ONE UP" />
        : <BrandLogo />}
      <div className="brand-sub">{sub}</div>
    </div>
  );
}

/** area: 'student' | 'teacher' | 'platform' */
export function Layout({ area = 'student' }) {
  const { user, logout } = useAuth();
  useTenantBrand(user);
  const acting = area === 'teacher' && user.role === 'platform_admin' ? getActingTenant() : null;
  const isMentor = user.role === 'mentor';
  const isTeacherRole = user.role === 'teacher' || user.role === 'platform_admin';
  const all = area === 'teacher' ? TEACHER_NAV : area === 'platform' ? PLATFORM_NAV : STUDENT_NAV;
  const nav = all.filter((n) => !(n.teacherOnly && !isTeacherRole) && !(n.students && isMentor) && !(n.queue && isMentor) && !(n.consultoriaOnly && !user.has_consultoria)).filter((n, i, arr) => !n.section || (arr[i + 1] && !arr[i + 1].section));
  const links = nav.filter((n) => n.to);
  const bottomPaths = area === 'teacher' ? TEACHER_BOTTOM : area === 'platform' ? PLATFORM_BOTTOM : STUDENT_BOTTOM;
  const bottom = bottomPaths.map((p) => links.find((n) => n.to === p)).filter(Boolean);
  const [more, setMore] = useState(false);
  const loc = useLocation();
  const online = useOnline();
  const navigate = useNavigate();
  const doLogout = async () => { setActingTenant(null); await logout(); navigate('/login'); };
  const leaveTenant = () => { setActingTenant(null); window.location.assign('/plataforma/ambientes'); };
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Menu principal">
        <Brand area={area} />
        {nav.map((n, i) => n.section
          ? <div key={`s${i}`} className="nav-section">{n.section}</div>
          : (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive || inGroup(n, loc.pathname) ? 'active' : ''}`}>
              <span className="ico" aria-hidden="true"><n.icon size={18} /></span>{n.label}
            </NavLink>
          ))}
        <div className="sidebar-foot">
          <InstallButton className="btn btn-sm btn-accent sidebar-install" />
          <div className="bold ellipsis">{user.name}</div>
          <div className="muted xs ellipsis">{user.email}</div>
          <div className="row between mt-sm">
            <button className="btn btn-sm btn-ghost" style={{ paddingLeft: 0 }} onClick={doLogout}><LogOut size={15} aria-hidden="true" />Sair</button>
            <ThemeMenu className="side" />
          </div>
          {area !== 'platform' && <OneUpSignature tone="adaptive" compact className="sidebar-sig" />}
        </div>
      </aside>
      <div className="main">
        {acting && (
          <div className="acting-banner" role="status">
            <ArrowLeftRight size={16} aria-hidden="true" />
            <span>Você está operando o ambiente <b>{acting.name}</b> como administrador ONE UP. As ações ficam registradas.</span>
            <span className="spacer" />
            <button className="btn btn-sm" onClick={leaveTenant}>Sair do ambiente</button>
          </div>
        )}
        <OfflineBar online={online} />
        {area === 'student' && <StudentTabs path={loc.pathname} />}
        <Outlet />
      </div>
      <nav className="bottom-nav" aria-label="Navegação">
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive || inGroup(n, loc.pathname) ? 'active' : '')}>
            <n.icon size={20} aria-hidden="true" />{n.label}
          </NavLink>
        ))}
        <button onClick={() => setMore(true)}><Menu size={20} aria-hidden="true" />Mais</button>
      </nav>
      {more && (
        <Modal title="Menu" onClose={() => setMore(false)}>
          <div className="stack-sm">
            {links.filter((n) => !bottom.includes(n)).map((n) => (
              <NavLink key={n.to} to={n.to} className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setMore(false)}><n.icon size={18} aria-hidden="true" />{n.label}</NavLink>
            ))}
            <InstallButton className="btn btn-ghost" label="Instalar aplicativo" onDone={() => setMore(false)} />
            <button className="btn btn-ghost" style={{ justifyContent: 'flex-start' }} onClick={doLogout}><LogOut size={18} aria-hidden="true" />Sair</button>
            {area !== 'platform' && <OneUpSignature tone="on-light" className="more-sig" />}
          </div>
        </Modal>
      )}
      {area === 'student' && <TimerBar />}
    </div>
  );
}

/** Barra superior com seletor de edital (aluno). */
export function TopBar({ title, children }) {
  const ctx = useExam();
  const { user } = useAuth();
  const initials = (user?.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const profilePath = user?.role === 'student' ? '/perfil' : user?.role === 'platform_admin' ? '/plataforma/perfil' : '/professora/perfil';
  return (
    <header className="topbar">
      {ctx && !ctx.isAdminView && ctx.active?.length > 1 ? (
        <select className="select input-sm exam-switch" value={ctx.examId || ''} onChange={(e) => ctx.select(e.target.value)} aria-label="Edital selecionado">
          {ctx.active.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      ) : ctx?.exam && !ctx.isAdminView ? <b className="ellipsis">{ctx.exam.name}</b> : <b>{title}</b>}
      <div className="spacer" />
      {children}
      <ThemeMenu />
      <NavLink to={profilePath} className="avatar-chip" aria-label="Meu perfil" title={user?.name}>{user?.photo_file_id ? <img src={`/api/files/${user.photo_file_id}`} alt="" /> : initials}</NavLink>
    </header>
  );
}

export function Page({ title, subtitle, eyebrow, actions, children, topbar = true, topbarExtra }) {
  return (
    <>
      {topbar && <TopBar title={title}>{topbarExtra}</TopBar>}
      <div className="content">
        {(title || actions) && (
          <div className="page-head">
            <div>
              {eyebrow && <div className="eyebrow">{eyebrow}</div>}
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
            {actions && <div className="row wrap">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    </>
  );
}

export function BrandMark() {
  return <BrandSymbol size={38} />;
}
