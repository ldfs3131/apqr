const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const d = (s) => { const [y, m, day] = s.split('-').map(Number); return { y, m, day }; };
/** "29 set a 5 out" */
export function weekRange(a, b) {
  const x = d(a); const y = d(b);
  return x.m === y.m ? `${x.day} a ${y.day} ${MONTHS[y.m - 1]}` : `${x.day} ${MONTHS[x.m - 1]} a ${y.day} ${MONTHS[y.m - 1]}`;
}
export const fmtMin = (min) => {
  if (!min) return '0h';
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m}min`;
};
export const DAY_LETTERS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
export const DAY_NAMES = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
export const maskToDays = (mask) => [0, 1, 2, 3, 4, 5, 6].filter((i) => mask & (1 << i));
export const WEEK_STATE = {
  in_progress: { label: 'Em andamento', icon: '⏳', tone: 'neutral' },
  green: { label: 'Meta batida', icon: '✓', tone: 'green' },
  yellow: { label: 'Semana válida', icon: '◐', tone: 'yellow' },
  red: { label: 'Abaixo da meta', icon: '✕', tone: 'red' },
  shield: { label: 'Escudo usado', icon: '🛡️', tone: 'shield' },
  partial: { label: 'Semana parcial', icon: '·', tone: 'neutral' },
  paused: { label: 'Plano pausado', icon: '⏸', tone: 'neutral' },
};
