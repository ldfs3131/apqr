import { useEffect, useState } from 'react';

/** Temas: 'classic' (Tradicional: menu azul), 'light' (Claro: menu branco), 'dark' (Escuro) ou 'auto' (segue o aparelho). */
export const THEMES = [
  { value: 'classic', label: 'Tradicional', hint: 'Menu azul da marca' },
  { value: 'light', label: 'Claro', hint: 'Tudo claro, menu branco' },
  { value: 'dark', label: 'Escuro', hint: 'Fundo escuro, menos brilho' },
  { value: 'auto', label: 'Automático', hint: 'Escuro à noite no aparelho' },
];
const KEY = 'apqr.theme';
const VALID = THEMES.map((t) => t.value);

export function getThemePref() {
  try { const t = localStorage.getItem(KEY); return VALID.includes(t) ? t : 'classic'; } catch { return 'classic'; }
}
const osDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
export const resolveTheme = (pref) => (pref === 'auto' ? (osDark() ? 'dark' : 'classic') : pref);

export function applyTheme(pref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolveTheme(pref) === 'dark' ? '#0a1424' : resolveTheme(pref) === 'light' ? '#ffffff' : '#0a4296');
}
export function setThemePref(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
  applyTheme(pref);
}

/** Estado reativo do tema + segue o aparelho quando o modo é "automático". */
export function useTheme() {
  const [pref, setPref] = useState(getThemePref());
  useEffect(() => {
    applyTheme(pref);
    if (pref !== 'auto') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => applyTheme('auto');
    mq.addEventListener?.('change', h);
    return () => mq.removeEventListener?.('change', h);
  }, [pref]);
  return { pref, set: (p) => { setThemePref(p); setPref(p); } };
}
