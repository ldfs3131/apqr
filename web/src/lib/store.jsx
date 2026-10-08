/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { api } from './api.js';

// ───────── Toasts ─────────
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'info', ms = 4200) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, type }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), ms);
  }, []);
  const api_ = useMemo(() => ({
    info: (m) => push(m, 'info'),
    success: (m) => push(m, 'success', 5500),
    error: (m) => push(typeof m === 'string' ? m : m?.message || 'Erro inesperado.', 'error', 6000),
  }), [push]);
  return (
    <ToastCtx.Provider value={api_}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertTriangle : Info;
          return (
            <div key={t.id} className={`toast ${t.type}`} role={t.type === 'error' ? 'alert' : undefined}>
              <Icon size={18} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{t.message}</span>
              <button className="toast-x" aria-label="Fechar aviso" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ───────── Autenticação ─────────
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = carregando
  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
      return user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => setUser(null);
    window.addEventListener('apqr:unauthenticated', h);
    return () => window.removeEventListener('apqr:unauthenticated', h);
  }, []);
  const value = useMemo(() => ({
    user,
    setUser,
    refresh,
    login: async (email, password) => { const r = await api.post('/auth/login', { email, password }); setUser(r.user); return r.user; },
    logout: async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); },
  }), [user, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

// ───────── Versão dos dados (recarregar telas após ações) ─────────
const DataCtx = createContext(null);
export function DataProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return <DataCtx.Provider value={{ version, bump }}>{children}</DataCtx.Provider>;
}
export const useData = () => useContext(DataCtx);

// ───────── Edital selecionado (aluno) ─────────
// "exam" = matrícula do aluno num edital da professora. examId = id da MATRÍCULA (enrollment).
const LS_KEY = 'oneup.enrollmentId';
const safeGet = () => { try { return localStorage.getItem(LS_KEY) || null; } catch { return null; } };
const safeSet = (v) => { try { localStorage.setItem(LS_KEY, String(v)); } catch { /* ignore */ } };

const ExamCtx = createContext(null);
export function StudentExamProvider({ children }) {
  const { version } = useData();
  const [exams, setExams] = useState(null);
  const [selected, setSelected] = useState(safeGet());
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try {
      const { enrollments } = await api.get('/me/enrollments');
      setExams(enrollments);
      setError(null);
      return enrollments;
    } catch (e) { setError(e); return null; }
  }, []);
  useEffect(() => { load(); }, [load, version]);
  const active = exams || [];
  const examId = active.find((e) => e.id === selected)?.id || active[0]?.id || null;
  const exam = active.find((e) => e.id === examId) || null;
  const select = useCallback((id) => { setSelected(id); safeSet(id); }, []);
  return <ExamCtx.Provider value={{ exams, active, exam, examId, select, reloadExams: load, error, isAdminView: false }}>{children}</ExamCtx.Provider>;
}

/** Escopo fixo de matrícula (professora vendo um aluno). */
export function FixedExamScope({ exam, children }) {
  return <ExamCtx.Provider value={{ exams: [exam], active: [exam], exam, examId: exam?.id, select: () => {}, reloadExams: async () => {}, isAdminView: true }}>{children}</ExamCtx.Provider>;
}
export const useExam = () => useContext(ExamCtx);

// ───────── Identidade visual do ambiente ─────────
/** Aplica a cor da professora (--brand) quando definida. */
export function useTenantBrand(user) {
  useEffect(() => {
    const color = user?.tenant?.brand?.primary_color;
    const root = document.documentElement;
    if (color && /^#[0-9a-f]{6}$/i.test(color)) root.style.setProperty('--brand', color);
    else root.style.removeProperty('--brand');
  }, [user?.tenant?.brand?.primary_color]);
}

// ───────── Contexto de operação do admin ONE UP ─────────
export function getActingTenant() {
  try { return JSON.parse(sessionStorage.getItem('oneup.actingTenant') || 'null'); } catch { return null; }
}
export function setActingTenant(t) {
  try { if (t) sessionStorage.setItem('oneup.actingTenant', JSON.stringify(t)); else sessionStorage.removeItem('oneup.actingTenant'); } catch { /* ignore */ }
}

// ───────── Cronômetro (estado no servidor) ─────────
const TimerCtx = createContext(null);
export function TimerProvider({ children }) {
  const { user } = useAuth();
  const [timer, setTimer] = useState(null);
  const [tick, setTick] = useState(0);
  const base = useRef({ elapsed: 0, at: Date.now() });
  const sync = useCallback((t) => {
    setTimer(t);
    base.current = { elapsed: t?.elapsed_seconds || 0, at: Date.now() };
  }, []);
  const load = useCallback(async () => {
    if (user?.role !== 'student') return;
    try { const { timer } = await api.get('/me/timer'); sync(timer); } catch { /* silencioso */ }
  }, [user, sync]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);
  useEffect(() => {
    if (timer?.state !== 'running') return undefined;
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [timer]);
  const elapsed = timer ? (timer.state === 'running' ? base.current.elapsed + Math.floor((Date.now() - base.current.at) / 1000) : base.current.elapsed) : 0;
  void tick;
  const value = {
    timer, elapsed, reload: load,
    start: async (examId, topicId, activity) => { const r = await api.post('/me/timer/start', { enrollment_id: examId, topic_id: topicId, activity }); sync(r.timer); return r; },
    pause: async () => sync((await api.post('/me/timer/pause')).timer),
    resume: async () => sync((await api.post('/me/timer/resume')).timer),
    discard: async () => { await api.post('/me/timer/discard'); sync(null); },
    finish: async (body) => { const r = await api.post('/me/timer/finish', body); sync(null); return r; },
  };
  return <TimerCtx.Provider value={value}>{children}</TimerCtx.Provider>;
}
export const useTimer = () => useContext(TimerCtx);
