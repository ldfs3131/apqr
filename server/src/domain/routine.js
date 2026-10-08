/**
 * 🗺️ Mapa de Rotinas — organização da semana do aluno.
 * NÃO é cronograma obrigatório: não vincula conteúdos a horários.
 */
import { badRequest } from '../lib/util.js';

export const CATEGORIES = ['trabalho', 'deslocamento', 'familia', 'alimentacao', 'descanso', 'estudo', 'atividade_fisica', 'outros'];
const DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export async function getRoutine(d, studentId) {
  const blocks = await d.all('SELECT id, weekday, start_min, end_min, category, label FROM routine_blocks WHERE student_id = ? ORDER BY weekday, start_min', [studentId]);
  const perDay = Array.from({ length: 7 }, (_, wd) => blocks.filter((b) => b.weekday === wd && b.category === 'estudo').reduce((a, b) => a + (b.end_min - b.start_min), 0));
  return { blocks, study_minutes_per_day: perDay, weekly_study_minutes: perDay.reduce((a, b) => a + b, 0) };
}

/** Substitui a rotina inteira (o frontend envia o estado completo). Valida sobreposição. */
export async function saveRoutine(d, ctx, studentId, blocks) {
  if (!Array.isArray(blocks) || blocks.length > 300) throw badRequest('Rotina inválida.');
  const clean = blocks.map((b, i) => {
    const wd = Number(b.weekday);
    const s = Number(b.start_min);
    const e = Number(b.end_min);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) throw badRequest(`Bloco ${i + 1}: dia inválido.`);
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || e <= s) throw badRequest(`Bloco ${i + 1}: horário inválido (o fim deve ser depois do início).`);
    if (!CATEGORIES.includes(b.category)) throw badRequest(`Bloco ${i + 1}: categoria inválida.`);
    return { weekday: wd, start_min: s, end_min: e, category: b.category, label: b.label ? String(b.label).slice(0, 60) : null };
  });
  for (let wd = 0; wd < 7; wd++) {
    const day = clean.filter((b) => b.weekday === wd).sort((a, b) => a.start_min - b.start_min);
    for (let i = 1; i < day.length; i++) {
      if (day[i].start_min < day[i - 1].end_min) throw badRequest(`Há blocos sobrepostos na ${DAYS[wd]}. Ajuste os horários.`, 'overlap');
    }
  }
  await d.run('DELETE FROM routine_blocks WHERE student_id = ?', [studentId]);
  for (const b of clean) {
    await d.run('INSERT INTO routine_blocks (tenant_id, student_id, weekday, start_min, end_min, category, label) VALUES (?,?,?,?,?,?,?)', [ctx.tenantId, studentId, b.weekday, b.start_min, b.end_min, b.category, b.label]);
  }
  return getRoutine(d, studentId);
}
