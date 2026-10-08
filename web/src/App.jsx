import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, DataProvider, StudentExamProvider, TimerProvider, ToastProvider, useAuth, getActingTenant, setActingTenant } from './lib/store.jsx';
import { Layout } from './components/Layout.jsx';
import { TopicDrawerProvider } from './components/TopicDrawer.jsx';
import { Loading } from './components/ui.jsx';
import { Login, Invite, CompleteProfile, Forgot, Reset, homeFor } from './pages/Auth.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Edital from './pages/Edital.jsx';
import Studies from './pages/Studies.jsx';
import Reviews from './pages/Reviews.jsx';
import Routine from './pages/Routine.jsx';
import Analytics from './pages/Analytics.jsx';
import Report from './pages/Report.jsx';
import Profile from './pages/Profile.jsx';
import Contents from './pages/Contents.jsx';
import AccessEnded from './pages/AccessEnded.jsx';
import Pacto from './pages/Pacto.jsx';
import Questions from './pages/Questions.jsx';
import Rota from './pages/Rota.jsx';
import Consultoria from './pages/Consultoria.jsx';
import TermsAccept from './pages/TermsAccept.jsx';
const Fila = lazy(() => import('./pages/teacher/Fila.jsx'));
const Turmas = lazy(() => import('./pages/teacher/Turmas.jsx'));
const Central = lazy(() => import('./pages/teacher/Central.jsx'));
const Students = lazy(() => import('./pages/teacher/Students.jsx'));
const StudentXray = lazy(() => import('./pages/teacher/StudentXray.jsx'));
const ClassRanking = lazy(() => import('./pages/teacher/ClassRanking.jsx'));
const Editais = lazy(() => import('./pages/teacher/Editais.jsx'));
const EditalEditor = lazy(() => import('./pages/teacher/Editais.jsx').then((m) => ({ default: m.EditalEditor })));
const TeacherSettings = lazy(() => import('./pages/teacher/Settings.jsx'));
const Team = lazy(() => import('./pages/teacher/Team.jsx'));
const Reports = lazy(() => import('./pages/teacher/Reports.jsx'));
const Finance = lazy(() => import('./pages/teacher/Finance.jsx'));
const TeacherAgenda = lazy(() => import('./pages/teacher/Agenda.jsx'));
import Agenda from './pages/Agenda.jsx';
const TeacherContents = lazy(() => import('./pages/teacher/Contents.jsx'));
const PlatformAudit = lazy(() => import('./pages/platform/Platform.jsx').then((m) => ({ default: m.PlatformAudit })));
const PlatformOverview = lazy(() => import('./pages/platform/Platform.jsx').then((m) => ({ default: m.PlatformOverview })));
const PlatformTenants = lazy(() => import('./pages/platform/Platform.jsx').then((m) => ({ default: m.PlatformTenants })));
const PlatformUsers = lazy(() => import('./pages/platform/Platform.jsx').then((m) => ({ default: m.PlatformUsers })));

const STAFF = ['teacher', 'coordinator', 'mentor'];

/**
 * Guarda de rota por área.
 *  - student: somente alunos (cadastro completo + onboarding).
 *  - teacher: professora/mentor do ambiente, ou admin ONE UP operando um ambiente (X-Tenant-Id).
 *  - platform: somente admin ONE UP.
 */
function Guard({ area, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) return <Loading compact />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const ok = area === 'any'
    || (area === 'student' && user.role === 'student')
    || (area === 'teacher' && (STAFF.includes(user.role) || (user.role === 'platform_admin' && getActingTenant())))
    || (area === 'platform' && user.role === 'platform_admin');
  if (!ok) return <Navigate to={homeFor(user)} replace />;
  // No console da plataforma, o admin nunca opera um ambiente (evita enviar X-Tenant-Id por engano).
  if (area === 'platform' && getActingTenant()) setActingTenant(null);
  if (user.role === 'student' && user.terms_pending && loc.pathname !== '/aceitar-termos') return <Navigate to="/aceitar-termos" replace />;
  if (user.role === 'student' && area !== 'any') {
    if (!user.profile_complete && loc.pathname !== '/completar-cadastro') return <Navigate to="/completar-cadastro" replace />;
    if (user.profile_complete && !user.onboarding_done && loc.pathname !== '/bem-vindo') return <Navigate to="/bem-vindo" replace />;
  }
  return children;
}

