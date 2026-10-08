export const STATUSES = ['not_started', 'assimilation', 'production', 'review', 'consolidated'];

export const STATUS = {
  not_started: { label: 'Não iniciado', short: 'Não iniciado', glyph: '', emoji: '🔴', desc: 'Ainda não começou a estudar este conteúdo.' },
  assimilation: { label: 'A — Assimilação', short: 'Em assimilação', glyph: 'A', emoji: '🟧', desc: 'Estudando o conteúdo; material de revisão ainda não concluído.' },
  production: { label: 'P — Material pronto', short: 'Material pronto', glyph: 'P', emoji: '🟡', desc: 'Assimilação concluída e material de revisão PRONTO.' },
  review: { label: 'Q + R — Questões + Revisão', short: 'Em revisão', glyph: 'QR', emoji: '🟢', desc: 'Ciclo de revisões com questões (Q/R-1, Q/R-2...).' },
  consolidated: { label: 'Consolidado', short: 'Consolidado', glyph: '✓', emoji: '🟩', desc: 'Revisão com resultado ACIMA do percentual de consolidação. Meta atingida.' },
};

export const NEXT_STATUS = { not_started: 'assimilation', assimilation: 'production', production: 'review' };
export const NEXT_ACTION = {
  not_started: { label: 'Iniciar assimilação', confirm: 'Você começou a estudar este conteúdo?' },
  assimilation: { label: 'Material pronto', confirm: 'O material de revisão/resumo está PRONTO? Amarelo significa assimilação concluída e material pronto para revisar.' },
  production: { label: 'Iniciar revisão', confirm: 'Você vai iniciar a fase de revisão (questões) deste conteúdo hoje?' },
};

export function fmtPct(p, digits = 2) {
  if (p === null || p === undefined) return '—';
  const n = Math.round(p * 10 ** digits) / 10 ** digits;
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: digits })}%`;
}

/** 5400 → "1h30"; 2700 → "45min"; 0 → "0min" */
export function fmtDur(secs, { zero = '0min' } = {}) {
  if (!secs) return zero;
  const m = Math.round(secs / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (!h) return `${mm}min`;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}
export const fmtHours = (secs) => `${(secs / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h`;

export function fmtClock(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDate(d, { weekday = false, year = true } = {}) {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  const base = `${day}/${m}${year ? `/${y}` : ''}`;
  if (!weekday) return base;
  const wd = new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' });
  return `${wd.replace('.', '')} ${base}`;
}
export const fmtShort = (d) => fmtDate(d, { year: false });

export function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function todayLocal() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const plural = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

export const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const WEEKDAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const CATEGORIES = {
  estudo: 'Estudo', trabalho: 'Trabalho', deslocamento: 'Deslocamento', familia: 'Família',
  alimentacao: 'Alimentação', descanso: 'Descanso', atividade_fisica: 'Atividade física', outros: 'Outros',
};
export const minToHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hhmmToMin = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const RELEVANCE = { alta: 'Alta', media: 'Média', baixa: 'Menor' };

export const ACTIVITY = {
  study: 'Estudo', assimilation: 'Assimilação (A)', production: 'Produção de material (P)', questions: 'Questões (Q)', review: 'Revisão (R)',
};
export const PRODUCTION_KIND = {
  resumo: 'Resumo', mapa_mental: 'Mapa mental', esquema: 'Esquema', flashcards: 'Flashcards', anotacoes: 'Anotações', outro: 'Outro',
};
export const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
