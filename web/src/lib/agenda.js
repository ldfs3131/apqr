/** Datas da agenda sempre em horário de Brasília. */
const TZ = 'America/Sao_Paulo';
export const brtDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }); // aaaa-mm-dd
export const brtTime = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const dayTitle = (day) => new Date(`${day}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
export const KIND_LABEL = { aula: 'Aula ao vivo', reuniao: 'Reunião', plantao: 'Plantão de dúvidas', prova: 'Prova / edital', lembrete: 'Lembrete', outro: 'Outro' };
export const KIND_CLS = { aula: 'eng-active-soft', reuniao: 'eng-never-soft', plantao: 'eng-attention-soft', prova: 'eng-inactive-soft', lembrete: 'eng-ended-soft', outro: 'eng-ended-soft' };
export const whenText = (e) => (e.all_day ? 'Dia todo' : `${brtTime(e.starts_at)}${e.ends_at ? ` – ${brtTime(e.ends_at)}` : ''}`);
export const groupByDay = (events) => {
  const m = new Map();
  for (const e of events) { const k = brtDay(e.starts_at); if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return [...m.entries()];
};
export const endsAfterNow = (e) => new Date(e.ends_at || (e.all_day ? new Date(new Date(e.starts_at).getTime() + 86400000) : new Date(new Date(e.starts_at).getTime() + 3600000))) >= new Date();
