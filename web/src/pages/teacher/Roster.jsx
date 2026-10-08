import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import { AlarmClock, CircleCheck, CircleDashed, CircleAlert, Download, FileUp, History, Search, UserX, Users, CircleOff } from 'lucide-react';
import { api, download, qs } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate } from '../../lib/format.js';
import { Async, Card, Empty, Modal, Seg } from '../../components/ui.jsx';

/**
 * Base de alunos: plano (ativo/encerrado, vencimento), último acesso e engajamento.
 * Cores de engajamento são estados (sempre com ícone e rótulo, nunca só a cor).
 */
export const ENG = {
  active: { label: 'Ativo', hint: 'acesso nos últimos 7 dias', icon: CircleCheck, cls: 'eng-active' },
  attention: { label: 'Atenção', hint: '8 a 30 dias sem acesso', icon: CircleAlert, cls: 'eng-attention' },
  inactive: { label: 'Inativo', hint: 'mais de 30 dias sem acesso', icon: UserX, cls: 'eng-inactive' },
  never: { label: 'Nunca acessou', hint: 'sem registro de acesso', icon: CircleDashed, cls: 'eng-never' },
  ended: { label: 'Encerrado', hint: 'plano encerrado', icon: CircleOff, cls: 'eng-ended' },
};
const SEG_ORDER = ['active', 'attention', 'inactive', 'never'];
const monthLabel = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
const n = (v) => Number(v || 0).toLocaleString('pt-BR');
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Mesmas regras do servidor (domain/roster.js → filterRoster), para contar e listar sem nova consulta. */
export function applyFilter(rows, f) {
  const q = norm(f.q);
  return rows.filter((r) => {
    if (f.plan && f.plan !== 'all' && r.plan !== f.plan) return false;
    if (f.cohort && r.cohort !== f.cohort) return false;
    if (f.engagement && f.engagement !== 'all' && r.engagement !== f.engagement) return false;
    if (f.no_access_over != null && f.no_access_over !== '' && !(r.days_since_access == null || r.days_since_access > Number(f.no_access_over))) return false;
    if (f.expiring_within != null && f.expiring_within !== '' && !(r.plan === 'active' && r.days_to_end != null && r.days_to_end >= 0 && r.days_to_end <= Number(f.expiring_within))) return false;
    if (f.ended_within != null && f.ended_within !== '' && !(r.plan === 'ended' && r.days_to_end != null && r.days_to_end < 0 && -r.days_to_end <= Number(f.ended_within))) return false;
    if (q && !norm(`${r.name} ${r.email} ${r.phone || ''}`).includes(q)) return false;
    return true;
  });
}

/** Listas prontas para baixar (monitoramento e recuperação de vendas). */
const QUICK = [
  { group: 'Monitoramento', items: [
    { id: 'ativos', label: 'Planos ativos', f: { plan: 'active' } },
    { id: 'sem7', label: 'Sem acesso há mais de 7 dias', f: { plan: 'active', no_access_over: 7 } },
    { id: 'sem15', label: 'Sem acesso há mais de 15 dias', f: { plan: 'active', no_access_over: 15 } },
    { id: 'sem30', label: 'Sem acesso há mais de 30 dias', f: { plan: 'active', no_access_over: 30 } },
  ] },
  { group: 'Renovação', items: [
    { id: 'vence7', label: 'Vencem em até 7 dias', f: { plan: 'active', expiring_within: 7 } },
    { id: 'vence15', label: 'Vencem em até 15 dias', f: { plan: 'active', expiring_within: 15 } },
    { id: 'vence30', label: 'Vencem em até 30 dias', f: { plan: 'active', expiring_within: 30 } },
  ] },
  { group: 'Recuperação de vendas', items: [
    { id: 'enc90', label: 'Encerrados nos últimos 90 dias', f: { plan: 'ended', ended_within: 90 } },
    { id: 'enc365', label: 'Encerrados no último ano', f: { plan: 'ended', ended_within: 365 } },
    { id: 'exalunos', label: 'Todos os ex-alunos', f: { plan: 'ended' } },
  ] },
];

