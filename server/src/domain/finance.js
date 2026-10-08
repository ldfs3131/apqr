/**
 * Financeiro: vendas de qualquer checkout (webhook, importação CSV, lançamento manual) e painel.
 *
 * Regras:
 *  - Venda é identificada por (origem, id externo). Reenvio do mesmo evento não duplica.
 *  - Status só avança: pending → approved | canceled | refunded | chargeback; approved → refunded | chargeback.
 *    Evento atrasado/fora de ordem (ex.: "pendente" chegando depois de "aprovado") é ignorado.
 *  - Valores em centavos.
 *  - Compra aprovada pode criar/renovar o aluno (somente se o ambiente ligou "liberar acesso automático" E o produto
 *    "libera acesso"). Reembolso/chargeback encerra o plano concedido por aquela venda (se o ambiente mantiver essa opção).
 *  - Importação de histórico nunca libera acesso nem envia aviso.
 */
import crypto from 'node:crypto';
import { SYSTEM, tx } from '../db/index.js';
import { audit } from '../security/access.js';
import { DEFAULT_TZ, addDays, badRequest, conflict, isValidDate, localDate, notFound, nowIso, today } from '../lib/util.js';
import { isValidCpf, onlyDigits } from '../lib/cpf.js';
import { syncLegacy } from './acessos.js';
import { parseCsv, parseDate } from './roster.js';
import { sendMail } from '../lib/mailer.js';

