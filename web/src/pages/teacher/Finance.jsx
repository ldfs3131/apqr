import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Ban, Check, CircleCheck, CircleDashed, Clock, Copy, Download, FileUp, Link2, Plus, Receipt, RotateCcw, Search, ShieldAlert, ShoppingBag, Undo2, Wallet, Webhook } from 'lucide-react';
import { api, download, qs } from '../../lib/api.js';
import { useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Alert, Async, Card, Confirm, Empty, Field, Modal, Seg, Stat, Tabs } from '../../components/ui.jsx';

export const brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const n = (v) => Number(v || 0).toLocaleString('pt-BR');
const ST = {
  approved: { label: 'Aprovada', icon: CircleCheck, cls: 'eng-active-soft' },
  pending: { label: 'Aguardando', icon: Clock, cls: 'eng-attention-soft' },
  refunded: { label: 'Reembolsada', icon: Undo2, cls: 'eng-never-soft' },
  chargeback: { label: 'Chargeback', icon: ShieldAlert, cls: 'eng-inactive-soft' },
  canceled: { label: 'Cancelada', icon: Ban, cls: 'eng-ended-soft' },
};
export function SaleBadge({ status }) {
  const s = ST[status] || ST.pending;
  return <span className={`eng-badge ${s.cls}`}><s.icon size={13} aria-hidden="true" />{s.label}</span>;
}
const KIND = { curso: 'Curso', mentoria: 'Mentoria', outro: 'Outro' };
const iso = (d) => d.toISOString().slice(0, 10);
const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return iso(d); };
const axis = { stroke: 'var(--chart-grid)', tickLine: false, axisLine: false, tick: { fill: 'var(--ink-3)', fontSize: 12 } };

export default function Finance() {
  const [sp, setSp] = useSearchParams();
  const tab = ['painel', 'vendas', 'produtos', 'integracao'].includes(sp.get('aba')) ? sp.get('aba') : 'painel';
  const setTab = (v) => { const p = new URLSearchParams(sp); if (v === 'painel') p.delete('aba'); else p.set('aba', v); setSp(p, { replace: true }); };
  return (
    <Page title="Financeiro" eyebrow="Mentoria" topbar={false} subtitle="Vendas dos seus cursos e da mentoria, vindas de qualquer checkout, com os dados de cada comprador.">
      <div className="stack">
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'painel', label: 'Painel', icon: Wallet }, { value: 'vendas', label: 'Vendas', icon: Receipt },
          { value: 'produtos', label: 'Produtos', icon: ShoppingBag }, { value: 'integracao', label: 'Integração', icon: Webhook },
        ]} />
        {tab === 'painel' && <Dashboard goTo={setTab} />}
        {tab === 'vendas' && <Sales />}
        {tab === 'produtos' && <Products />}
        {tab === 'integracao' && <Integration />}
      </div>
    </Page>
  );
}

// ───────────── Painel ─────────────

const PERIODS = [
  { value: '7', label: '7 dias' }, { value: '30', label: '30 dias' }, { value: '90', label: '90 dias' },
  { value: 'mes', label: 'Este mês' }, { value: 'ano', label: 'Este ano' },
];
function rangeOf(p) {
  const to = shift(0);
  if (p === 'mes') return { from: `${to.slice(0, 7)}-01`, to };
  if (p === 'ano') return { from: `${to.slice(0, 4)}-01-01`, to };
  return { from: shift(-(Number(p) - 1)), to };
}