const ACCESS_OPTS = [
  { value: '', label: 'Qualquer acesso' },
  { value: 'eng:active', label: 'Acessando (até 7 dias)' },
  { value: 'over:7', label: 'Sem acesso há mais de 7 dias' },
  { value: 'over:15', label: 'Sem acesso há mais de 15 dias' },
  { value: 'over:30', label: 'Sem acesso há mais de 30 dias' },
  { value: 'eng:never', label: 'Nunca acessou' },
];
const PLAN_OPTS = [
  { value: '', label: 'Qualquer vencimento' },
  { value: 'exp:7', label: 'Vence em até 7 dias' },
  { value: 'exp:15', label: 'Vence em até 15 dias' },
  { value: 'exp:30', label: 'Vence em até 30 dias' },
  { value: 'exp:60', label: 'Vence em até 60 dias' },
  { value: 'end:30', label: 'Encerrou nos últimos 30 dias' },
  { value: 'end:90', label: 'Encerrou nos últimos 90 dias' },
];

export default function Roster() {
  const state = useAsync(() => api.get('/teacher/roster'), []);
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  return (
    <>
      <Async state={state}>
        {(d) => d.students.length === 0 ? (
          <div className="card"><Empty icon={Users} title="Nenhum aluno na base" action={user.role === 'teacher' && <button className="btn btn-primary" onClick={() => setImporting(true)}><FileUp size={16} aria-hidden="true" />Importar base de alunos</button>}>
            Importe a lista de alunos da plataforma anterior (planilha CSV) para acompanhar planos, vencimentos e engajamento.
          </Empty></div>
        ) : <RosterBody d={d} onImport={user.role === 'teacher' ? () => setImporting(true) : null} />}
      </Async>
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={() => state.reload({ silent: true })} />}
    </>
  );
}

