/**
 * Utilidades compartilhadas: relógio (substituível nos testes), datas no fuso
 * do aluno, erros HTTP padronizados.
 */

let clockOffsetMs = 0;
/** Instante atual. Os testes podem avançar o relógio com advanceClock(). */
export function now() {
  return new Date(Date.now() + clockOffsetMs);
}
export function nowIso() {
  return now().toISOString();
}
export function advanceClock(ms) {
  clockOffsetMs += ms;
}
export function resetClock() {
  clockOffsetMs = 0;
}

export const DEFAULT_TZ = 'America/Sao_Paulo';

/** Data local 'YYYY-MM-DD' de um instante, no fuso informado. */
export function localDate(date = now(), tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function today(tz = DEFAULT_TZ) {
  return localDate(now(), tz);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Soma dias a uma data 'YYYY-MM-DD'. */
export function addDays(s, n) {
  const d = new Date(`${s}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

/** 0 = segunda ... 6 = domingo */
export function weekdayMon0(s) {
  const d = new Date(`${s}T12:00:00Z`).getUTCDay();
  return (d + 6) % 7;
}

export class HttpError extends Error {
  constructor(status, message, code = undefined, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (msg, code, details) => new HttpError(400, msg, code, details);
export const forbidden = (msg = 'Você não tem permissão para acessar este recurso.') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Recurso não encontrado.') => new HttpError(404, msg, 'not_found');
export const conflict = (msg, code, details) => new HttpError(409, msg, code, details);

/** Percentual exato com 2 casas (apenas exibição/relatório). */
export function pct(correct, questions) {
  if (!questions) return null;
  return Math.round((correct / questions) * 10000) / 100;
}

/** Envolve handlers async para o Express encaminhar erros. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/** Valida identificador (UUID). IDs inválidos respondem 404 para não revelar nada. */
export function parseId(v, label = 'registro') {
  if (!isUuid(v)) throw notFound(`${label[0].toUpperCase()}${label.slice(1)} não encontrado.`);
  return v.toLowerCase();
}

export const round1 = (n) => Math.round(n * 10) / 10;