function Dashboard({ goTo }) {
  const [period, setPeriod] = useState('30');
  const r = useMemo(() => rangeOf(period), [period]);
  const state = useAsync(() => api.get(`/teacher/finance/dashboard${qs(r)}`), [r.from, r.to]);
  return (
    <Async state={state}>
      {(d) => {
        const k = d.kpi;
        const empty = k.sales_paid + k.pending + k.canceled === 0;
        return (
          <div className="stack">
            <div className="row between wrap" style={{ gap: 10 }}>
              <Seg ariaLabel="Período" value={period} onChange={setPeriod} options={PERIODS} />
              <span className="small muted">{fmtDate(d.period.from)} a {fmtDate(d.period.to)}</span>
            </div>
            {empty && (
              <Alert tone="info" title="Ainda não há vendas neste período.">
                Conecte o seu checkout na aba <button className="linklike" onClick={() => goTo('integracao')}>Integração</button> ou importe o histórico em <button className="linklike" onClick={() => goTo('vendas')}>Vendas</button>.
              </Alert>
            )}
            <div className="grid g4">
              <Stat label="Receita bruta" value={brl(k.gross_cents)} sub={`${n(k.sales_paid)} venda${k.sales_paid === 1 ? '' : 's'} paga${k.sales_paid === 1 ? '' : 's'}`} icon={Wallet} />
              <Stat label="Receita líquida" value={brl(k.net_cents)} sub={`após ${brl(k.refunded_cents + k.chargeback_cents)} devolvidos`} icon={Wallet} />
              <Stat label="Ticket médio" value={brl(k.ticket_cents)} sub={`${n(k.buyers)} comprador${k.buyers === 1 ? '' : 'es'}`} icon={Receipt} />
              <Stat label="Reembolsos" value={`${k.refund_rate.toLocaleString('pt-BR')}%`} sub={`${n(k.refunded)} reembolso${k.refunded === 1 ? '' : 's'} · ${n(k.chargeback)} chargeback`} icon={Undo2} />
            </div>
            <div className="grid g-main">
              <Card title="Receita por dia" subtitle="Vendas pagas, valor bruto." icon={Wallet}>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={d.series.map((s) => ({ ...s, v: s.cents / 100 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="date" {...axis} tickFormatter={(v) => `${v.slice(8)}/${v.slice(5, 7)}`} minTickGap={24} />
                    <YAxis {...axis} width={56} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR')}k` : v)} />
                    <Tooltip formatter={(v) => brl(v * 100)} labelFormatter={(v) => fmtDate(v)} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }} />
                    <Area type="monotone" dataKey="v" name="Receita" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
              <Card title="Compras recentes" icon={ShoppingBag} action={<button className="btn btn-sm" onClick={() => goTo('vendas')}>Ver todas</button>}>
                {d.recent.length === 0 ? <p className="small muted">Nenhuma compra ainda.</p> : (
                  <ul className="fin-recent">
                    {d.recent.map((s) => (
                      <li key={s.id}>
                        <div><b className="ellipsis">{s.buyer_name || s.buyer_email || 'Comprador'}</b><span className="xs muted ellipsis">{s.product || '—'} · {fmtDateTime(s.created_at)}</span></div>
                        <div className="fin-recent-v"><b>{brl(s.amount_cents)}</b><SaleBadge status={s.status} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <div className="grid g3">
              <Rank title="Por produto" rows={d.by_product} />
              <Rank title="Por forma de pagamento" rows={d.by_method} />
              <Card title="Situação das vendas" icon={Receipt}>
                <ul className="fin-status">
                  {['approved', 'pending', 'refunded', 'chargeback', 'canceled'].map((s) => (
                    <li key={s}><SaleBadge status={s} /><b>{n(k[s])}</b></li>
                  ))}
                </ul>
                <p className="xs muted mt-sm">Aprovação: {k.approval_rate.toLocaleString('pt-BR')}% das tentativas de compra do período.</p>
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}

function Rank({ title, rows }) {
  const total = rows.reduce((a, r) => a + r.cents, 0) || 1;
  return (
    <Card title={title} icon={ShoppingBag}>
      {rows.length === 0 ? <p className="small muted">Sem vendas no período.</p> : (
        <ul className="fin-rank">
          {rows.slice(0, 6).map((r) => (
            <li key={r.label}>
              <div className="row between"><span className="ellipsis small">{r.label}</span><b className="small">{brl(r.cents)}</b></div>
              <div className="fin-bar"><span style={{ width: `${Math.max(3, (r.cents / total) * 100)}%` }} /></div>
              <span className="xs muted">{n(r.sales)} venda{r.sales === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ───────────── Vendas ─────────────

function Sales() {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ status: '', q: '', from: '', to: '' });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const filt = { status: f.status, q: f.q, from: f.from, to: f.to };
  const state = useAsync(() => api.get(`/teacher/finance/sales${qs(filt)}`), [f.status, f.q, f.from, f.to]);
  return (
    <Card title="Vendas" icon={Receipt}
      action={<div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-sm" onClick={() => setAdding(true)}><Plus size={15} aria-hidden="true" />Lançar venda</button>
        <button className="btn btn-sm" onClick={() => setImporting(true)}><FileUp size={15} aria-hidden="true" />Importar planilha</button>
        <button className="btn btn-sm" onClick={() => download(`/teacher/finance/sales/export.csv${qs(filt)}`).catch((e) => toast.error(e))}><Download size={15} aria-hidden="true" />Baixar</button>
      </div>} pad={false}>
      <div className="card-pad row wrap" style={{ gap: 8 }}>
        <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); setF({ ...f, q: q.trim() }); }}>
          <div className="search-box"><Search size={15} aria-hidden="true" /><input className="input input-sm" placeholder="Buscar comprador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar comprador" /></div>
        </form>
        <select className="input input-sm" style={{ width: 'auto' }} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} aria-label="Situação">
          <option value="">Todas as situações</option>
          {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" className="input input-sm" style={{ width: 150 }} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="De" />
        <input type="date" className="input input-sm" style={{ width: 150 }} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Até" />
      </div>
      <Async state={state} compact>
        {(d) => d.sales.length === 0 ? (
          <div className="card-pad"><Empty icon={Receipt} title="Nenhuma venda encontrada">Quando o checkout enviar uma compra, ela aparece aqui. Você também pode lançar uma venda à mão ou importar uma planilha.</Empty></div>
        ) : (
          <div className="table-wrap">
            <table className="tbl clickable">
              <thead><tr><th>Data</th><th>Comprador</th><th className="hide-mobile">Produto</th><th>Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {d.sales.map((s) => (
                  <tr key={s.id} onClick={() => setSel(s.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSel(s.id)}>
                    <td className="small">{fmtDateTime(s.created_at)}</td>
                    <td><div className="bold ellipsis">{s.buyer_name || '—'}</div><div className="xs muted ellipsis">{s.buyer_email || 'sem e-mail'}</div></td>
                    <td className="hide-mobile small"><div className="ellipsis" style={{ maxWidth: 220 }}>{s.product || '—'}</div></td>
                    <td className="small bold">{brl(s.amount_cents)}</td>
                    <td><SaleBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.sales.length >= 500 && <p className="xs muted card-pad">Mostrando as 500 mais recentes. Use os filtros ou baixe a planilha completa.</p>}
          </div>
        )}
      </Async>
      {sel && <SaleDetail id={sel} onClose={() => setSel(null)} onChanged={state.reload} goStudent={(id) => nav(`/professora/alunos/${id}`)} />}
      {adding && <ManualSale onClose={() => setAdding(false)} onDone={() => { setAdding(false); state.reload(); }} />}
      {importing && <ImportSales onClose={() => setImporting(false)} onDone={state.reload} />}
    </Card>
  );
}

function SaleDetail({ id, onClose, onChanged, goStudent }) {
  const toast = useToast();
  const state = useAsync(() => api.get(`/teacher/finance/sales/${id}`), [id]);
  const [confirm, setConfirm] = useState(null);
  const change = async (status) => {
    try { await api.post(`/teacher/finance/sales/${id}/status`, { status }); toast.success('Situação atualizada.'); setConfirm(null); state.reload({ silent: true }); onChanged(); } catch (e) { toast.error(e); }
  };
  return (
    <Modal wide title="Detalhe da venda" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fechar</button>}>
      <Async state={state} compact>
        {({ sale: s, events }) => (
          <div className="stack">
            <div className="row between wrap"><div><div className="h3">{s.product || 'Sem produto'}</div><div className="muted small">{brl(s.amount_cents)}{s.installments ? ` em ${s.installments}x` : ''}{s.payment_method ? ` · ${s.payment_method}` : ''}{s.coupon ? ` · cupom ${s.coupon}` : ''}</div></div><SaleBadge status={s.status} /></div>
            <dl className="fin-dl">
              <dt>Comprador</dt><dd>{s.buyer_name || '—'}</dd>
              <dt>E-mail</dt><dd>{s.buyer_email || '—'}</dd>
              <dt>Celular</dt><dd>{s.buyer_phone || '—'}</dd>
              <dt>Origem</dt><dd>{s.source} · <span className="muted">{s.external_id}</span></dd>
              <dt>Aluno</dt><dd>{s.student_id ? <button className="linklike" onClick={() => goStudent(s.student_id)}>Abrir ficha do aluno</button> : <span className="muted">Sem aluno vinculado</span>}</dd>
              {s.access_granted_until && (<><dt>Plano concedido</dt><dd>até {fmtDate(s.access_granted_until)}</dd></>)}
            </dl>
            <div><div className="xs bold muted mb-xs">HISTÓRICO</div>
              <ul className="small fin-events">{events.map((e, i) => <li key={i}><SaleBadge status={e.status} /><span className="muted">{fmtDateTime(e.at)} · {e.origin}{e.note ? ` · ${e.note}` : ''}</span></li>)}</ul></div>
            {(s.status === 'pending' || s.status === 'approved') && (
              <div className="row wrap" style={{ gap: 8 }}>
                {s.status === 'pending' && <button className="btn btn-sm" onClick={() => setConfirm('approved')}><Check size={15} aria-hidden="true" />Marcar como paga</button>}
                {s.status === 'pending' && <button className="btn btn-sm" onClick={() => setConfirm('canceled')}><Ban size={15} aria-hidden="true" />Cancelar</button>}
                {s.status === 'approved' && <button className="btn btn-sm" onClick={() => setConfirm('refunded')}><Undo2 size={15} aria-hidden="true" />Registrar reembolso</button>}
                {s.status === 'approved' && <button className="btn btn-sm" onClick={() => setConfirm('chargeback')}><ShieldAlert size={15} aria-hidden="true" />Registrar chargeback</button>}
              </div>
            )}
            <p className="xs muted">A situação só avança: não dá para voltar uma venda reembolsada para aprovada.</p>
          </div>
        )}
      </Async>
      {confirm && <Confirm title="Mudar situação da venda" message={`Marcar esta venda como "${ST[confirm].label}"? Isso não pode ser desfeito.`} confirmLabel="Confirmar" danger={confirm !== 'approved'} onClose={() => setConfirm(null)} onConfirm={() => change(confirm)} />}
    </Modal>
  );
}

function ManualSale({ onClose, onDone }) {
  const toast = useToast();
  const products = useAsync(() => api.get('/teacher/finance/products'), []);
  const [v, setV] = useState({ buyer_name: '', buyer_email: '', buyer_phone: '', amount: '', product_id: '', status: 'approved', payment_method: '', date: '', grant_access: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const prods = products.data?.products?.filter((p) => p.active) || [];
  const chosen = prods.find((p) => p.id === v.product_id);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...v, product_id: v.product_id || null, date: v.date || undefined };
      Object.keys(body).forEach((k) => body[k] === '' && delete body[k]);
      await api.post('/teacher/finance/sales', body);
      toast.success('Venda lançada.'); onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Lançar venda" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || !v.amount || (!v.buyer_name && !v.buyer_email)} onClick={save}>{busy ? 'Salvando…' : 'Lançar'}</button></>}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Para vendas fora do checkout (Pix direto, por exemplo).</p>
        <Field label="Nome do comprador"><input className="input" value={v.buyer_name} onChange={set('buyer_name')} /></Field>
        <div className="grid g2">
          <Field label="E-mail"><input className="input" type="email" value={v.buyer_email} onChange={set('buyer_email')} /></Field>
          <Field label="Celular"><input className="input" value={v.buyer_phone} onChange={set('buyer_phone')} /></Field>
        </div>
        <div className="grid g2">
          <Field label="Produto"><select className="input" value={v.product_id} onChange={set('product_id')}><option value="">Sem produto</option>{prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Valor (R$)"><input className="input" inputMode="decimal" placeholder="1.997,00" value={v.amount} onChange={set('amount')} /></Field>
        </div>
        <div className="grid g2">
          <Field label="Situação"><select className="input" value={v.status} onChange={set('status')}>{['approved', 'pending'].map((k) => <option key={k} value={k}>{ST[k].label}</option>)}</select></Field>
          <Field label="Data da venda" hint="Vazio = hoje."><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
        </div>
        <Field label="Forma de pagamento"><input className="input" placeholder="Pix, cartão, boleto…" value={v.payment_method} onChange={set('payment_method')} /></Field>
        {chosen?.grants_access && v.status === 'approved' && v.buyer_email && (
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={v.grant_access} onChange={set('grant_access')} /><span className="small">Liberar/renovar o acesso do aluno por {chosen.plan_days} dias (cria o aluno se ainda não existir).</span></label>
        )}
        {err && <div className="error-box">{err}</div>}
      </div>
    </Modal>
  );
}

function ImportSales({ onClose, onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState(null);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const pick = async (f) => {
    setErr(null); setPreview(null); setFile(f);
    if (!f) return;
    if (f.size > 5_000_000) { setErr('Arquivo grande demais (máx. 5 MB).'); return; }
    const text = await f.text(); setCsv(text); setBusy(true);
    try { setPreview(await api.post('/teacher/finance/sales/import', { csv: text, dry_run: true })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setErr(null);
    try { setDone(await api.post('/teacher/finance/sales/import', { csv })); toast.success('Vendas importadas.'); onDone?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const r = done || preview;
  return (
    <Modal wide title={done ? 'Importação concluída' : 'Importar vendas de uma planilha'} onClose={onClose}
      footer={done ? <button className="btn btn-primary" onClick={onClose}>Concluir</button> : <><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || !preview || preview.created + preview.updated === 0} onClick={confirm}>{busy && preview ? 'Importando…' : 'Confirmar importação'}</button></>}>
      {!done && (
        <div className="stack">
          <p className="small ink2" style={{ margin: 0 }}>Exporte as vendas do seu checkout em <b>CSV</b>. Preciso das colunas <b>status</b>, <b>valor</b> e <b>nome ou e-mail</b>; ajudam: id, data, produto, celular, forma_de_pagamento e parcelas. Reimportar o mesmo arquivo não duplica. Importar histórico <b>não libera acesso</b> nem envia aviso.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
            <button className="btn" onClick={() => input.current?.click()} disabled={busy}><FileUp size={16} aria-hidden="true" />{file ? 'Trocar arquivo' : 'Escolher arquivo CSV'}</button>
            <button className="btn btn-ghost" onClick={() => download('/teacher/finance/sales/template.csv').catch((e) => toast.error(e))}><Download size={15} aria-hidden="true" />Baixar modelo</button>
            {file && <span className="small muted">{file.name}</span>}
          </div>
        </div>
      )}
      {r && (
        <div className="stack mt">
          {!done && <div className="info-box small">Prévia: nada foi gravado ainda.</div>}
          <div className="kpi-inline">
            <div><b>{n(r.created)}</b><span>{done ? 'novas' : 'serão criadas'}</span></div>
            <div><b>{n(r.updated)}</b><span>{done ? 'atualizadas' : 'serão atualizadas'}</span></div>
            <div><b>{n(r.unchanged)}</b><span>sem mudança</span></div>
            <div><b>{n(r.skipped)}</b><span>ignoradas</span></div>
            <div><b>{brl(r.revenue_cents)}</b><span>receita nova</span></div>
          </div>
          {r.errors.length > 0 && <div><div className="xs bold muted mb-xs">LINHAS IGNORADAS</div><ul className="small issue-list">{r.errors.map((e, i) => <li key={i}>Linha {e.line}: {e.reason}</li>)}</ul></div>}
        </div>
      )}
      {err && <div className="error-box mt">{err}</div>}
    </Modal>
  );
}

// ───────────── Produtos ─────────────

function Products() {
  const state = useAsync(() => api.get('/teacher/finance/products'), []);
  const [edit, setEdit] = useState(null);
  return (
    <Async state={state}>
      {(d) => {
        const review = d.products.filter((p) => p.auto_created);
        return (
          <div className="stack">
            {review.length > 0 && <Alert tone="info" title={`${review.length} produto${review.length === 1 ? '' : 's'} criado${review.length === 1 ? '' : 's'} automaticamente.`}>Chegaram do checkout. Abra cada um e defina o tipo e se a compra libera acesso à plataforma.</Alert>}
            <Card title="Produtos" icon={ShoppingBag} action={<button className="btn btn-sm btn-primary" onClick={() => setEdit({})}><Plus size={15} aria-hidden="true" />Novo produto</button>} pad={false}>
              {d.products.length === 0 ? <div className="card-pad"><Empty icon={ShoppingBag} title="Nenhum produto ainda">Cadastre seus cursos e a mentoria, ou deixe o checkout criá-los quando chegar a primeira venda.</Empty></div> : (
                <div className="table-wrap">
                  <table className="tbl clickable">
                    <thead><tr><th>Produto</th><th className="hide-mobile">Tipo</th><th>Acesso</th><th>Vendas</th><th className="hide-mobile">Receita</th></tr></thead>
                    <tbody>
                      {d.products.map((p) => (
                        <tr key={p.id} onClick={() => setEdit(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setEdit(p)}>
                          <td><div className="bold ellipsis">{p.name}{p.auto_created && <span className="eng-badge eng-attention-soft" style={{ marginLeft: 8 }}>revisar</span>}{!p.active && <span className="eng-badge eng-ended-soft" style={{ marginLeft: 8 }}>inativo</span>}</div>{p.external_ref && <div className="xs muted">código {p.external_ref}</div>}</td>
                          <td className="hide-mobile small">{KIND[p.kind]}</td>
                          <td className="small">{p.grants_access ? `Libera ${p.plan_days} dias` : <span className="muted">Só registra a venda</span>}</td>
                          <td className="small">{n(p.approved_sales)}</td>
                          <td className="hide-mobile small">{brl(p.revenue_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            {edit && <ProductModal product={edit} editais={d.editais} onClose={() => setEdit(null)} onDone={() => { setEdit(null); state.reload({ silent: true }); }} />}
          </div>
        );
      }}
    </Async>
  );
}

function ProductModal({ product: p, editais, onClose, onDone }) {
  const toast = useToast();
  const [v, setV] = useState({
    name: p.name || '', kind: p.kind || 'curso', external_ref: p.external_ref || '', price: p.price_cents != null ? String(p.price_cents / 100).replace('.', ',') : '',
    grants_access: !!p.grants_access, plan_days: p.plan_days || '', edital_id: p.edital_id || '', cohort: p.cohort || '', active: p.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const price = v.price.trim() ? Math.round(Number(v.price.replace(/\./g, '').replace(',', '.')) * 100) : null;
      if (price != null && !Number.isFinite(price)) throw new Error('Preço inválido.');
      const body = { name: v.name, kind: v.kind, external_ref: v.external_ref || null, price_cents: price, grants_access: v.grants_access, plan_days: v.grants_access ? Number(v.plan_days) || null : null, edital_id: v.grants_access ? v.edital_id || null : null, cohort: v.grants_access ? v.cohort || null : null, active: v.active };
      if (p.id) await api.put(`/teacher/finance/products/${p.id}`, body); else await api.post('/teacher/finance/products', body);
      toast.success('Produto salvo.'); onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={p.id ? 'Editar produto' : 'Novo produto'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || v.name.trim().length < 2} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="stack">
        <Field label="Nome do produto"><input className="input" value={v.name} onChange={set('name')} /></Field>
        <div className="grid g2">
          <Field label="Tipo"><select className="input" value={v.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Preço de tabela (R$)" hint="Opcional."><input className="input" inputMode="decimal" value={v.price} onChange={set('price')} /></Field>
        </div>
        <Field label="Código no checkout" hint="Opcional. Ajuda a reconhecer o produto quando o nome muda."><input className="input" value={v.external_ref} onChange={set('external_ref')} /></Field>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={v.grants_access} onChange={set('grants_access')} /><span className="small"><b>A compra libera acesso à plataforma</b> (cria o aluno e define a validade do plano)</span></label>
        {v.grants_access && (
          <div className="stack">
            <div className="grid g2">
              <Field label="Validade do plano (dias)"><input className="input" inputMode="numeric" value={v.plan_days} onChange={set('plan_days')} /></Field>
              <Field label="Turma"><input className="input" placeholder="ex.: ANVISA" value={v.cohort} onChange={set('cohort')} /></Field>
            </div>
            <Field label="Matricular no edital" hint="Opcional."><select className="input" value={v.edital_id} onChange={set('edital_id')}><option value="">Nenhum</option>{editais.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
            <p className="xs muted" style={{ margin: 0 }}>O acesso automático só funciona se estiver ligado em <b>Integração → Preferências</b>.</p>
          </div>
        )}
        {p.id && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={v.active} onChange={set('active')} /><span className="small">Produto ativo</span></label>}
        {err && <div className="error-box">{err}</div>}
      </div>
    </Modal>
  );
}

// ───────────── Integração ─────────────

function Integration() {
  const toast = useToast();
  const state = useAsync(() => api.get('/teacher/finance/integration'), []);
  const [label, setLabel] = useState('');
  const [fresh, setFresh] = useState(null);
  const [revoke, setRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try { const r = await api.post('/teacher/finance/endpoints', { label }); setFresh(r); setLabel(''); state.reload({ silent: true }); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast.success('Endereço copiado.'); } catch { toast.error('Não consegui copiar. Selecione o endereço e copie manualmente.'); } };
  const saveSettings = async (patch) => {
    try { await api.put('/teacher/finance/settings', patch); state.reload({ silent: true }); toast.success('Preferência salva.'); } catch (e) { toast.error(e); }
  };
  return (
    <Async state={state}>
      {(d) => (
        <div className="stack">
          <Card title="Receber vendas do checkout" icon={Link2} subtitle="Crie um endereço de recebimento e cole no campo “Webhook” (ou “URL de notificação”) do seu checkout. Qualquer plataforma que envie vendas por webhook funciona.">
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input" style={{ maxWidth: 320 }} placeholder="Nome (ex.: Proluno)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Nome do endereço" />
              <button className="btn btn-primary" disabled={busy || label.trim().length < 2} onClick={create}><Plus size={15} aria-hidden="true" />Criar endereço</button>
            </div>
            {fresh && (
              <div className="info-box mt">
                <b>Endereço “{fresh.label}” criado.</b> Copie e cole no checkout:
                <div className="fin-url"><code>{fresh.url}</code><button className="btn btn-sm" onClick={() => copy(fresh.url)}><Copy size={14} aria-hidden="true" />Copiar</button></div>
              </div>
            )}
            {d.endpoints.length > 0 && (
              <ul className="fin-endpoints mt">
                {d.endpoints.map((e) => (
                  <li key={e.id} className={e.revoked_at ? 'off' : ''}>
                    <div style={{ minWidth: 0 }}>
                      <b>{e.label}</b> {e.revoked_at && <span className="eng-badge eng-ended-soft">desativado</span>}
                      <div className="xs muted ellipsis">{e.url}</div>
                      <div className="xs muted">{e.last_received_at ? `Último recebimento: ${fmtDateTime(e.last_received_at)}` : 'Nada recebido ainda'} · {n(e.received)} recebido{e.received === 1 ? '' : 's'}</div>
                    </div>
                    {!e.revoked_at && <div className="row" style={{ gap: 6 }}><button className="btn btn-sm" onClick={() => copy(e.url)}><Copy size={14} aria-hidden="true" />Copiar</button><button className="btn btn-sm" onClick={() => setRevoke(e)}>Desativar</button></div>}
                  </li>
                ))}
              </ul>
            )}
            <details className="mt"><summary className="small bold">Como configurar no checkout</summary>
              <ol className="small ink2 fin-help">
                <li>Aqui, crie o endereço e clique em <b>Copiar</b>.</li>
                <li>No painel do checkout, procure <b>Integrações → Webhook</b> (ou “Notificações”, “Postback”).</li>
                <li>Cole o endereço, marque os eventos de <b>compra aprovada, reembolso, chargeback e boleto/Pix gerado</b> e salve.</li>
                <li>Faça uma compra de teste. Ela aparece em <b>Vendas</b>; se o checkout usar nomes de campo diferentes, o conteúdo fica na <b>caixa de entrada</b> abaixo e é possível reprocessar.</li>
              </ol>
            </details>
          </Card>

          <Card title="Preferências" icon={CircleCheck}>
            <div className="stack">
              <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={d.settings.auto_access} onChange={(e) => saveSettings({ auto_access: e.target.checked })} />
                <span className="small"><b>Liberar acesso automaticamente</b> quando uma compra for aprovada (só para produtos marcados como “libera acesso”). Cria o aluno, define o plano e renova se ele comprar de novo.</span></label>
              <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}><input type="checkbox" checked={d.settings.end_on_refund} onChange={(e) => saveSettings({ end_on_refund: e.target.checked })} />
                <span className="small"><b>Encerrar o plano</b> quando houver reembolso ou chargeback da compra que o liberou.</span></label>
              <NotifyEmail value={d.settings.notify_email} onSave={(v) => saveSettings({ notify_email: v })} />
            </div>
          </Card>

          <Card title="Caixa de entrada" icon={Webhook} subtitle="Tudo que o checkout enviou, inclusive o que não foi entendido." pad={false}>
            {d.inbox.length === 0 ? <div className="card-pad"><p className="small muted">Nada recebido ainda.</p></div> : (
              <ul className="fin-inbox">
                {d.inbox.map((i) => <InboxItem key={i.id} item={i} onChanged={() => state.reload({ silent: true })} />)}
              </ul>
            )}
          </Card>
          {revoke && <Confirm danger title="Desativar endereço" message={`O endereço “${revoke.label}” deixará de receber vendas. Para voltar, crie outro e atualize no checkout.`} confirmLabel="Desativar" onClose={() => setRevoke(null)} onConfirm={async () => { try { await api.post(`/teacher/finance/endpoints/${revoke.id}/revoke`); setRevoke(null); state.reload({ silent: true }); } catch (e) { toast.error(e); } }} />}
        </div>
      )}
    </Async>
  );
}

function NotifyEmail({ value, onSave }) {
  const [v, setV] = useState(value || '');
  return (
    <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
      <Field label="Avisar por e-mail a cada compra" hint="Deixe vazio para não receber. Precisa do envio de e-mail configurado no servidor."><input className="input" type="email" style={{ minWidth: 280 }} value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <button className="btn btn-sm" disabled={(value || '') === v.trim()} onClick={() => onSave(v.trim() || null)}>Salvar</button>
    </div>
  );
}

function InboxItem({ item: i, onChanged }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const tone = { processed: ['Processado', 'eng-active-soft', CircleCheck], ignored: ['Não entendido', 'eng-attention-soft', CircleDashed], error: ['Erro', 'eng-inactive-soft', ShieldAlert] }[i.result];
  const TIcon = tone[2];
  const redo = async () => {
    setBusy(true);
    try { const r = await api.post(`/teacher/finance/inbox/${i.id}/reprocess`); r.result === 'processed' ? toast.success('Reprocessado.') : toast.error(r.detail || 'Ainda não foi possível entender.'); onChanged(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  let pretty = i.payload;
  try { pretty = JSON.stringify(JSON.parse(i.payload), null, 2); } catch { /* texto */ }
  return (
    <li>
      <div className="row between wrap" style={{ gap: 8 }}>
        <div className="row" style={{ gap: 8 }}><span className={`eng-badge ${tone[1]}`}><TIcon size={13} aria-hidden="true" />{tone[0]}</span><span className="small muted">{fmtDateTime(i.received_at)} · {i.endpoint || 'endereço removido'}</span></div>
        <div className="row" style={{ gap: 6 }}>
          {i.result !== 'processed' && <button className="btn btn-sm" disabled={busy} onClick={redo}><RotateCcw size={14} aria-hidden="true" />Reprocessar</button>}
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>{open ? 'Ocultar conteúdo' : 'Ver conteúdo'}</button>
        </div>
      </div>
      {i.detail && <div className="xs muted mt-xs">{i.detail}</div>}
      {open && <pre className="fin-payload">{pretty}</pre>}
    </li>
  );
}
