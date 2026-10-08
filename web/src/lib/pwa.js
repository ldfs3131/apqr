import { useEffect, useState, useSyncExternalStore } from 'react';

/* App instalável (PWA). O evento de instalação precisa ser capturado cedo, por isso este módulo é importado no main.jsx. */
let deferred = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}

const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

const isIos = () => typeof navigator !== 'undefined'
  && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const snapshot = () => (deferred ? 1 : 0);
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

/** Estado de instalação: canPrompt (Android/Chrome/Edge), ios (guia manual), standalone (já instalado). */
export function usePwaInstall() {
  const prompt = useSyncExternalStore(subscribe, snapshot, () => 0);
  const [standalone, setStandalone] = useState(isStandalone());
  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const h = () => setStandalone(isStandalone());
    mq?.addEventListener?.('change', h);
    window.addEventListener('appinstalled', h);
    return () => { mq?.removeEventListener?.('change', h); window.removeEventListener('appinstalled', h); };
  }, []);
  const ios = isIos();
  const canPrompt = prompt === 1;
  const install = async () => {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null; emit();
    return choice?.outcome === 'accepted';
  };
  return { standalone, canPrompt, ios, available: !standalone && (canPrompt || ios), install };
}

/** true quando há internet. */
export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true); const b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

/** Registra o service worker (só em produção). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* sem PWA, segue normal */ }); });
}

/** "Dispensar por N dias" guardado no aparelho. */
export function dismissedRecently(key, days) {
  try { const t = Number(localStorage.getItem(key)); return Boolean(t) && Date.now() - t < days * 864e5; } catch { return false; }
}
export function dismissFor(key) {
  try { localStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
}
