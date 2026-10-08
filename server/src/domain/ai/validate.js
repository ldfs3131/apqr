/**
 * Validação do texto da IA — V2.1: a IA escreve MODELOS com marcadores {chave}; a plataforma preenche.
 *
 *  - formato: JSON com as seções esperadas e tamanhos máximos;
 *  - marcadores: toda {chave} precisa existir na lista de variáveis (fatos calculados);
 *  - SEM números próprios: depois de retirar os marcadores, o texto não pode ter nenhum dígito
 *    (nem "R2", nem "4 semanas", nem datas) e nenhum nome de mês — a IA não tem como inventar número ou data;
 *  - conteúdo: sem comparação com outros alunos, sem diagnóstico de saúde, sem promessa de aprovação.
 * O que a validação NÃO garante: que a frase em volta do marcador esteja semanticamente perfeita.
 * Por isso cada variável tem um rótulo explícito, a tela mostra os valores usados e o texto é sempre revisado pela professora.
 */
export const SECTIONS = {
  resumo: { type: 'string', max: 900 },
  pontos_fortes: { type: 'list', max: 5, item: 320 },
  pontos_de_atencao: { type: 'list', max: 6, item: 360 },
  recomendacoes: { type: 'list', max: 6, item: 320 },
  mensagem_ao_aluno: { type: 'string', max: 700 },
};

const FORBIDDEN = [
  { re: /\b(outros alunos|demais alunos|colegas|da turma|ranking|m[eé]dia da turma)\b/i, reason: 'compara com outros alunos' },
  { re: /\b(ansiedade|depress[aã]o|tdah|transtorno|diagn[oó]stico m[eé]dico|terapia|rem[eé]dio)\b/i, reason: 'menciona saúde' },
  { re: /\b(garant\w+ (a )?aprova[cç][aã]o|vai passar|aprova[cç][aã]o garantida|nota de corte)\b/i, reason: 'promete resultado' },
];
const MONTHS = /\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/i;
const PLACEHOLDER = /\{([a-z0-9_]+)\}/g;

/** Extrai o primeiro objeto JSON do texto do modelo (tolera cercas ```json). */
export function extractJson(text) {
  if (!text) return null;
  const clean = String(text).replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

/** Preenche os marcadores com os valores formatados pela plataforma. */
export function render(template, vars) {
  const fill = (s) => s.replace(PLACEHOLDER, (m, k) => (vars[k] ? vars[k].text : m));
  return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, Array.isArray(v) ? v.map(fill) : fill(v)]));
}

/** Valida o modelo escrito pela IA e devolve o texto final preenchido. */
export function validateTemplate(template, vars) {
  const problems = [];
  if (!template || typeof template !== 'object') return { ok: false, problems: ['Resposta sem JSON válido.'], placeholders: 0 };
  const clean = {};
  for (const [k, def] of Object.entries(SECTIONS)) {
    const v = template[k];
    if (def.type === 'string') {
      if (typeof v !== 'string' || !v.trim()) { problems.push(`Seção "${k}" ausente.`); continue; }
      clean[k] = v.trim();
    } else {
      if (!Array.isArray(v)) { problems.push(`Seção "${k}" ausente.`); continue; }
      if (v.length > def.max) problems.push(`Seção "${k}" com itens demais.`);
      clean[k] = v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).slice(0, def.max);
    }
  }
  const raw = Object.values(clean).flat().join('\n');
  const used = [...raw.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const unknown = [...new Set(used.filter((k) => !vars[k]))];
  if (unknown.length) problems.push(`Marcadores inexistentes: ${unknown.slice(0, 6).join(', ')}.`);
  const withoutPlaceholders = raw.replace(PLACEHOLDER, ' ');
  const digits = withoutPlaceholders.match(/[^\s]*\d[^\s]*/g);
  if (digits) problems.push(`Número ou data escrito diretamente, sem vir dos dados: ${[...new Set(digits)].slice(0, 6).join(', ')}.`);
  if (MONTHS.test(withoutPlaceholders)) problems.push('Menciona mês/data que não vem dos dados.');
  for (const f of FORBIDDEN) if (f.re.test(withoutPlaceholders)) problems.push(`Texto ${f.reason}.`);
  const narrative = render(clean, vars);
  for (const [k, def] of Object.entries(SECTIONS)) {
    const v = narrative[k];
    if (def.type === 'string' && v && v.length > def.max) problems.push(`Seção "${k}" longa demais.`);
    if (def.type === 'list' && v?.some((x) => x.length > def.item)) problems.push(`Item longo demais em "${k}".`);
  }
  return { ok: problems.length === 0, problems, placeholders: used.length, narrative };
}
