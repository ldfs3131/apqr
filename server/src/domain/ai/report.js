/**
 * Relatório do aluno com IA — pipeline:
 *   dados brutos → métricas → diagnóstico determinístico (facts.js)
 *   → IA escreve o texto a partir SOMENTE dos fatos (provider.js)
 *   → a IA escreve com marcadores {chave}; a plataforma preenche os valores (a IA não digita números nem datas)
 *   → validação: formato, marcadores, ausência de dígitos/datas próprios e conteúdo (validate.js)
 *   → se reprovar ou falhar: relatório por regras, com os mesmos marcadores.
 *
 * Controle de custo: cache por hash dos fatos (24h), limite diário por ambiente, modelo barato por padrão,
 * contexto enxuto (só fatos agregados). Log de cada geração em ai_reports (sem dados pessoais).
 * A chamada à IA acontece FORA de transação de banco (não segura conexão durante a espera).
 */
import { HttpError, nowIso } from '../../lib/util.js';
import { aiConfig, complete, estimateCost } from './provider.js';
import { buildFacts, buildVariables, factsHash } from './facts.js';
import { validateTemplate, extractJson, render, SECTIONS } from './validate.js';
import { audit } from '../../security/access.js';

export const CACHE_HOURS = 24;
export const dailyLimit = () => Number(process.env.AI_DAILY_LIMIT_PER_TENANT) || 100;
export const PROMPT_VERSION = 'apqr-relatorio-v2-marcadores';

export const SYSTEM_PROMPT = `Você é um assistente pedagógico da mentoria ONE UP, que usa o Método APQR (Assimilação, Produção de material, Questões e Revisão) para concursos públicos.
Você escreve um relatório curto, em português do Brasil, para a PROFESSORA sobre UM aluno.

Você recebe uma lista de VARIÁVEIS no formato {chave} — descrição (valor atual).
REGRA PRINCIPAL: você NUNCA escreve números, percentuais, datas, meses nem nomes de matérias ou conteúdos.
Sempre que precisar de um desses dados, escreva exatamente a chave entre chaves, por exemplo: "O aluno consolidou {consolidados} de {conteudos_no_edital} conteúdos ({consolidacao_pct})."
A plataforma substitui cada chave pelo valor real. Qualquer dígito escrito por você invalida o relatório.
Use cada chave só com o significado da sua descrição. Escreva por extenso quando precisar ("primeira revisão", "últimas quatro semanas").

Outras regras:
1. Não compare o aluno com outros alunos nem com a turma.
2. Não faça diagnóstico de saúde, emocional ou psicológico. Não prometa aprovação.
3. Horas indicam esforço, não domínio: domínio é medido por revisões com questões e consolidação.
4. Refira-se ao aluno como "o aluno" (sem nome). Tom profissional, direto e respeitoso.
5. Os diagnósticos ({diagnostico_...}) foram calculados por regras fixas: explique-os, não os contradiga.
6. Responda APENAS com um objeto JSON, sem texto fora dele, neste formato:
{"resumo": "2 a 4 frases", "pontos_fortes": ["..."], "pontos_de_atencao": ["..."], "recomendacoes": ["ações práticas para a professora combinar com o aluno"], "mensagem_ao_aluno": "mensagem curta e motivadora que a professora pode enviar"}
Listas com no máximo 5 itens; cada item com até 2 frases.`;

export function variablesPrompt(vars) {
  return Object.entries(vars).map(([k, v]) => `{${k}} — ${v.label} (valor atual: ${v.text})`).join('\n');
}

/**
 * Relatório por regras, escrito com os MESMOS marcadores (um só caminho de preenchimento e validação).
 * Usado sem provedor configurado, quando a IA falha ou é reprovada, e pelo provedor de teste (mock).
 */
export function deterministicTemplate(facts, vars) {
  const s = facts.situacao_atual;
  const w = facts.ultimas_4_semanas;
  const has = (k) => !!vars[k];
  const strengths = [];
  const attention = [];
  const recs = [];
  if (s.consolidados > 0) strengths.push('{consolidados} de {conteudos_no_edital} conteúdos consolidados ({consolidacao_pct} do edital).');
  if (w.constancia != null && w.constancia >= 60) strengths.push('Boa regularidade: constância de {constancia} nas últimas quatro semanas ({dias_ativos_4sem} dias ativos).');
  if (w.conteudos_consolidados_no_periodo > 0) strengths.push('{consolidados_4sem} conteúdo(s) consolidado(s) nas últimas quatro semanas.');
  facts.diagnosticos.forEach((g, i) => { if (g.severidade !== 'good' && g.severidade !== 'info') attention.push(`{diagnostico_${i + 1}}.`); });
  facts.conteudos_com_menor_resultado.slice(0, 3).forEach((c, i) => { if (has(`conteudo_fraco_${i + 1}_pct`)) attention.push(`{conteudo_fraco_${i + 1}}: último resultado de {conteudo_fraco_${i + 1}_pct}.`); });
  if (facts.diagnosticos.some((g) => g.codigo === 'inactive' || g.codigo === 'never_started')) recs.push('Conversar com o aluno sobre a rotina e combinar o próximo dia de estudo.');
  if (s.material_pronto > 0) recs.push('Iniciar as revisões com questões dos {material_pronto} conteúdo(s) com material pronto.');
  if (facts.conteudos_com_menor_resultado.length) recs.push('Revisar o material dos conteúdos com menor resultado antes da próxima revisão.');
  if (s.nao_iniciados > 0) recs.push('Seguir o Plano Global para iniciar os {nao_iniciados} conteúdo(s) ainda não iniciados.');
  const resumo = 'O aluno tem {consolidados} de {conteudos_no_edital} conteúdos consolidados ({consolidacao_pct}), {em_revisao} em revisão e {nao_iniciados} não iniciados. '
    + `Nas últimas quatro semanas foram {dias_ativos_4sem} dias ativos, {horas_4sem} de estudo e {questoes_4sem} questões${has('acerto_4sem_pct') ? ' com {acerto_4sem_pct} de acerto' : ''}.`;
  return {
    resumo,
    pontos_fortes: strengths.slice(0, SECTIONS.pontos_fortes.max),
    pontos_de_atencao: attention.slice(0, SECTIONS.pontos_de_atencao.max),
    recomendacoes: recs.slice(0, SECTIONS.recomendacoes.max),
    mensagem_ao_aluno: s.consolidados > 0
      ? 'Você já consolidou {consolidados} conteúdos. Vamos manter o ritmo com revisões e questões nesta semana.'
      : 'Cada revisão com questões aproxima você da consolidação. Vamos juntos no próximo passo desta semana.',
  };
}

