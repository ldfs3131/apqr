import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Activity, AlertTriangle, ChevronRight, Moon, Sparkles, Sun, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { api, qs } from '../../lib/api.js';
import { useAuth } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDate, fmtDur, fmtPct, fmtShort } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Avatar, Card, Empty } from '../../components/ui.jsx';
import { EditalSelect, SevBadge } from '../../components/teacher.jsx';
import { SaleBadge, brl } from './Finance.jsx';

/** Compras recentes e receita do mês (só a professora). */
function FinanceGlance() {
  const { user } = useAuth();
  const state = useAsync(() => (user?.role === 'mentor' ? Promise.resolve(null) : api.get('/teacher/finance/summary')), [user?.role]);
  const d = state.data;
  if (!d) return null;
  return (
    <Card title="Compras recentes" icon={Wallet} subtitle={`Receita do mês: ${brl(d.month.gross_cents)} · ${d.month.sales_paid} venda${d.month.sales_paid === 1 ? '' : 's'}`} action={<Link className="btn btn-sm" to="/professora/financeiro">Financeiro</Link>}>
      {d.recent.length === 0 ? <p className="small muted">Nenhuma compra ainda. Conecte o checkout em Financeiro → Integração.</p> : (
        <ul className="fin-recent">
          {d.recent.map((x) => (
            <li key={x.id}><div><b className="ellipsis">{x.buyer_name || x.buyer_email || 'Comprador'}</b><span className="xs muted ellipsis">{x.product || '—'} · {fmtDate(x.created_at.slice(0, 10), { year: false })}</span></div><div className="fin-recent-v"><b>{brl(x.amount_cents)}</b><SaleBadge status={x.status} /></div></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const FILTERS = [
  { id: 'all', label: 'Alunos ativos', icon: Users, test: () => true, kpi: 'students' },
  { id: 'today', label: 'Estudaram hoje', icon: Sun, test: (s, t) => s.last_activity === t, kpi: 'studied_today' },
  { id: 'week', label: 'Estudaram em 7 dias', icon: Activity, test: (s) => s.days_since_activity != null && s.days_since_activity < 7, kpi: 'studied_7d' },
  { id: 'stopped', label: 'Parados', icon: Moon, test: (s) => s.diagnostics.some((g) => g.code === 'inactive' || g.code === 'never_started'), kpi: 'inactive' },
  { id: 'attention', label: 'Precisam de atenção', icon: AlertTriangle, test: (s) => s.severity === 'critical' || s.severity === 'serious', kpi: 'attention' },
  { id: 'improving', label: 'Evoluindo', icon: TrendingUp, test: (s) => s.diagnostics.some((g) => g.code === 'improving'), kpi: 'improving' },
];
const SEV_RANK = { critical: 0, serious: 1, warning: 2, info: 3, good: 4 };
const rowKey = (s) => (s.scope === 'student' ? s.student_id : s.editais[0].enrollment_id);

export default function Central() {
  const { user } = useAuth();
  const [edital, setEdital] = useState(null);
  const state = useAsync(() => api.get(`/teacher/central${qs({ edital_id: edital })}`), [edital]);
  const first = user.name?.split(' ')[0];
  return (
    <Page title={`Olá, ${first}`} eyebrow="Central da mentoria" topbar={false}
      subtitle="Quem está estudando, quem parou e quem precisa de você — calculado a partir dos registros dos alunos."
      actions={<><EditalSelect value={edital} onChange={setEdital} allowAll /><Link className="btn btn-primary btn-sm" to="/professora/alunos?novo=1"><UserPlus size={16} aria-hidden="true" />Convidar aluno</Link></>}>
      <Async state={state}>{(d) => <CentralBody d={d} />}</Async>
    </Page>
  );
}

function CentralBody({ d }) {
  const [filter, setFilter] = useState('all');
  const nav = useNavigate();
  const f = FILTERS.find((x) => x.id === filter);
  const list = useMemo(() => d.students.filter((s) => f.test(s, d.today)).sort((a, b) => (SEV_RANK[a.severity ?? 'good'] - SEV_RANK[b.severity ?? 'good']) || a.name.localeCompare(b.name, 'pt-BR')), [d, f]);
  const attention = d.students.filter((s) => s.severity === 'critical' || s.severity === 'serious').sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const improving = d.students.filter((s) => s.diagnostics.some((g) => g.code === 'improving')).sort((a, b) => (b.evolution_pp ?? 0) - (a.evolution_pp ?? 0));
  if (!d.students.length) {
    return <div className="card"><Empty icon={Users} title="Nenhum aluno ainda" action={<Link className="btn btn-primary" to="/professora/alunos?novo=1">Convidar o primeiro aluno</Link>}>Convide seus alunos e vincule-os a um edital. Os indicadores aparecem assim que eles começarem a registrar os estudos.</Empty></div>;
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="pulse-strip" role="group" aria-label="Filtrar alunos">
        {FILTERS.map((x) => (
          <button key={x.id} className={`pulse-item ${filter === x.id ? 'on' : ''}`} onClick={() => setFilter(x.id)} aria-pressed={filter === x.id}>
            <b>{d.kpis[x.kpi]}</b>
            <span><x.icon size={14} aria-hidden="true" />{x.label}</span>
          </button>
        ))}
      </div>

      <div className="grid g-main" style={{ alignItems: 'start' }}>
        <Card title="Precisam de você agora" icon={AlertTriangle} subtitle={`Parados há ${d.inactivity_days}+ dias, que nunca começaram, com queda de frequência ou de acerto.`}>
          {attention.length === 0 ? <p className="small muted">Ninguém em situação crítica. Bom sinal.</p> : attention.slice(0, 8).map((s) => (
            <button key={rowKey(s)} className="attn" onClick={() => nav(`/professora/alunos/${s.student_id}`)} style={{ width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}>
              <Avatar name={s.name} />
              <div className="attn-main">
                <div className="row between" style={{ gap: 8 }}><span className="attn-name ellipsis">{s.name}</span><SevBadge severity={s.severity} /></div>
                <div className="attn-meta">{s.editais.map((e) => e.edital_name).join(', ')} · {s.last_activity ? `última atividade em ${fmtDate(s.last_activity, { year: false })}` : 'sem registros'}</div>
                <div className="attn-action">{s.diagnostics.filter((g) => g.severity === 'critical' || g.severity === 'serious').map((g) => g.facts).join(' ')}</div>
              </div>
              <ChevronRight size={18} aria-hidden="true" style={{ color: 'var(--ink-3)', marginTop: 8 }} />
            </button>
          ))}
          {attention.length > 8 && <button className="btn btn-ghost btn-sm mt-sm" onClick={() => setFilter('attention')}>Ver todos ({attention.length})</button>}
        </Card>
        <div className="stack">
          <FinanceGlance />
          <Card title="Alunos ativos por dia" subtitle="Últimos 14 dias">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={d.pulse} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tickFormatter={fmtShort} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} minTickGap={20} />
                <Tooltip cursor={{ fill: 'var(--surface-2)' }} formatter={(v) => [v, 'alunos']} labelFormatter={(v) => fmtDate(v, { weekday: true })} />
                <Bar dataKey="students" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
            <div className="row between small mt-sm"><span className="muted">Horas nos últimos 7 dias</span><b className="num">{fmtDur(d.kpis.hours_7d)}</b></div>
            <div className="row between small"><span className="muted">Questões em 4 semanas</span><b className="num">{d.kpis.questions_28d.toLocaleString('pt-BR')}</b></div>
          </Card>
          <Card title="Evoluindo" icon={Sparkles}>
            {improving.length === 0 ? <p className="small muted">Ninguém com avanço forte nas últimas 4 semanas.</p> : improving.slice(0, 5).map((s) => (
              <Link key={rowKey(s)} to={`/professora/alunos/${s.student_id}`} className="row between small" style={{ padding: '7px 0', borderTop: '1px solid var(--border)', color: 'inherit' }}>
                <span className="ellipsis">{s.name}</span><b className="num" style={{ color: 'var(--good)' }}>+{s.consolidated_delta} consolidados</b>
              </Link>
            ))}
          </Card>
        </div>
      </div>

      <Card title={`${f.label} · ${list.length}`} pad={false}>
        {list.length === 0 ? <div className="card-pad"><p className="small muted">Nenhum aluno neste filtro.</p></div> : (
          <div className="table-wrap">
            <table className="tbl clickable">
              <thead><tr><th>Aluno</th><th>Última atividade</th><th className="r hide-mobile">Horas 7d</th><th className="r">Consolidação</th><th className="r hide-mobile">Constância</th><th>Situação</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={rowKey(s)} onClick={() => nav(`/professora/alunos/${s.student_id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/professora/alunos/${s.student_id}`)}>
                    <td><div className="row" style={{ gap: 10 }}><Avatar name={s.name} /><div style={{ minWidth: 0 }}><div className="bold ellipsis">{s.name}</div><div className="xs muted ellipsis" title={s.editais.map((e) => e.edital_name).join(', ')}>{s.editais.length > 1 ? `${s.editais.length} editais` : s.editais[0]?.edital_name}</div></div></div></td>
                    <td className="small">{s.last_activity ? (s.days_since_activity === 0 ? 'Hoje' : s.days_since_activity === 1 ? 'Ontem' : `Há ${s.days_since_activity} dias`) : <span className="muted">Nunca</span>}</td>
                    <td className="r num hide-mobile">{fmtDur(s.study_seconds_7, { zero: '—' })}</td>
                    <td className="r num">{s.editais.map((e) => <div key={e.enrollment_id} title={e.edital_name}>{s.editais.length > 1 && <span className="xs muted" style={{ marginRight: 6 }}>{e.edital_name.slice(0, 18)}{e.edital_name.length > 18 ? '…' : ''}</span>}{fmtPct(e.consolidation_pct, 1)}</div>)}</td>
                    <td className="r num hide-mobile">{s.constancy ?? <span className="muted xs">novo</span>}</td>
                    <td style={{ minWidth: 190 }}><div className="row wrap" style={{ gap: 4 }}>{s.diagnostics.slice(0, 2).map((g) => <SevBadge key={g.code} severity={g.severity} label={g.title} />)}{!s.diagnostics.length && <span className="muted xs">—</span>}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="xs muted">
        {d.scope === 'student'
          ? 'Visão por aluno: última atividade, horas, questões e constância somam todos os editais do aluno; a consolidação aparece separada por edital. '
          : 'Visão do edital selecionado: todos os números usam só os registros deste edital. '}
        Calculado com os registros até {fmtDate(d.today)}. “Parado” usa o limite de {d.inactivity_days} dias definido nas configurações do método.
      </p>
    </div>
  );
}