/** Monitor só enxerga editais e materiais: qualquer outra tela da equipe leva aos editais. */
function NoMentor({ children }) {
  const { user } = useAuth();
  if (user?.role === 'mentor') return <Navigate to="/professora/editais" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <Loading compact />;
  if (user) return <Navigate to={homeFor(user)} replace />;
  return children;
}

function StudentShell() {
  const { user } = useAuth();
  if (user.access_state && user.access_state !== 'active') return <AccessEnded />;
  return (
    <StudentExamProvider>
      <TimerProvider>
        <TopicDrawerProvider>
          <Layout area="student" />
        </TopicDrawerProvider>
      </TimerProvider>
    </StudentExamProvider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <BrowserRouter>
            <Suspense fallback={<Loading compact />}>
            <Routes>
              <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
              <Route path="/convite/:token" element={<Invite />} />
              <Route path="/esqueci-senha" element={<Forgot />} />
              <Route path="/redefinir-senha" element={<Reset />} />
              <Route path="/aceitar-termos" element={<Guard area="any"><TermsAccept /></Guard>} />
              <Route path="/completar-cadastro" element={<Guard area="student"><CompleteProfile /></Guard>} />
              <Route path="/bem-vindo" element={<Guard area="student"><StudentExamProvider><Onboarding /></StudentExamProvider></Guard>} />
              <Route path="/relatorio/:examId" element={<Guard area="student"><Report /></Guard>} />
              <Route path="/professora/relatorio/:examId" element={<Guard area="teacher"><Report /></Guard>} />

              {/* Aluno */}
              <Route element={<Guard area="student"><StudentShell /></Guard>}>
                <Route index element={<Dashboard />} />
                <Route path="pacto" element={<Pacto />} />
                <Route path="questoes" element={<Questions />} />
                <Route path="rota" element={<Rota />} />
                <Route path="consultoria" element={<Consultoria />} />
                <Route path="edital" element={<Edital />} />
                <Route path="revisoes" element={<Reviews />} />
                <Route path="estudos" element={<Studies />} />
                <Route path="evolucao" element={<Analytics />} />
                <Route path="conteudos" element={<Contents />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="rotina" element={<Routine />} />
                <Route path="perfil" element={<Profile />} />
              </Route>

              {/* Professora / mentoria */}
              <Route path="/professora" element={<Guard area="teacher"><TimerProvider><Layout area="teacher" /></TimerProvider></Guard>}>
                <Route index element={<NoMentor><Central /></NoMentor>} />
                <Route path="alunos" element={<NoMentor><Students /></NoMentor>} />
                <Route path="alunos/:id" element={<NoMentor><StudentXray /></NoMentor>} />
                <Route path="ranking" element={<NoMentor><ClassRanking /></NoMentor>} />
                <Route path="fila" element={<NoMentor><Fila /></NoMentor>} />
                <Route path="turmas" element={<NoMentor><Turmas /></NoMentor>} />
                <Route path="relatorios" element={<NoMentor><Reports /></NoMentor>} />
                <Route path="editais" element={<Editais />} />
                <Route path="editais/:id" element={<EditalEditor />} />
                <Route path="conteudos" element={<TeacherContents />} />
                <Route path="agenda" element={<NoMentor><TeacherAgenda /></NoMentor>} />
                <Route path="financeiro" element={<Finance />} />
                <Route path="equipe" element={<Team />} />
                <Route path="configuracoes" element={<TeacherSettings />} />
                <Route path="perfil" element={<Profile />} />
                <Route path="*" element={<Navigate to="/professora" replace />} />
              </Route>

              {/* Console ONE UP */}
              <Route path="/plataforma" element={<Guard area="platform"><Layout area="platform" /></Guard>}>
                <Route index element={<PlatformOverview />} />
                <Route path="ambientes" element={<PlatformTenants />} />
                <Route path="usuarios" element={<PlatformUsers />} />
                <Route path="auditoria" element={<PlatformAudit />} />
                <Route path="perfil" element={<Profile />} />
                <Route path="*" element={<Navigate to="/plataforma" replace />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
