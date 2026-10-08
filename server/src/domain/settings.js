/**
 * Configuração da metodologia APQR — parametrizada e VERSIONADA por ambiente.
 *
 *  - Nenhuma regra numérica do APQR fica fixa no código: o código só conhece o PADRÃO INICIAL
 *    (usado para criar a versão 1 do ambiente) e a faixa segura de cada parâmetro.
 *  - Cada alteração grava uma NOVA linha em `methodology_configs` (versão N+1). Nada é sobrescrito.
 *  - A regra aplicada numa revisão é sempre a versão ativa NAQUELE momento; a revisão guarda
 *    `config_version`, `threshold_used` e `min_questions_used`. Assim, mudar de 20 para 30
 *    questões amanhã não altera nenhuma consolidação que já aconteceu.
 */
import { badRequest, nowIso } from '../lib/util.js';
import { audit } from '../security/access.js';

export const METHODOLOGY = 'apqr';

export const SETTINGS_SCHEMA = {
  min_questions_per_review: {
    default: 20,
    label: 'Mínimo de questões para registrar uma revisão (e, portanto, para consolidar)',
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 500,
    hint: 'Número inteiro entre 1 e 500 (ex.: 10, 20, 30, 50).',
  },
  consolidation_threshold: {
    default: 70,
    label: 'Percentual de consolidação (consolida quando o resultado for MAIOR que este valor)',
    validate: (v) => Number.isInteger(v) && v >= 50 && v <= 95,
    hint: 'Número inteiro entre 50 e 95.',
  },
  max_reviews_per_cycle: {
    default: 4,
    label: 'Número máximo de revisões por ciclo',
    validate: (v) => Number.isInteger(v) && v >= 2 && v <= 6,
    hint: 'Número inteiro entre 2 e 6.',
  },
  rotation_mode: {
    default: 'manual',
    label: 'Liberação de novo ciclo após atingir o limite',
    validate: (v) => ['manual', 'auto'].includes(v),
    hint: "'manual' (professora libera) ou 'auto' (libera quando o rodízio for cumprido).",
  },
  rotation_min_other_topics: {
    default: 3,
    label: 'Rodízio automático: mínimo de outros conteúdos em revisão que precisam ser revisados',
    validate: (v) => Number.isInteger(v) && v >= 1 && v <= 200,
    hint: 'Número inteiro entre 1 e 200.',
  },
  inactivity_days: {
    default: 7,
    label: 'Dias sem atividade para considerar o aluno parado',
    validate: (v) => Number.isInteger(v) && v >= 2 && v <= 60,
    hint: 'Número inteiro entre 2 e 60.',
  },
};

/** Limites operacionais (não são regra do método). */
export const MAX_QUESTIONS_PER_REVIEW = 500;
export const UNDO_REVIEW_WINDOW_MINUTES = 30;

export const defaultParams = () => Object.fromEntries(Object.entries(SETTINGS_SCHEMA).map(([k, v]) => [k, v.default]));

/** Aplica padrão para chaves ausentes/inválidas (ex.: parâmetro novo adicionado depois). */
function normalize(params) {
  const out = defaultParams();
  for (const [k, def] of Object.entries(SETTINGS_SCHEMA)) {
    if (params && k in params && def.validate(params[k])) out[k] = params[k];
  }
  return out;
}

/** Cria a versão 1 com os padrões iniciais (chamado ao criar um ambiente). */
export async function initMethodologyConfig(d, tenantId, actorId = null) {
  await d.run(
    `INSERT INTO methodology_configs (tenant_id, methodology, version, params, reason, created_by, created_at)
     VALUES (?, ?, 1, ?, 'Configuração inicial', ?, ?) ON CONFLICT DO NOTHING`,
    [tenantId, METHODOLOGY, JSON.stringify(defaultParams()), actorId, nowIso()]
  );
}

/**
 * Configuração vigente do ambiente: { version, ...params }.
 * Deve ser lida DENTRO da transação que aplica a regra.
 */
export async function getSettings(d, tenantId) {
  const row = await d.one(
    'SELECT version, params, created_at FROM methodology_configs WHERE tenant_id = ? AND methodology = ? ORDER BY version DESC LIMIT 1',
    [tenantId, METHODOLOGY]
  );
  if (!row) return { version: 0, ...defaultParams() }; // ambiente sem config (não deve ocorrer): padrões
  return { version: row.version, ...normalize(row.params), updated_at: row.created_at };
}

/** Uma versão específica (para exibir a regra usada numa revisão antiga). */
export async function getSettingsVersion(d, tenantId, version) {
  const row = await d.one('SELECT version, params FROM methodology_configs WHERE tenant_id = ? AND methodology = ? AND version = ?', [tenantId, METHODOLOGY, version]);
  return row ? { version: row.version, ...normalize(row.params) } : null;
}

export async function listSettingsVersions(d, tenantId) {
  const rows = await d.all(
    `SELECT mc.version, mc.params, mc.reason, mc.created_at, u.name AS created_by_name
       FROM methodology_configs mc LEFT JOIN users u ON u.id = mc.created_by
      WHERE mc.tenant_id = ? AND mc.methodology = ? ORDER BY mc.version DESC`,
    [tenantId, METHODOLOGY]
  );
  return rows.map((r) => ({ ...r, params: normalize(r.params) }));
}

/**
 * Altera parâmetros criando a versão N+1. Valida faixa segura; exige motivo; audita.
 * Não toca em revisões, consolidações ou qualquer histórico.
 */
export async function updateSettings(d, ctx, tenantId, patch, reason) {
  const errors = {};
  for (const [k, v] of Object.entries(patch || {})) {
    const def = SETTINGS_SCHEMA[k];
    if (!def) errors[k] = 'Configuração desconhecida.';
    else if (!def.validate(v)) errors[k] = def.hint;
  }
  if (Object.keys(errors).length) throw badRequest('Algumas configurações são inválidas.', 'invalid_settings', errors);
  if (!Object.keys(patch || {}).length) throw badRequest('Nenhuma alteração informada.');
  // Trava a linha mais recente para duas alterações simultâneas não gerarem a mesma versão.
  await d.run("SELECT pg_advisory_xact_lock(hashtext('methodology_config:' || ?))", [tenantId]);
  const current = await getSettings(d, tenantId);
  const { version: _v, updated_at: _u, ...currentParams } = current;
  const next = { ...currentParams, ...patch };
  const changed = Object.keys(patch).filter((k) => currentParams[k] !== patch[k]);
  if (!changed.length) return current;
  const version = current.version + 1;
  await d.run(
    `INSERT INTO methodology_configs (tenant_id, methodology, version, params, reason, created_by, created_at) VALUES (?,?,?,?,?,?,?)`,
    [tenantId, METHODOLOGY, version, JSON.stringify(next), reason ? String(reason).slice(0, 300) : null, ctx.userId || null, nowIso()]
  );
  await audit(d, ctx, 'methodology.update', {
    targetType: 'methodology_config', targetId: `${METHODOLOGY}:v${version}`, tenantId,
    payload: { from_version: current.version, to_version: version, changes: Object.fromEntries(changed.map((k) => [k, { from: currentParams[k], to: patch[k] }])), reason: reason || null },
  });
  return getSettings(d, tenantId);
}

/** Parâmetros expostos ao aluno/telas (sem metadados internos). */
export function publicSettings(s) {
  return {
    version: s.version,
    consolidation_threshold: s.consolidation_threshold,
    max_reviews_per_cycle: s.max_reviews_per_cycle,
    min_questions_per_review: s.min_questions_per_review,
    rotation_mode: s.rotation_mode,
  };
}