function RosterBody({ d, onImport }) {
  const toast = useToast();
  const k = d.kpis;
  const rows = d.students;
  const get = async (f, name) => {
    try { await download(`/teacher/roster/export.csv${qs({ ...f, name })}`); } catch (e) { toast.error(e); }
  };
  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 10 }}>
        <p className="small muted" style={{ margin: 0 }}>Situação em {fmtDate(d.today)}. Engajamento pelo último acesso: ao entrar na plataforma ou registrar estudo (para quem veio da plataforma anterior, vale também o último login de lá).</p>
        {onImport && <button className="btn btn-sm" onClick={onImport}><FileUp size={15} aria-hidden="true" />Importar ou atualizar base</button>}
      </div>

      <div className="grid g3 roster-kpis">
        <Kpi label="Cadastros na base" value={k.total} sub={`${n(k.active)} com plano ativo · ${n(k.ended)} encerrados`} icon={Users} />
        <Kpi label="Acessando (até 7 dias)" value={k.engaged} sub={`${pctOf(k.engaged, k.active)} dos planos ativos`} eng="active" />
        <Kpi label="Atenção (8 a 30 dias)" value={k.attention} sub="sem acesso há mais de uma semana" eng="attention" />
        <Kpi label="Inativos (mais de 30 dias)" value={k.inactive + k.never} sub={k.never ? `inclui ${n(k.never)} que nunca acessou` : 'planos ativos sem acesso'} eng="inactive" />
        <Kpi label="Vencem em 30 dias" value={k.expiring_30} sub={`${n(k.expiring_7)} em até 7 dias · ${n(k.expiring_15)} em até 15`} icon={AlarmClock} tone="brand" />
        <Kpi label="Encerrados em 90 dias" value={k.ended_90} sub="público para recuperação de venda" icon={History} />
      </div>

      <div className="grid g-main">
        <Card title="Planos ativos por turma" subtitle="Engajamento dos alunos com plano ativo em cada turma. Passe o mouse para ver os números." icon={Users}>
          <EngagementLegend />
          <CohortBars cohorts={d.cohorts} />
        </Card>
        <div className="stack">
          <Card title="Engajamento dos planos ativos" icon={CircleCheck}>
            <StackBar parts={SEG_ORDER.map((s) => ({ key: s, value: s === 'active' ? k.engaged : k[s] }))} total={k.active} big />
            <div className="stack-sm mt">
              {SEG_ORDER.map((s) => <LegendRow key={s} eng={s} value={s === 'active' ? k.engaged : k[s]} total={k.active} />)}
            </div>
          </Card>
          <Card title="Baixar listas" subtitle="Planilha (abre no Excel) com nome, e-mail, celular, turma, plano e último acesso." icon={Download}>
            <div className="stack">
              {QUICK.map((g) => (
                <div key={g.group}>
                  <div className="xs muted bold mb-xs">{g.group.toUpperCase()}</div>
                  <div className="stack-xs">
                    {g.items.map((it) => {
                      const count = applyFilter(rows, it.f).length;
                      return (
                        <button key={it.id} className="dl-row" disabled={!count} onClick={() => get(it.f, it.label)}>
                          <span>{it.label}</span>
                          <span className="row" style={{ gap: 8 }}><b className="num">{n(count)}</b><Download size={15} aria-hidden="true" /></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid g2">
        <Card title="Vencimentos nos próximos 6 meses" subtitle="Planos ativos que terminam em cada mês." icon={AlarmClock}>
          <MonthBars data={d.expirations.map((e) => ({ label: monthLabel(e.month), value: e.students }))} unit="planos vencem" />
        </Card>
        <Card title="Histórico da base" subtitle="Alunos que passaram pela mentoria, pelo ano em que o plano terminou." icon={History}>
          <MonthBars data={d.ended_by_year.map((e) => ({ label: e.year, value: e.students }))} unit="planos encerrados" muted />
        </Card>
      </div>

      <RosterTable rows={rows} cohorts={d.cohorts} onDownload={get} />
    </div>
  );
}

const pctOf = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '0%');

function Kpi({ label, value, sub, icon: Icon, eng, tone }) {
  const E = eng ? ENG[eng] : null;
  const I = E ? E.icon : Icon;
  return (
    <div className={`card stat ${tone === 'brand' ? 'stat-brand' : ''}`}>
      <div className="stat-label">{I && <I size={15} aria-hidden="true" className={E ? `${E.cls}-ink` : ''} />}{label}</div>
      <div className="stat-value">{n(value)}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function EngagementLegend() {
  return (
    <div className="row wrap small mb" style={{ gap: 14 }} aria-label="Legenda">
      {[...SEG_ORDER, 'ended'].map((s) => {
        const E = ENG[s];
        return <span key={s} className="row" style={{ gap: 6 }}><span className={`sw ${E.cls}`} aria-hidden="true" />{E.label}</span>;
      })}
    </div>
  );
}

function LegendRow({ eng, value, total }) {
  const E = ENG[eng];
  return (
    <div className="row between small">
      <span className="row" style={{ gap: 8 }}><span className={`sw ${E.cls}`} aria-hidden="true" /><span><b>{E.label}</b> <span className="muted">· {E.hint}</span></span></span>
      <span className="num"><b>{n(value)}</b> <span className="muted">({pctOf(value, total)})</span></span>
    </div>
  );
}

/** Barra empilhada horizontal com 2px de separação entre segmentos; título com os números (acessível). */
function StackBar({ parts, total, big, scaleMax }) {
  const max = scaleMax || total || 1;
  const visible = parts.filter((p) => p.value > 0);
  const title = parts.map((p) => `${ENG[p.key].label}: ${p.value}`).join(' · ');
  return (
    <div className={`stackbar ${big ? 'big' : ''}`} role="img" aria-label={title} title={title} style={{ width: `${Math.max(2, (total / max) * 100)}%` }}>
      {visible.map((p) => <span key={p.key} className={ENG[p.key].cls} style={{ flexGrow: p.value }} />)}
    </div>
  );
}

function CohortBars({ cohorts }) {
  const [all, setAll] = useState(false);
  const withActive = cohorts.filter((c) => c.active > 0);
  const list = all ? cohorts : withActive;
  const max = Math.max(1, ...list.map((c) => (all ? c.total : c.active)));
  return (
    <div className="stack-sm">
      {list.map((c) => {
        const parts = [
          { key: 'active', value: c.engaged }, { key: 'attention', value: c.attention },
          { key: 'inactive', value: c.inactive }, { key: 'never', value: c.never },
          ...(all ? [{ key: 'ended', value: c.ended }] : []),
        ];
        const total = all ? c.total : c.active;
        return (
          <div key={c.cohort} className="cohort-row">
            <div className="cohort-name small ellipsis" title={c.cohort}>{c.cohort}</div>
            <div className="cohort-bar"><StackBar parts={parts} total={total} scaleMax={max} /></div>
            <div className="cohort-num small num">
              <b>{n(c.active)}</b> <span className="muted">ativos{all ? ` · ${n(c.total)} no total` : ''}</span>
              {!all && c.active > 0 && <span className="cohort-detail muted xs"> · {c.engaged} ok · {c.attention} atenção · {c.inactive + c.never} inativos</span>}
            </div>
          </div>
        );
      })}
      {list.length === 0 && <p className="small muted">Nenhuma turma com plano ativo.</p>}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll(!all)}>
        {all ? 'Mostrar só turmas com plano ativo' : `Mostrar todas as ${cohorts.length} turmas (com ex-alunos)`}
      </button>
    </div>
  );
}

function MonthBars({ data, unit, muted }) {
  if (!data.length || data.every((x) => !x.value)) return <p className="small muted">Sem dados.</p>;
  return (
    <div style={{ height: 210 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 12 }} interval={0} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} width={44} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} formatter={(v) => [n(v), unit]} />
          <Bar dataKey="value" fill={muted ? 'var(--chart-muted)' : 'var(--chart-1)'} radius={[4, 4, 0, 0]} maxBarSize={44}>
            <LabelList dataKey="value" position="top" style={{ fill: 'var(--ink-2)', fontSize: 12, fontWeight: 700 }} formatter={(v) => (v ? n(v) : '')} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RosterTable({ rows, cohorts, onDownload }) {
  const nav = useNavigate();
  const [plan, setPlan] = useState('active');
  const [q, setQ] = useState('');
  const [cohort, setCohort] = useState('');
  const [access, setAccess] = useState('');
  const [venc, setVenc] = useState('');
  const [limit, setLimit] = useState(100);
  const f = useMemo(() => {
    const o = { plan, q, cohort };
    if (access.startsWith('eng:')) o.engagement = access.slice(4);
    if (access.startsWith('over:')) o.no_access_over = Number(access.slice(5));
    if (venc.startsWith('exp:')) { o.expiring_within = Number(venc.slice(4)); o.plan = 'active'; }
    if (venc.startsWith('end:')) { o.ended_within = Number(venc.slice(4)); o.plan = 'ended'; }
    return o;
  }, [plan, q, cohort, access, venc]);
  const list = useMemo(() => applyFilter(rows, f), [rows, f]);
  const count = (p) => (p === 'all' ? rows.length : rows.filter((r) => r.plan === p).length);
  return (
    <Card pad={false} title="Lista de alunos" subtitle="Filtre e baixe exatamente a lista que aparece na tela." icon={Users}
      action={<button className="btn btn-sm btn-primary" disabled={!list.length} onClick={() => onDownload(f, 'lista-alunos')}><Download size={15} aria-hidden="true" />Baixar esta lista ({n(list.length)})</button>}>
      <div className="card-pad row wrap" style={{ gap: 10, paddingTop: 0 }}>
        <Seg value={plan} onChange={(v) => { setPlan(v); setVenc(''); }} ariaLabel="Plano" options={[
          { value: 'active', label: `Plano ativo (${n(count('active'))})` }, { value: 'ended', label: `Encerrados (${n(count('ended'))})` }, { value: 'all', label: `Todos (${n(count('all'))})` },
        ]} />
        <div className="row" style={{ flex: '1 1 220px', gap: 6 }}>
          <Search size={16} aria-hidden="true" style={{ color: 'var(--ink-3)' }} />
          <input className="input input-sm" placeholder="Buscar nome, e-mail ou celular" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar aluno" />
        </div>
        <select className="input input-sm" style={{ width: 'auto', maxWidth: 240 }} value={cohort} onChange={(e) => setCohort(e.target.value)} aria-label="Turma">
          <option value="">Todas as turmas</option>
          {cohorts.map((c) => <option key={c.cohort} value={c.cohort}>{c.cohort} ({c.total})</option>)}
        </select>
        <select className="input input-sm" style={{ width: 'auto' }} value={access} onChange={(e) => setAccess(e.target.value)} aria-label="Último acesso">
          {ACCESS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input input-sm" style={{ width: 'auto' }} value={venc} onChange={(e) => setVenc(e.target.value)} aria-label="Vencimento">
          {PLAN_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table className="tbl clickable">
          <thead><tr><th>Aluno</th><th className="hide-mobile">Turma</th><th>Plano</th><th>Último acesso</th><th>Engajamento</th></tr></thead>
          <tbody>
            {list.slice(0, limit).map((r) => {
              return (
                <tr key={r.id} onClick={() => nav(`/professora/alunos/${r.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/professora/alunos/${r.id}`)}>
                  <td><div style={{ minWidth: 0 }}><div className="bold ellipsis">{r.name}</div><div className="xs muted ellipsis">{r.email}{r.phone ? ` · ${fmtPhone(r.phone)}` : ''}</div></div></td>
                  <td className="hide-mobile small"><div className="ellipsis" style={{ maxWidth: 220 }}>{r.cohort}</div>{r.legacy_class && r.legacy_class !== r.cohort && <div className="xs muted ellipsis" style={{ maxWidth: 220 }}>{r.legacy_class}</div>}</td>
                  <td className="small">{r.plan_end ? fmtDate(r.plan_end) : <span className="muted">Sem data</span>}<div className="xs"><PlanNote r={r} /></div></td>
                  <td className="small">{r.last_access ? fmtDate(r.last_access) : <span className="muted">Nunca</span>}{r.days_since_access != null && <div className="xs muted">{r.days_since_access === 0 ? 'hoje' : `há ${n(r.days_since_access)} dia${r.days_since_access === 1 ? '' : 's'}`}</div>}</td>
                  <td><EngBadge eng={r.plan === 'ended' ? 'ended' : r.engagement} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <div className="card-pad"><p className="small muted">Nenhum aluno com esses filtros.</p></div>}
      {list.length > limit && <div className="card-pad"><button className="btn btn-sm" onClick={() => setLimit(limit + 200)}>Mostrar mais ({n(list.length - limit)} restantes)</button></div>}
    </Card>
  );
}

function PlanNote({ r }) {
  if (r.plan === 'ended') return <span className="muted">Encerrado</span>;
  if (r.days_to_end == null) return <span className="muted">Ativo, sem data de fim</span>;
  if (r.days_to_end === 0) return <span className="eng-attention-ink bold">Vence hoje</span>;
  if (r.days_to_end <= 30) return <span className="eng-attention-ink bold">Vence em {r.days_to_end} dia{r.days_to_end === 1 ? '' : 's'}</span>;
  return <span className="muted">Ativo · {r.days_to_end} dias</span>;
}

export function EngBadge({ eng }) {
  const E = ENG[eng];
  if (!E) return null;
  return <span className={`eng-badge ${E.cls}-soft`}><E.icon size={13} aria-hidden="true" />{E.label}</span>;
}

const fmtPhone = (p) => (p?.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p?.length === 10 ? `(${p.slice(0, 2)}) ${p.slice(2, 6)}-${p.slice(6)}` : p);

function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const pick = async (f) => {
    setErr(null); setPreview(null); setFile(f);
    if (!f) return;
    if (f.size > 5_000_000) { setErr('Arquivo grande demais (máx. 5 MB).'); return; }
    const text = await f.text();
    setCsv(text);
    setBusy(true);
    try { setPreview(await api.post('/teacher/roster/import', { csv: text, dry_run: true })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.post('/teacher/roster/import', { csv });
      setDone(r);
      toast.success('Base importada.');
      onDone?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const result = done || preview;
  return (
    <Modal wide title={done ? 'Importação concluída' : 'Importar base de alunos'} onClose={onClose}
      footer={done ? <button className="btn btn-primary" onClick={onClose}>Concluir</button> : (
        <><button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={busy || !preview || (preview.created + preview.updated === 0)} onClick={confirm}>{busy && preview ? 'Importando…' : preview ? `Confirmar importação (${n(preview.created + preview.updated)})` : 'Confirmar importação'}</button></>
      )}>
      {!done && (
        <div className="stack">
          <p className="ink2 small" style={{ margin: 0 }}>Envie uma planilha <b>CSV</b> com as colunas <b>nome</b> e <b>email</b> (obrigatórias) e, se tiver: celular, cpf, turma, turma_original, ultimo_login, fim_do_plano e situacao (ativo/encerrado).
            O e-mail identifica o aluno: importar de novo <b>atualiza</b> turma, plano e último acesso, sem duplicar. Alunos novos entram com cadastro pendente; o convite de acesso você gera quando quiser.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
            <button className="btn" onClick={() => input.current?.click()} disabled={busy}><FileUp size={16} aria-hidden="true" />{file ? 'Trocar arquivo' : 'Escolher arquivo CSV'}</button>
            <button className="btn btn-ghost" onClick={() => download('/teacher/roster/template.csv').catch((e) => toast.error(e))}><Download size={15} aria-hidden="true" />Baixar modelo</button>
            {file && <span className="small muted">{file.name}</span>}
          </div>
          {busy && !preview && <p className="small muted">Conferindo o arquivo…</p>}
        </div>
      )}
      {result && (
        <div className="stack mt">
          {!done && <div className="info-box small">Prévia: nada foi gravado ainda. Confira e confirme.</div>}
          <div className="kpi-inline">
            <div><b>{n(result.created)}</b><span>{done ? 'novos' : 'serão criados'}</span></div>
            <div><b>{n(result.updated)}</b><span>{done ? 'atualizados' : 'serão atualizados'}</span></div>
            <div><b>{n(result.skipped)}</b><span>ignorados</span></div>
            <div><b>{n(result.active)}</b><span>planos ativos</span></div>
            <div><b>{n(result.ended)}</b><span>encerrados</span></div>
            <div><b>{n(result.cohorts)}</b><span>turmas</span></div>
          </div>
          {result.errors.length > 0 && (
            <div><div className="xs bold muted mb-xs">LINHAS IGNORADAS</div>
              <ul className="small issue-list">{result.errors.map((e) => <li key={`e${e.line}`}>Linha {e.line}{e.email ? ` (${e.email})` : ''}: {e.reason}</li>)}</ul></div>
          )}
          {result.warnings.length > 0 && (
            <div><div className="xs bold muted mb-xs">AVISOS ({n(result.warnings_total)})</div>
              <ul className="small issue-list">{result.warnings.map((w) => <li key={`w${w.line}`}>Linha {w.line}{w.email ? ` (${w.email})` : ''}: {w.reason}</li>)}</ul></div>
          )}
        </div>
      )}
      {err && <div className="error-box mt">{err}</div>}
    </Modal>
  );
}
