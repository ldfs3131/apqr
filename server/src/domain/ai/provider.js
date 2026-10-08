/**
 * Provedores de IA intercambiáveis: anthropic | openai | mock | none.
 * Configuração só por variáveis de ambiente (a chave nunca vai para o banco nem para o navegador):
 *   AI_PROVIDER=anthropic|openai|mock   (padrão: detecta pela chave presente)
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY
 *   AI_MODEL                            (padrão: claude-haiku-4-5-20251001 / gpt-4o-mini)
 *   AI_PRICE_IN_PER_MTOK, AI_PRICE_OUT_PER_MTOK  (US$ por milhão de tokens, para estimar custo)
 *   AI_TIMEOUT_MS                       (padrão 45000)
 */
const DEFAULTS = {
  anthropic: { model: 'claude-haiku-4-5-20251001', priceIn: 1, priceOut: 5 },
  openai: { model: 'gpt-4o-mini', priceIn: 0.15, priceOut: 0.6 },
  mock: { model: 'mock-deterministico', priceIn: 0, priceOut: 0 },
};

export function aiConfig() {
  const env = process.env;
  const provider = env.AI_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : 'none');
  if (!DEFAULTS[provider]) return { provider: 'none', configured: false };
  const keyOk = provider === 'mock' || (provider === 'anthropic' ? !!env.ANTHROPIC_API_KEY : !!env.OPENAI_API_KEY);
  const d = DEFAULTS[provider];
  return {
    provider: keyOk ? provider : 'none',
    configured: keyOk,
    model: env.AI_MODEL || d.model,
    priceIn: Number(env.AI_PRICE_IN_PER_MTOK) || d.priceIn,
    priceOut: Number(env.AI_PRICE_OUT_PER_MTOK) || d.priceOut,
    timeoutMs: Number(env.AI_TIMEOUT_MS) || 45000,
  };
}

export function aiStatus() {
  const c = aiConfig();
  return { provider: c.provider, configured: c.configured, model: c.configured ? c.model : null };
}

async function withTimeout(ms, fn) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fn(ctl.signal); } finally { clearTimeout(timer); }
}

/**
 * Chama o modelo. Retorna { text, tokensIn, tokensOut, model }.
 * `mockText` é usado só pelo provedor mock (testes e demonstração sem custo).
 */
export async function complete({ system, user, maxTokens = 1400, mockText }) {
  const c = aiConfig();
  if (!c.configured) throw new Error('IA não configurada.');
  if (c.provider === 'mock') {
    // AI_MOCK_RESPONSE: resposta fixa do provedor de teste (usada nos testes de reprovação).
    const text = process.env.AI_MOCK_RESPONSE || (typeof mockText === 'function' ? mockText() : mockText);
    return { text, tokensIn: Math.ceil((system.length + user.length) / 4), tokensOut: Math.ceil((text || '').length / 4), model: c.model };
  }
  return withTimeout(c.timeoutMs, async (signal) => {
    if (c.provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: c.model, max_tokens: maxTokens, temperature: 0.2, system, messages: [{ role: 'user', content: user }] }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${j?.error?.type || 'erro'}`);
      return { text: (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''), tokensIn: j.usage?.input_tokens || 0, tokensOut: j.usage?.output_tokens || 0, model: j.model || c.model };
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: c.model, max_tokens: maxTokens, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${j?.error?.code || 'erro'}`);
    return { text: j.choices?.[0]?.message?.content || '', tokensIn: j.usage?.prompt_tokens || 0, tokensOut: j.usage?.completion_tokens || 0, model: j.model || c.model };
  });
}

export function estimateCost(tokensIn, tokensOut) {
  const c = aiConfig();
  if (!c.configured) return 0;
  return Math.round(((tokensIn * c.priceIn + tokensOut * c.priceOut) / 1e6) * 1e5) / 1e5;
}