/** Relatório por regras já preenchido. */
export function deterministicNarrative(facts) {
  const vars = buildVariables(facts);
  return render(deterministicTemplate(facts, vars), vars);
}

/** Passo A (dentro de transação): monta fatos, verifica cache e limite diário. */
export async function prepareReport(d, ctx, enrollment, { force = false } = {}) {
  const { facts } = await buildFacts(d, ctx, enrollment);
  const hash = factsHash({ facts, prompt: PROMPT_VERSION });
  if (!force) {
    const cached = await d.one(
      `SELECT * FROM ai_reports WHERE enrollment_id = ? AND input_hash = ? AND status IN ('ok','deterministic') AND created_at >= ? ORDER BY created_at DESC LIMIT 1`,
      [enrollment.id, hash, new Date(Date.now() - CACHE_HOURS * 3600e3).toISOString()]
    );
    if (cached) return { cached };
  }
  const cfg = aiConfig();
  let useAi = cfg.configured;
  let limitReached = false;
  if (useAi) {
    const startDay = new Date(); startDay.setUTCHours(0, 0, 0, 0);
    const used = (await d.one(`SELECT count(*) AS n FROM ai_reports WHERE provider IS NOT NULL AND provider <> 'none' AND created_at >= ?`, [startDay.toISOString()])).n;
    if (used >= dailyLimit()) { useAi = false; limitReached = true; }
  }
  return { facts, hash, useAi, limitReached };
}

/** Passo B (FORA de transação): chama a IA e valida. Nunca lança — devolve o resultado para registrar. */
export async function runModel(facts, { useAi }) {
  const vars = buildVariables(facts);
  const fallback = () => render(deterministicTemplate(facts, vars), vars);
  if (!useAi) return { status: 'deterministic', narrative: fallback(), validation: { ok: true, source: 'regras', placeholders: Object.keys(vars).length } };
  const cfg = aiConfig();
  const t0 = Date.now();
  const user = `Variáveis disponíveis:\n${variablesPrompt(vars)}`;
  try {
    const r = await complete({ system: SYSTEM_PROMPT, user, maxTokens: 1400, mockText: () => JSON.stringify(deterministicTemplate(facts, vars)) });
    const v = validateTemplate(extractJson(r.text), vars);
    const base = { provider: cfg.provider, model: r.model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, cost: estimateCost(r.tokensIn, r.tokensOut), durationMs: Date.now() - t0 };
    if (!v.ok) return { ...base, status: 'rejected', narrative: fallback(), validation: { ok: false, problems: v.problems } };
    return { ...base, status: 'ok', narrative: v.narrative, validation: { ok: true, placeholders: v.placeholders } };
  } catch (e) {
    return { provider: cfg.provider, model: cfg.model, durationMs: Date.now() - t0, status: 'error', error: String(e.message || e).slice(0, 300), narrative: fallback(), validation: { ok: false, problems: ['Falha na chamada à IA.'] } };
  }
}

/** Passo C (dentro de transação): registra a geração (log + auditoria). */
export async function saveReport(d, ctx, enrollment, prep, result) {
  const row = await d.one(
    `INSERT INTO ai_reports (tenant_id, student_id, enrollment_id, requested_by, status, provider, model, input_hash, facts, narrative, validation,
                             tokens_in, tokens_out, cost_usd, duration_ms, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
    [enrollment.tenant_id, enrollment.student_id, enrollment.id, ctx.userId, result.status, result.provider || 'none', result.model || null, prep.hash,
      JSON.stringify(prep.facts), JSON.stringify(result.narrative), JSON.stringify({ ...result.validation, limit_reached: prep.limitReached || undefined }),
      result.tokensIn ?? null, result.tokensOut ?? null, result.cost ?? null, result.durationMs ?? null, result.error || null, nowIso()]
  );
  await audit(d, ctx, 'ai.report', { targetType: 'enrollment', targetId: enrollment.id, payload: { status: result.status, provider: result.provider || 'none', cost_usd: result.cost ?? 0 } });
  return row;
}

export function publicReport(r) {
  if (!r) return null;
  return {
    id: r.id, status: r.status, provider: r.provider, model: r.model, created_at: r.created_at,
    narrative: r.narrative, facts: r.facts, validation: r.validation,
    tokens_in: r.tokens_in, tokens_out: r.tokens_out, cost_usd: r.cost_usd, duration_ms: r.duration_ms,
    error: r.status === 'error' ? 'A IA não respondeu; foi exibida a versão calculada por regras.' : null,
  };
}

export const NotConfigured = () => new HttpError(503, 'IA não configurada.', 'ai_not_configured');