export const STATUS = {
  pending: 'Aguardando pagamento',
  approved: 'Aprovada',
  refunded: 'Reembolsada',
  chargeback: 'Chargeback',
  canceled: 'Cancelada',
};
const NEXT = {
  pending: ['approved', 'canceled', 'refunded', 'chargeback'],
  approved: ['refunded', 'chargeback'],
  canceled: [],
  refunded: ['chargeback'],
  chargeback: [],
};
export const KINDS = ['curso', 'mentoria', 'outro'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PAYLOAD = 100_000;

// ───────────── Leitura genérica de cargas de checkout ─────────────

const norm = (h) => String(h ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** Achata um objeto em { 'a_b_c': valor } (caminhos normalizados); também registra a última parte ('c') se ainda livre. */
export function flatten(obj) {
  const out = new Map();
  const walk = (v, path, depth) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) { v.slice(0, 5).forEach((x, i) => walk(x, i === 0 ? path : `${path}_${i}`, depth + 1)); return; }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}_${norm(k)}` : norm(k), depth + 1); return; }
    if (!out.has(path)) out.set(path, v);
  };
  walk(obj, '', 0);
  return out;
}

const FIELDS = {
  external_id: ['transaction_id', 'transacao_id', 'transacao', 'sale_id', 'order_id', 'purchase_id', 'pedido', 'pedido_id', 'codigo_transacao', 'transaction', 'data_transaction', 'data_id', 'id', 'code', 'codigo'],
  status: ['status', 'payment_status', 'status_pagamento', 'situacao', 'status_da_venda', 'data_status', 'data_purchase_status', 'purchase_status', 'event', 'evento', 'type', 'tipo'],
  email: ['buyer_email', 'customer_email', 'cliente_email', 'comprador_email', 'data_buyer_email', 'data_customer_email', 'email', 'e_mail', 'aluno_email', 'user_email'],
  name: ['buyer_name', 'customer_name', 'cliente_nome', 'comprador_nome', 'data_buyer_name', 'data_customer_name', 'nome', 'name', 'nome_completo', 'cliente', 'comprador', 'aluno', 'aluno_nome', 'user_name'],
  phone: ['buyer_phone', 'customer_phone', 'cliente_telefone', 'cliente_celular', 'telefone', 'celular', 'phone', 'whatsapp', 'data_buyer_phone', 'buyer_checkout_phone'],
  cpf: ['buyer_cpf', 'customer_cpf', 'cliente_cpf', 'cpf', 'document', 'documento', 'customer_document', 'buyer_document', 'data_buyer_document'],
  product_name: ['product_name', 'produto_nome', 'data_product_name', 'produto', 'product', 'offer_name', 'oferta', 'item_name', 'plano', 'curso', 'items_name', 'items_title', 'product_title', 'titulo'],
  product_ref: ['product_id', 'produto_id', 'data_product_id', 'product_code', 'codigo_produto', 'sku', 'offer_id', 'oferta_id', 'items_id', 'items_product_id', 'product_ucode'],
  amount: ['amount_cents', 'valor_centavos', 'total_cents', 'amount', 'valor', 'value', 'total', 'price', 'preco', 'valor_total', 'valor_pago', 'full_price', 'data_purchase_price_value', 'purchase_price_value', 'data_amount', 'data_value', 'data_price', 'data_total'],
  paid_at: ['paid_at', 'approved_at', 'approved_date', 'data_aprovacao', 'data_pagamento', 'data_da_venda', 'purchase_date', 'order_date', 'data_approved_date', 'data_purchase_approved_date', 'payment_date', 'date', 'data', 'created_at'],
  method: ['payment_method', 'forma_pagamento', 'metodo_pagamento', 'payment_type', 'data_purchase_payment_type', 'method', 'metodo', 'pagamento', 'payment_payment_method'],
  installments: ['installments', 'parcelas', 'data_purchase_payment_installments_number', 'payment_installments', 'numero_parcelas'],
  coupon: ['coupon', 'cupom', 'coupon_code', 'codigo_cupom', 'data_purchase_offer_coupon_code'],
};

const GENERIC = new Set(['id', 'code', 'codigo', 'type', 'tipo', 'date', 'data', 'name', 'nome', 'status', 'event', 'evento', 'product', 'produto', 'phone', 'email', 'document', 'documento', 'method', 'metodo', 'total', 'price', 'value']);
const BLOCK_SUFFIX = /(product|produto|item|offer|oferta|customer|cliente|buyer|comprador|user|aluno|affiliate|afiliado|producer|produtor|coupon|cupom)/;
/** Procura pelo nome exato do campo; se não achar, aceita o mesmo nome com prefixo de grupo (ex.: "pedido_valor"). */
function pick(map, keys, { suffix = true } = {}) {
  const ok = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  for (const k of keys) { const v = map.get(k); if (ok(v)) return { key: k, value: v }; }
  if (!suffix) return null;
  for (const k of keys) {
    if (GENERIC.has(k)) continue;
    for (const [mk, v] of map) if (mk.endsWith(`_${k}`) && ok(v) && (BLOCK_SUFFIX.test(k) || !BLOCK_SUFFIX.test(mk.slice(0, -k.length - 1)))) return { key: mk, value: v };
  }
  return null;
}

const STATUS_WORDS = [
  ['chargeback', /charge_?back|contestacao|disputa/],
  ['refunded', /refund|reembols|estorn|devolv/],
  ['canceled', /cancel|expir|recus|refused|declin|abandon|negad|nao_aprov|failed|falh|rejeit/],
  ['pending', /pend|aguard|waiting|wait|pix_gerado|boleto|gerad|criad|created|pix_created|iniciad|processing|em_analise|analise|open|aberto|started|awaiting/],
  ['approved', /approv|aprov|paid|pago|complet|conclu|confirm|success|sucesso|finaliz|liberad|purchase_complete|order_paid|ativo|active/],
];
/** Texto de status/evento de checkout → um dos cinco status. Desconhecido → null. */
export function mapStatus(v) {
  const s = norm(v);
  if (!s) return null;
  for (const [st, re] of STATUS_WORDS) if (re.test(s)) return st;
  return null;
}

/** Valor → centavos. Aceita 197, "197.00", "1.234,56", "R$ 197,00". `isCents` quando o campo diz que já é centavos. */
export function toCents(v, isCents = false) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0) return null;
    return isCents ? Math.round(v) : Math.round(v * 100);
  }
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return isCents ? Math.round(n) : Math.round(n * 100);
}

function toTimestamp(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = String(v).trim();
  if (/^\d{10,13}$/.test(s)) return toTimestamp(Number(s));
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (br) {
    const iso = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}T${(br[4] || '12').padStart(2, '0')}:${br[5] || '00'}:00-03:00`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Corpo recebido (JSON, formulário ou texto JSON) → objeto. */
export function bodyToObject(body, rawText) {
  if (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length) return body;
  if (Array.isArray(body) && body.length) return { items: body };
  try { const o = JSON.parse(rawText || ''); if (o && typeof o === 'object') return o; } catch { /* ignora */ }
  return null;
}

/**
 * Carga genérica → venda neutra, ou { error }.
 * Exige identificação da venda, status reconhecível e (para aprovada) valor.
 */
/**
 * Adaptador Pagar.me (v5): eventos order.* / charge.* com valores em CENTAVOS. Fica pronto, mas só funciona quando a
 * professora cria um endereço de recebimento e cola no painel do Pagar.me. Sem isso, nada chega aqui.
 */
export function fromPagarme(obj) {
  const ev = String(obj?.type || '');
  const data = obj?.data;
  if (!/^(order|charge)\./.test(ev) || !data || typeof data !== 'object') return null;
  const isCharge = ev.startsWith('charge.');
  const order = isCharge ? data.order || {} : data;
  const charge = isCharge ? data : (Array.isArray(data.charges) ? data.charges[data.charges.length - 1] : null) || {};
  const status = mapStatus(ev.split('.').slice(1).join(' ').replace(/_/g, ' ')) || mapStatus(data.status);
  const cust = data.customer || order.customer || {};
  const item = Array.isArray(order.items) ? order.items[0] : null;
  const ph = cust.phones?.mobile_phone || cust.phones?.home_phone || null;
  const cpfDigits = onlyDigits(String(cust.document || ''));
  const amount = Number(isCharge ? data.amount : data.amount ?? charge.amount);
  return {
    external_id: (isCharge ? (order.id || data.id) : data.id) ? String(isCharge ? (order.id || data.id) : data.id).slice(0, 120) : null,
    status,
    buyer_email: cust.email ? String(cust.email).trim().toLowerCase() : null,
    buyer_name: cust.name ? String(cust.name).trim().slice(0, 160) : null,
    buyer_phone: ph ? `${ph.country_code || ''}${ph.area_code || ''}${ph.number || ''}`.slice(0, 40) || null : null,
    buyer_cpf: isValidCpf(cpfDigits) ? cpfDigits : null,
    product_name: item?.description ? String(item.description).slice(0, 200) : null,
    product_ref: item?.code ? String(item.code).slice(0, 120) : null,
    amount_cents: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : null,
    paid_at: charge.paid_at ? toTimestamp(charge.paid_at) : null,
    payment_method: charge.payment_method ? String(charge.payment_method).slice(0, 40) : null,
    installments: Number.isInteger(charge.last_transaction?.installments) ? charge.last_transaction.installments : null,
    coupon: null,
  };
}

export function normalizePayload(obj) {
  if (!obj || typeof obj !== 'object') return { error: 'Conteúdo não reconhecido (não é JSON nem formulário).' };
  const pg = fromPagarme(obj);
  if (pg) return pg.status && pg.external_id ? { sale: pg } : { error: 'Evento do Pagar.me sem status reconhecido ou sem identificador. O conteúdo ficou guardado.' };
  const map = flatten(obj);
  const idf = pick(map, FIELDS.external_id);
  // Status: tenta os campos de status e, depois, o campo de evento.
  let status = null;
  for (const k of FIELDS.status) {
    const v = map.get(k);
    if (v == null || typeof v === 'object') continue;
    const s = mapStatus(v);
    if (s) { status = s; break; }
  }
  const email = pick(map, FIELDS.email);
  const amountF = pick(map, FIELDS.amount);
  const emailV = email ? String(email.value).trim().toLowerCase() : null;
  const missing = [];
  if (!idf) missing.push('identificador da venda');
  if (!status) missing.push('status (aprovada, reembolsada…)');
  if (missing.length) return { error: `Não consegui identificar: ${missing.join(', ')}. O conteúdo ficou guardado para reprocessar quando o leitor for ajustado.` };
  const cpfRaw = pick(map, FIELDS.cpf);
  const cpfDigits = cpfRaw ? onlyDigits(String(cpfRaw.value)) : '';
  const inst = pick(map, FIELDS.installments);
  const prod = pick(map, FIELDS.product_name);
  const ref = pick(map, FIELDS.product_ref);
  const paid = pick(map, FIELDS.paid_at);
  return {
    sale: {
      external_id: String(idf.value).slice(0, 120),
      status,
      buyer_email: emailV && EMAIL_RE.test(emailV) ? emailV : null,
      buyer_name: pick(map, FIELDS.name) ? String(pick(map, FIELDS.name).value).trim().slice(0, 160) : null,
      buyer_phone: pick(map, FIELDS.phone) ? String(pick(map, FIELDS.phone).value).trim().slice(0, 40) : null,
      buyer_cpf: isValidCpf(cpfDigits) ? cpfDigits : null,
      product_name: prod && typeof prod.value !== 'object' ? String(prod.value).trim().slice(0, 200) : null,
      product_ref: ref && typeof ref.value !== 'object' ? String(ref.value).trim().slice(0, 120) : null,
      amount_cents: amountF ? toCents(amountF.value, /cents|centavos/.test(amountF.key)) : null,
      paid_at: paid ? toTimestamp(paid.value) : null,
      payment_method: pick(map, FIELDS.method) ? String(pick(map, FIELDS.method).value).slice(0, 40) : null,
      installments: inst && Number.isInteger(Number(inst.value)) && Number(inst.value) > 0 && Number(inst.value) < 100 ? Number(inst.value) : null,
      coupon: pick(map, FIELDS.coupon) ? String(pick(map, FIELDS.coupon).value).slice(0, 60) : null,
    },
  };
}

// ───────────── Configurações e produtos ─────────────

export async function getFinanceSettings(d, tenantId) {
  const row = await d.one('SELECT auto_access, end_on_refund, notify_email FROM finance_settings WHERE tenant_id = ?', [tenantId]);
  return row || { auto_access: false, end_on_refund: true, notify_email: null };
}

export async function saveFinanceSettings(d, ctx, p) {
  const cur = await getFinanceSettings(d, ctx.tenantId);
  const email = p.notify_email === undefined ? cur.notify_email : (String(p.notify_email || '').trim().toLowerCase() || null);
  if (email && !EMAIL_RE.test(email)) throw badRequest('E-mail de aviso inválido.');
  const next = {
    auto_access: p.auto_access ?? cur.auto_access,
    end_on_refund: p.end_on_refund ?? cur.end_on_refund,
    notify_email: email,
  };
  await d.run(
    `INSERT INTO finance_settings (tenant_id, auto_access, end_on_refund, notify_email, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT (tenant_id) DO UPDATE SET auto_access = EXCLUDED.auto_access, end_on_refund = EXCLUDED.end_on_refund, notify_email = EXCLUDED.notify_email, updated_at = EXCLUDED.updated_at`,
    [ctx.tenantId, next.auto_access, next.end_on_refund, next.notify_email, nowIso()]
  );
  await audit(d, ctx, 'finance.settings', { payload: next });
  return next;
}

const cleanProduct = (p) => {
  const name = String(p.name || '').trim();
  if (name.length < 2) throw badRequest('Informe o nome do produto.');
  if (!KINDS.includes(p.kind || 'outro')) throw badRequest('Tipo de produto inválido.');
  const grants = !!p.grants_access;
  if (grants && !p.plan_days) throw badRequest('Para liberar acesso, informe por quantos dias o plano vale.');
  return {
    name: name.slice(0, 200),
    kind: p.kind || 'outro',
    external_ref: String(p.external_ref || '').trim().slice(0, 120) || null,
    price_cents: p.price_cents == null ? null : Math.round(Number(p.price_cents)),
    grants_access: grants,
    plan_days: p.plan_days ? Number(p.plan_days) : null,
    edital_id: p.edital_id || null,
    cohort: String(p.cohort || '').trim().slice(0, 120) || null,
    active: p.active ?? true,
  };
};

export async function listProducts(d) {
  return d.all(
    `SELECT p.*, (SELECT count(*) FROM sales s WHERE s.product_id = p.id AND s.status = 'approved') AS approved_sales,
            (SELECT COALESCE(sum(s.amount_cents), 0) FROM sales s WHERE s.product_id = p.id AND s.status = 'approved') AS revenue_cents
       FROM products p ORDER BY p.auto_created DESC, p.active DESC, lower(p.name)`);
}

export async function saveProduct(d, ctx, id, input) {
  const p = cleanProduct(input);
  try {
    if (id) {
      const n = await d.run(
        `UPDATE products SET name=?, kind=?, external_ref=?, price_cents=?, grants_access=?, plan_days=?, edital_id=?, cohort=?, active=?, auto_created=false, updated_at=? WHERE id=?`,
        [p.name, p.kind, p.external_ref, p.price_cents, p.grants_access, p.plan_days, p.edital_id, p.cohort, p.active, nowIso(), id]);
      if (!n) throw notFound('Produto não encontrado.');
      await audit(d, ctx, 'product.update', { targetType: 'product', targetId: id, payload: p });
      return { id };
    }
    const row = await d.one(
      `INSERT INTO products (tenant_id, name, kind, external_ref, price_cents, grants_access, plan_days, edital_id, cohort, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
      [ctx.tenantId, p.name, p.kind, p.external_ref, p.price_cents, p.grants_access, p.plan_days, p.edital_id, p.cohort, p.active, nowIso(), nowIso()]);
    await audit(d, ctx, 'product.create', { targetType: 'product', targetId: row.id, payload: p });
    return row;
  } catch (e) {
    if (e.code === '23505') throw conflict('Já existe um produto com esse nome ou código.', 'product_dup');
    throw e;
  }
}

async function matchProduct(d, tenantId, { product_ref, product_name }, { create }) {
  if (product_ref) {
    const p = await d.one('SELECT * FROM products WHERE external_ref = ?', [product_ref]);
    if (p) return p;
  }
  if (product_name) {
    const p = await d.one('SELECT * FROM products WHERE lower(name) = lower(?)', [product_name]);
    if (p) return p;
    if (create) {
      const row = await d.one(
        `INSERT INTO products (tenant_id, name, kind, external_ref, auto_created, created_at, updated_at) VALUES (?,?,'outro',?,true,?,?)
         ON CONFLICT DO NOTHING RETURNING *`,
        [tenantId, product_name, product_ref || null, nowIso(), nowIso()]);
      return row || d.one('SELECT * FROM products WHERE lower(name) = lower(?)', [product_name]);
    }
  }
  return null;
}

// ───────────── Aplicar uma venda ─────────────

async function grantAccess(d, ctx, sale, product, tz) {
  const t = today(tz);
  const days = product.plan_days;
  let st = sale.buyer_email ? await d.one(
    `SELECT st.id, st.access_until, st.plan_status, u.status AS user_status FROM students st JOIN users u ON u.id = st.user_id WHERE lower(u.email) = lower(?)`, [sale.buyer_email]) : null;
  let created = false;
  if (!st) {
    if (!sale.buyer_email) return null;
    const owner = await d.one('SELECT 1 AS x FROM users WHERE lower(email) = lower(?)', [sale.buyer_email]);
    if (owner) return null; // e-mail é de equipe/outro ambiente: não mexe
    const name = (sale.buyer_name || sale.buyer_email.split('@')[0]).slice(0, 120);
    const u = await d.one(
      `INSERT INTO users (tenant_id, email, name, role, status, created_at, updated_at) VALUES (?,?,?,'student','invited',?,?) RETURNING id`,
      [ctx.tenantId, sale.buyer_email, name, nowIso(), nowIso()]);
    let cpf = sale.buyer_cpf || null;
    if (cpf && await d.one('SELECT 1 AS x FROM students WHERE cpf = ?', [cpf])) cpf = null;
    st = await d.one(
      `INSERT INTO students (tenant_id, user_id, cpf, phone, cohort, origin, plan_status, created_at, updated_at) VALUES (?,?,?,?,?,'compra','active',?,?) RETURNING id, access_until, plan_status`,
      [ctx.tenantId, u.id, cpf, sale.buyer_phone || null, product.cohort, nowIso(), nowIso()]);
    created = true;
  }
  const from = st.plan_status === 'active' && st.access_until && st.access_until >= t ? st.access_until : t;
  const until = addDays(from, days);
  await d.run(`UPDATE students SET access_until = ?, plan_status = 'active', cohort = COALESCE(cohort, ?), updated_at = ? WHERE id = ?`, [until, product.cohort, nowIso(), st.id]);
  // V3.0: a compra também vira um "acesso" (vigência) ligado à venda; o resumo da lista é recalculado a partir deles.
  await d.run(
    `INSERT INTO accesses (tenant_id, student_id, kind, label, starts_on, ends_on, sale_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [ctx.tenantId, st.id, product.kind === 'mentoria' ? 'turma' : 'plataforma', `Compra: ${String(product.name || '').slice(0, 100)}`, t, until, sale.id, nowIso(), nowIso()]);
  await syncLegacy(d, st.id, tz);
  if (product.edital_id) {
    const ed = await d.one('SELECT id, archived_at FROM editais WHERE id = ?', [product.edital_id]);
    if (ed && !ed.archived_at) {
      const ex = await d.one('SELECT id, status FROM enrollments WHERE student_id = ? AND edital_id = ?', [st.id, ed.id]);
      if (!ex) await d.run('INSERT INTO enrollments (tenant_id, student_id, edital_id, created_at) VALUES (?,?,?,?)', [ctx.tenantId, st.id, ed.id, nowIso()]);
      else if (ex.status === 'archived') await d.run("UPDATE enrollments SET status = 'active', archived_at = NULL WHERE id = ?", [ex.id]);
    }
  }
  await audit(d, ctx, created ? 'finance.student_created' : 'finance.access_renewed', { targetType: 'student', targetId: st.id, payload: { sale_id: sale.id, until } });
  return { student_id: st.id, until, created };
}

async function endAccess(d, ctx, sale) {
  if (!sale.student_id || !sale.access_granted_until) return false;
  // Se outra venda aprovada ainda sustenta o plano, não encerra.
  const other = await d.one(
    `SELECT 1 AS x FROM sales WHERE student_id = ? AND id <> ? AND status = 'approved' AND access_granted_until IS NOT NULL AND access_granted_until >= ?`,
    [sale.student_id, sale.id, today(DEFAULT_TZ)]);
  if (other) return false;
  await d.run("UPDATE students SET plan_status = 'ended', updated_at = ? WHERE id = ?", [nowIso(), sale.student_id]);
  await d.run("UPDATE accesses SET status = 'canceled', cancel_reason = 'Compra cancelada/reembolsada', canceled_at = ?, paused_from = NULL, updated_at = ? WHERE sale_id = ? AND status = 'active'", [nowIso(), nowIso(), sale.id]);
  await syncLegacy(d, sale.student_id);
  await audit(d, ctx, 'finance.access_ended', { targetType: 'student', targetId: sale.student_id, payload: { sale_id: sale.id } });
  return true;
}

/**
 * Aplica uma venda neutra. opts: { origin: 'webhook'|'manual'|'importacao', source, grant: bool, now }.
 * Retorna { sale_id, created, transition, ignored, access, notify }.
 */
export async function applySale(d, ctx, rec, opts) {
  const settings = await getFinanceSettings(d, ctx.tenantId);
  const product = await matchProduct(d, ctx.tenantId, rec, { create: true });
  const ts = opts.at || nowIso();
  let sale = await d.one('SELECT * FROM sales WHERE source = ? AND external_id = ?', [opts.source, rec.external_id]);
  let created = false;
  let transition = null;
  if (!sale) {
    if (rec.status === 'approved' && rec.amount_cents == null) throw badRequest('Venda aprovada sem valor.');
    sale = await d.one(
      `INSERT INTO sales (tenant_id, source, external_id, product_id, product_name, buyer_name, buyer_email, buyer_phone, buyer_cpf, amount_cents, payment_method, installments, coupon, status, paid_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      [ctx.tenantId, opts.source, rec.external_id, product?.id || null, rec.product_name || product?.name || null, rec.buyer_name, rec.buyer_email, rec.buyer_phone, rec.buyer_cpf,
        rec.amount_cents ?? product?.price_cents ?? 0, rec.payment_method, rec.installments, rec.coupon, rec.status, rec.status === 'approved' ? (rec.paid_at || ts) : rec.paid_at, ts, ts]);
    await d.run('INSERT INTO sale_events (tenant_id, sale_id, status, origin, at) VALUES (?,?,?,?,?)', [ctx.tenantId, sale.id, rec.status, opts.origin, ts]);
    created = true;
    transition = rec.status;
  } else {
    // Preenche dados que faltavam; nunca apaga dado já guardado.
    await d.run(
      `UPDATE sales SET buyer_name = COALESCE(buyer_name, ?), buyer_email = COALESCE(buyer_email, ?), buyer_phone = COALESCE(buyer_phone, ?), buyer_cpf = COALESCE(buyer_cpf, ?),
              product_id = COALESCE(product_id, ?), product_name = COALESCE(product_name, ?), payment_method = COALESCE(payment_method, ?), installments = COALESCE(installments, ?),
              coupon = COALESCE(coupon, ?), updated_at = ? WHERE id = ?`,
      [rec.buyer_name, rec.buyer_email, rec.buyer_phone, rec.buyer_cpf, product?.id || null, rec.product_name, rec.payment_method, rec.installments, rec.coupon, ts, sale.id]);
    if (rec.status !== sale.status && NEXT[sale.status].includes(rec.status)) {
      const amount = rec.status === 'approved' && rec.amount_cents != null ? rec.amount_cents : sale.amount_cents;
      await d.run('UPDATE sales SET status = ?, amount_cents = ?, paid_at = CASE WHEN ? = \'approved\' THEN COALESCE(?::timestamptz, ?::timestamptz) ELSE paid_at END, updated_at = ? WHERE id = ?',
        [rec.status, amount, rec.status, rec.paid_at, ts, ts, sale.id]);
      await d.run('INSERT INTO sale_events (tenant_id, sale_id, status, origin, at) VALUES (?,?,?,?,?)', [ctx.tenantId, sale.id, rec.status, opts.origin, ts]);
      transition = rec.status;
    }
  }
  sale = await d.one('SELECT * FROM sales WHERE id = ?', [sale.id]);

  // Vincula ao aluno pelo e-mail.
  if (!sale.student_id && sale.buyer_email) {
    const st = await d.one('SELECT st.id FROM students st JOIN users u ON u.id = st.user_id WHERE lower(u.email) = lower(?)', [sale.buyer_email]);
    if (st) { await d.run('UPDATE sales SET student_id = ? WHERE id = ?', [st.id, sale.id]); sale.student_id = st.id; }
  }

  let access = null;
  const prod = sale.product_id ? await d.one('SELECT * FROM products WHERE id = ?', [sale.product_id]) : null;
  if (transition === 'approved' && opts.grant && settings.auto_access && prod?.grants_access && prod.plan_days) {
    access = await grantAccess(d, ctx, sale, prod, DEFAULT_TZ);
    if (access) {
      await d.run('UPDATE sales SET student_id = ?, access_granted_until = ? WHERE id = ?', [access.student_id, access.until, sale.id]);
      sale.student_id = access.student_id; sale.access_granted_until = access.until;
    }
  }
  if ((transition === 'refunded' || transition === 'chargeback') && settings.end_on_refund && opts.origin !== 'importacao') {
    access = { ended: await endAccess(d, ctx, sale) };
  }
  const notify = opts.notify && transition && settings.notify_email && ['approved', 'refunded', 'chargeback'].includes(transition)
    ? { to: settings.notify_email, status: transition, sale }
    : null;
  return { sale_id: sale.id, created, transition, ignored: !transition, access, notify, product_id: sale.product_id };
}

export const brl = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function sendSaleNotice(n) {
  if (!n) return false;
  const s = n.sale;
  const titulo = { approved: 'Nova compra aprovada', refunded: 'Compra reembolsada', chargeback: 'Chargeback' }[n.status];
  return sendMail({
    to: n.to,
    subject: `${titulo}: ${s.product_name || 'produto'} · ${brl(s.amount_cents)}`,
    text: `${titulo}\n\nProduto: ${s.product_name || '—'}\nValor: ${brl(s.amount_cents)}\nComprador: ${s.buyer_name || '—'} <${s.buyer_email || 'sem e-mail'}>\nTelefone: ${s.buyer_phone || '—'}\nForma de pagamento: ${s.payment_method || '—'}\n\nVeja no painel: Financeiro → Vendas.`,
  });
}

// ───────────── Recebimento (webhook) ─────────────

export async function findEndpoint(token) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token || ''))) return null;
  return tx(SYSTEM, (d) => d.one('SELECT id, tenant_id, label FROM webhook_endpoints WHERE token = ? AND revoked_at IS NULL', [token]));
}

/** Guarda a carga bruta e, se entendida, aplica a venda. Nunca lança por carga ruim: o checkout recebe 200 e a carga fica na caixa de entrada. */
export async function receiveWebhook(endpoint, body, rawText) {
  const ctx = { tenantId: endpoint.tenant_id, platform: false, userId: null, role: 'system' };
  const payload = String(rawText || JSON.stringify(body ?? {})).slice(0, MAX_PAYLOAD);
  const obj = bodyToObject(body, rawText);
  const out = await tx(ctx, async (d) => {
    const ts = nowIso();
    await d.run('UPDATE webhook_endpoints SET last_received_at = ? WHERE id = ?', [ts, endpoint.id]);
    const norm = normalizePayload(obj);
    if (norm.error) {
      await d.run('INSERT INTO webhook_inbox (tenant_id, endpoint_id, received_at, payload, result, detail) VALUES (?,?,?,?,?,?)', [ctx.tenantId, endpoint.id, ts, payload, 'ignored', norm.error]);
      return { result: 'ignored', notify: null };
    }
    try {
      await d.run('SAVEPOINT rcv');
      const r = await applySale(d, ctx, norm.sale, { origin: 'webhook', source: endpoint.label, grant: true, notify: true });
      await d.run('RELEASE SAVEPOINT rcv');
      await d.run('INSERT INTO webhook_inbox (tenant_id, endpoint_id, received_at, payload, result, detail, sale_id) VALUES (?,?,?,?,?,?,?)',
        [ctx.tenantId, endpoint.id, ts, payload, 'processed', r.ignored ? 'Evento repetido ou fora de ordem (sem mudança).' : null, r.sale_id]);
      return { result: 'processed', notify: r.notify };
    } catch (e) {
      await d.run('ROLLBACK TO SAVEPOINT rcv');
      await d.run('INSERT INTO webhook_inbox (tenant_id, endpoint_id, received_at, payload, result, detail) VALUES (?,?,?,?,?,?)',
        [ctx.tenantId, endpoint.id, ts, payload, 'error', String(e.message || e).slice(0, 300)]);
      return { result: 'error', notify: null };
    }
  });
  if (out.notify) sendSaleNotice(out.notify).catch(() => {});
  return out.result;
}

export async function reprocessInbox(d, ctx, inboxId) {
  const it = await d.one('SELECT i.*, e.label FROM webhook_inbox i LEFT JOIN webhook_endpoints e ON e.id = i.endpoint_id WHERE i.id = ?', [inboxId]);
  if (!it) throw notFound('Item não encontrado.');
  let obj = null;
  try { obj = JSON.parse(it.payload); } catch { /* ignora */ }
  const norm = normalizePayload(obj);
  if (norm.error) {
    await d.run('UPDATE webhook_inbox SET detail = ? WHERE id = ?', [norm.error, inboxId]);
    return { result: 'ignored', detail: norm.error };
  }
  const r = await applySale(d, ctx, norm.sale, { origin: 'webhook', source: it.label || 'webhook', grant: true, notify: false });
  await d.run("UPDATE webhook_inbox SET result = 'processed', detail = ?, sale_id = ? WHERE id = ?", [r.ignored ? 'Evento repetido ou fora de ordem (sem mudança).' : null, r.sale_id, inboxId]);
  await audit(d, ctx, 'finance.inbox_reprocess', { targetType: 'inbox', targetId: inboxId });
  return { result: 'processed', sale_id: r.sale_id };
}

export async function createEndpoint(d, ctx, label) {
  const l = String(label || '').trim().slice(0, 60);
  if (l.length < 2) throw badRequest('Dê um nome ao endereço (ex.: o nome do checkout).');
  const token = crypto.randomBytes(24).toString('base64url');
  const row = await d.one('INSERT INTO webhook_endpoints (tenant_id, label, token, created_by, created_at) VALUES (?,?,?,?,?) RETURNING id, label, token, created_at', [ctx.tenantId, l, token, ctx.userId, nowIso()]);
  await audit(d, ctx, 'finance.endpoint_create', { targetType: 'endpoint', targetId: row.id, payload: { label: l } });
  return row;
}

export async function listEndpoints(d) {
  return d.all(
    `SELECT e.id, e.label, e.token, e.created_at, e.revoked_at, e.last_received_at,
            (SELECT count(*) FROM webhook_inbox i WHERE i.endpoint_id = e.id) AS received
       FROM webhook_endpoints e ORDER BY e.revoked_at NULLS FIRST, e.created_at DESC`);
}

export async function revokeEndpoint(d, ctx, id) {
  const n = await d.run('UPDATE webhook_endpoints SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), id]);
  if (!n) throw notFound('Endereço não encontrado.');
  await audit(d, ctx, 'finance.endpoint_revoke', { targetType: 'endpoint', targetId: id });
}

export async function listInbox(d, limit = 50) {
  return d.all(
    `SELECT i.id, i.received_at, i.result, i.detail, i.sale_id, i.payload, e.label AS endpoint
       FROM webhook_inbox i LEFT JOIN webhook_endpoints e ON e.id = i.endpoint_id ORDER BY i.received_at DESC LIMIT ?`, [limit]);
}

// ───────────── Lançamento manual ─────────────

export async function manualSale(d, ctx, p) {
  const email = String(p.buyer_email || '').trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) throw badRequest('E-mail do comprador inválido.');
  if (!p.buyer_name && !email) throw badRequest('Informe o nome ou o e-mail do comprador.');
  const amount = toCents(p.amount, false);
  if (amount == null) throw badRequest('Informe o valor.');
  const prod = p.product_id ? await d.one('SELECT * FROM products WHERE id = ?', [p.product_id]) : null;
  if (p.product_id && !prod) throw notFound('Produto não encontrado.');
  const status = p.status || 'approved';
  if (!STATUS[status]) throw badRequest('Status inválido.');
  const cpf = onlyDigits(p.buyer_cpf || '');
  const at = p.date && isValidDate(p.date) ? new Date(`${p.date}T12:00:00-03:00`).toISOString() : nowIso();
  const rec = {
    external_id: `manual-${crypto.randomUUID()}`, status, buyer_email: email || null, buyer_name: String(p.buyer_name || '').trim().slice(0, 160) || null,
    buyer_phone: String(p.buyer_phone || '').trim().slice(0, 40) || null, buyer_cpf: isValidCpf(cpf) ? cpf : null,
    product_name: prod?.name || String(p.product_name || '').trim().slice(0, 200) || null, product_ref: prod?.external_ref || null,
    amount_cents: amount, paid_at: status === 'approved' ? at : null, payment_method: String(p.payment_method || '').slice(0, 40) || null, installments: null, coupon: null,
  };
  const r = await applySale(d, ctx, rec, { origin: 'manual', source: 'manual', grant: !!p.grant_access, notify: false, at });
  await audit(d, ctx, 'finance.sale_manual', { targetType: 'sale', targetId: r.sale_id, payload: { status, amount_cents: amount } });
  return r;
}

/** Avança o status de uma venda (somente para frente). */
export async function changeStatus(d, ctx, saleId, status, note) {
  if (!STATUS[status]) throw badRequest('Status inválido.');
  const sale = await d.one('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw notFound('Venda não encontrada.');
  if (!NEXT[sale.status].includes(status)) throw badRequest(`Não é possível mudar de "${STATUS[sale.status]}" para "${STATUS[status]}".`);
  const r = await applySale(d, ctx, {
    external_id: sale.external_id, status, buyer_email: null, buyer_name: null, buyer_phone: null, buyer_cpf: null, product_name: null, product_ref: null,
    amount_cents: null, paid_at: null, payment_method: null, installments: null, coupon: null,
  }, { origin: 'manual', source: sale.source, grant: false, notify: false });
  if (note) await d.run('UPDATE sale_events SET note = ? WHERE id = (SELECT id FROM sale_events WHERE sale_id = ? ORDER BY at DESC LIMIT 1)', [String(note).slice(0, 300), saleId]);
  await audit(d, ctx, 'finance.sale_status', { targetType: 'sale', targetId: saleId, payload: { from: sale.status, to: status } });
  return r;
}

// ───────────── Importação CSV ─────────────

const SALE_HEADERS = {
  external_id: ['id', 'id_da_venda', 'id_venda', 'transacao', 'codigo_transacao', 'codigo_da_transacao', 'pedido', 'numero_do_pedido', 'transaction_id', 'order_id', 'codigo'],
  status: ['status', 'situacao', 'status_da_venda', 'status_pagamento', 'status_do_pagamento'],
  email: ['email', 'e_mail', 'email_do_comprador', 'email_cliente', 'email_do_cliente'],
  name: ['nome', 'nome_do_comprador', 'comprador', 'cliente', 'nome_cliente', 'nome_do_cliente', 'nome_completo'],
  phone: ['celular', 'telefone', 'whatsapp', 'phone'],
  cpf: ['cpf', 'documento'],
  product_name: ['produto', 'nome_do_produto', 'produto_nome', 'oferta', 'plano', 'curso'],
  amount: ['valor', 'valor_pago', 'valor_total', 'total', 'preco', 'valor_liquido', 'valor_bruto'],
  paid_at: ['data', 'data_da_venda', 'data_do_pedido', 'data_pagamento', 'data_de_pagamento', 'data_aprovacao', 'data_da_compra', 'pago_em'],
  method: ['forma_de_pagamento', 'forma_pagamento', 'metodo_de_pagamento', 'pagamento', 'meio_de_pagamento'],
  installments: ['parcelas', 'numero_de_parcelas'],
  coupon: ['cupom', 'codigo_do_cupom'],
};

export const SALES_TEMPLATE = '﻿id;data;status;produto;valor;nome;email;celular;cpf;forma_de_pagamento;parcelas\r\n' +
  'PED-1001;15/09/2026;aprovado;Mentoria Método APQR;1997,00;Maria da Silva;maria@exemplo.com;(61) 99999-0000;;cartão;12\r\n';

export function readSalesCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw badRequest('O arquivo está vazio ou só tem o cabeçalho.');
  const head = rows[0].map(norm);
  const idx = {};
  for (const [k, names] of Object.entries(SALE_HEADERS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.amount < 0 || idx.status < 0 || (idx.email < 0 && idx.name < 0)) {
    throw badRequest('Não encontrei as colunas obrigatórias: status, valor e nome ou e-mail. Use o modelo para baixar o formato esperado.');
  }
  const records = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '');
    const status = mapStatus(get('status'));
    const amount = toCents(get('amount'));
    const email = get('email').toLowerCase();
    if (!status) return errors.push({ line, reason: `status não reconhecido ("${get('status')}")` });
    if (amount == null) return errors.push({ line, reason: 'valor inválido' });
    if (email && !EMAIL_RE.test(email)) return errors.push({ line, reason: 'e-mail inválido' });
    if (!email && !get('name')) return errors.push({ line, reason: 'sem nome e sem e-mail' });
    const dRaw = get('paid_at');
    const dIso = dRaw ? parseDate(dRaw.slice(0, 10)) ?? toTimestamp(dRaw)?.slice(0, 10) : null;
    if (dRaw && !dIso) return errors.push({ line, reason: `data inválida ("${dRaw}")` });
    const cpf = onlyDigits(get('cpf'));
    const inst = Number(get('installments'));
    const product = get('product_name') || null;
    const at = dIso ? new Date(`${dIso}T12:00:00-03:00`).toISOString() : null;
    // Sem id na planilha: chave estável (mesma linha reimportada não duplica).
    const ext = get('external_id') || `imp-${crypto.createHash('sha1').update([email || get('name').toLowerCase(), product || '', amount, dIso || ''].join('|')).digest('hex').slice(0, 16)}`;
    records.push({
      line, external_id: ext.slice(0, 120), status, buyer_email: email || null, buyer_name: get('name').slice(0, 160) || null, buyer_phone: get('phone').slice(0, 40) || null,
      buyer_cpf: isValidCpf(cpf) ? cpf : null, product_name: product && product.slice(0, 200), product_ref: null, amount_cents: amount, paid_at: status === 'approved' ? at : null,
      payment_method: get('method').slice(0, 40) || null, installments: Number.isInteger(inst) && inst > 0 && inst < 100 ? inst : null, coupon: get('coupon').slice(0, 60) || null, at,
    });
  });
  return { records, errors };
}

export async function importSales(ctx, csv, { dryRun }) {
  const { records, errors } = readSalesCsv(csv);
  if (records.length > 10000) throw badRequest('Máximo de 10.000 linhas por arquivo.');
  return tx(ctx, async (d) => {
    const sum = { created: 0, updated: 0, unchanged: 0, revenue_cents: 0 };
    for (const r of records) {
      const ex = await d.one('SELECT status FROM sales WHERE source = ? AND external_id = ?', ['importacao', r.external_id]);
      if (dryRun) {
        if (!ex) { sum.created++; if (r.status === 'approved') sum.revenue_cents += r.amount_cents; } else if (ex.status !== r.status && NEXT[ex.status].includes(r.status)) sum.updated++; else sum.unchanged++;
        continue;
      }
      await d.run('SAVEPOINT imp');
      try {
        const res = await applySale(d, ctx, r, { origin: 'importacao', source: 'importacao', grant: false, notify: false, at: r.at || nowIso() });
        await d.run('RELEASE SAVEPOINT imp');
        if (res.created) { sum.created++; if (r.status === 'approved') sum.revenue_cents += r.amount_cents; } else if (res.transition) sum.updated++; else sum.unchanged++;
      } catch (e) {
        await d.run('ROLLBACK TO SAVEPOINT imp');
        errors.push({ line: r.line, reason: String(e.message || e).slice(0, 120) });
      }
    }
    if (!dryRun) await audit(d, ctx, 'finance.import', { payload: { created: sum.created, updated: sum.updated, errors: errors.length } });
    return { dry_run: !!dryRun, total_lines: records.length + errors.length, ...sum, skipped: errors.length, errors: errors.sort((a, b) => a.line - b.line).slice(0, 200) };
  });
}

// ───────────── Consulta e painel ─────────────

const SALE_COLS = `s.id, s.source, s.external_id, s.product_id, COALESCE(p.name, s.product_name) AS product, p.kind, s.buyer_name, s.buyer_email, s.buyer_phone,
  s.amount_cents, s.payment_method, s.installments, s.coupon, s.status, s.paid_at, s.created_at, s.student_id, s.access_granted_until`;

export async function listSales(d, f = {}) {
  const where = [];
  const params = [];
  if (f.status && STATUS[f.status]) { where.push('s.status = ?'); params.push(f.status); }
  if (f.product_id) { where.push('s.product_id = ?'); params.push(f.product_id); }
  if (f.from && isValidDate(f.from)) { where.push('s.created_at >= ?::timestamptz'); params.push(`${f.from}T00:00:00-03:00`); }
  if (f.to && isValidDate(f.to)) { where.push('s.created_at < ?::timestamptz'); params.push(`${addDays(f.to, 1)}T00:00:00-03:00`); }
  if (f.q) { where.push("(lower(coalesce(s.buyer_name,'')) LIKE ? OR lower(coalesce(s.buyer_email,'')) LIKE ?)"); const q = `%${String(f.q).toLowerCase().slice(0, 80)}%`; params.push(q, q); }
  return d.all(
    `SELECT ${SALE_COLS} FROM sales s LEFT JOIN products p ON p.id = s.product_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY s.created_at DESC LIMIT ?`, [...params, Math.min(Number(f.limit) || 500, 5000)]);
}

export async function saleDetail(d, id) {
  const s = await d.one(`SELECT ${SALE_COLS}, st_u.status AS student_user_status FROM sales s LEFT JOIN products p ON p.id = s.product_id
      LEFT JOIN students st ON st.id = s.student_id LEFT JOIN users st_u ON st_u.id = st.user_id WHERE s.id = ?`, [id]);
  if (!s) throw notFound('Venda não encontrada.');
  const events = await d.all('SELECT status, origin, note, at FROM sale_events WHERE sale_id = ? ORDER BY at', [id]);
  return { sale: s, events };
}

const ymd = (iso, tz) => localDate(new Date(iso), tz);

/** Indicadores do período [from, to] (datas locais). Receita = vendas aprovadas (valor bruto); reembolso/chargeback saem do líquido. */
export async function dashboard(d, { from, to, tz = DEFAULT_TZ }) {
  const rows = await d.all(
    `SELECT s.id, s.status, s.amount_cents, s.payment_method, s.created_at, s.buyer_email, COALESCE(p.name, s.product_name, 'Sem produto') AS product, COALESCE(p.kind, 'outro') AS kind
       FROM sales s LEFT JOIN products p ON p.id = s.product_id
      WHERE s.created_at >= ?::timestamptz AND s.created_at < ?::timestamptz`,
    [`${from}T00:00:00-03:00`, `${addDays(to, 1)}T00:00:00-03:00`]);
  const k = { approved: 0, pending: 0, canceled: 0, refunded: 0, chargeback: 0 };
  let gross = 0; let refunded = 0; let lost = 0;
  const byProduct = new Map(); const byMethod = new Map(); const byDay = new Map(); const byKind = new Map();
  const buyers = new Set();
  for (const r of rows) {
    k[r.status]++;
    const sold = ['approved', 'refunded', 'chargeback'].includes(r.status); // chegou a ser paga
    if (sold) {
      gross += r.amount_cents;
      if (r.status === 'refunded') refunded += r.amount_cents;
      if (r.status === 'chargeback') lost += r.amount_cents;
      if (r.buyer_email) buyers.add(r.buyer_email);
      const day = ymd(r.created_at, tz);
      byDay.set(day, (byDay.get(day) || 0) + r.amount_cents);
      for (const [m, key, label] of [[byProduct, r.product, r.product], [byMethod, r.payment_method || 'Não informado', r.payment_method || 'Não informado'], [byKind, r.kind, r.kind]]) {
        const cur = m.get(key) || { label, sales: 0, cents: 0 };
        if (r.status === 'approved') { cur.sales++; cur.cents += r.amount_cents; }
        m.set(key, cur);
      }
    }
  }
  const paidCount = k.approved + k.refunded + k.chargeback;
  const net = gross - refunded - lost;
  const days = []; // série diária contínua
  for (let t = from, n = 0; t <= to && n < 400; t = addDays(t, 1), n++) days.push({ date: t, cents: byDay.get(t) || 0 });
  const top = (m) => [...m.values()].sort((a, b) => b.cents - a.cents);
  return {
    period: { from, to },
    kpi: {
      gross_cents: gross, refunded_cents: refunded, chargeback_cents: lost, net_cents: net,
      sales_paid: paidCount, approved: k.approved, pending: k.pending, canceled: k.canceled, refunded: k.refunded, chargeback: k.chargeback,
      ticket_cents: paidCount ? Math.round(gross / paidCount) : 0,
      refund_rate: paidCount ? Math.round(((k.refunded + k.chargeback) / paidCount) * 1000) / 10 : 0,
      approval_rate: rows.length ? Math.round((paidCount / rows.length) * 1000) / 10 : 0,
      buyers: buyers.size,
    },
    series: days,
    by_product: top(byProduct), by_method: top(byMethod), by_kind: top(byKind),
  };
}

export async function recentPurchases(d, limit = 5) {
  return d.all(
    `SELECT s.id, s.created_at, s.buyer_name, s.buyer_email, s.amount_cents, s.status, COALESCE(p.name, s.product_name) AS product
       FROM sales s LEFT JOIN products p ON p.id = s.product_id WHERE s.status IN ('approved','refunded','chargeback') ORDER BY s.created_at DESC LIMIT ?`, [limit]);
}

const csvCell = (v) => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function salesCsv(rows, tz = DEFAULT_TZ) {
  const head = ['Data', 'Status', 'Produto', 'Valor (R$)', 'Comprador', 'E-mail', 'Celular', 'Forma de pagamento', 'Parcelas', 'Cupom', 'Origem', 'Código'];
  const lines = rows.map((r) => [
    localDate(new Date(r.created_at), tz).split('-').reverse().join('/'), STATUS[r.status], r.product || '', (r.amount_cents / 100).toFixed(2).replace('.', ','),
    r.buyer_name || '', r.buyer_email || '', r.buyer_phone || '', r.payment_method || '', r.installments || '', r.coupon || '', r.source, r.external_id,
  ].map(csvCell).join(';'));
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
}
