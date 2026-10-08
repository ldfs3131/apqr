import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Copy, Info, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useToast } from '../lib/store.jsx';

/** Severidade do diagnóstico → rótulo, classe visual e ícone. Nunca só cor: sempre ícone + texto. */
export const SEV = {
  critical: { label: 'Crítico', cls: 'high', icon: AlertOctagon },
  serious: { label: 'Atenção', cls: 'medium', icon: AlertTriangle },
  warning: { label: 'Observar', cls: 'low', icon: AlertTriangle },
  info: { label: 'Info', cls: 'info', icon: Info },
  good: { label: 'Positivo', cls: 'positive', icon: CheckCircle2 },
};

export function SevBadge({ severity, label }) {
  const s = SEV[severity] || SEV.info;
  return <span className={`sev ${s.cls}`}><s.icon size={14} aria-hidden="true" />{label || s.label}</span>;
}

/** Lista de diagnósticos com fatos (números) e ação sugerida à professora. */
export function DiagnosticList({ items, compact }) {
  if (!items?.length) return <p className="small muted">Nenhum ponto de atenção no momento.</p>;
  return (
    <div className="stack-sm">
      {items.map((g) => (
        <div key={g.code} className={`alert ${g.severity === 'good' ? 'good' : g.severity === 'critical' ? 'critical' : g.severity === 'serious' ? 'serious' : g.severity === 'warning' ? 'warning' : 'info'}`}>
          {(() => { const I = g.severity === 'good' ? TrendingUp : (SEV[g.severity] || SEV.info).icon; return <I size={17} aria-hidden="true" />; })()}
          <div>
            <b>{g.title}.</b> {g.facts}
            {!compact && g.action && <div className="xs" style={{ opacity: 0.85, marginTop: 2 }}>Sugestão: {g.action}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Caixa com um link sensível (convite/senha) para copiar e enviar ao aluno. */
export function LinkBox({ url, note }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack-sm">
      <div className="row" style={{ gap: 6 }}>
        <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
        <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); toast.success('Link copiado.'); } catch { toast.info('Selecione o link e copie manualmente.'); } }}>
          <Copy size={15} aria-hidden="true" />{copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {note && <p className="xs muted">{note}</p>}
    </div>
  );
}

/** Seletor de edital da professora. `allowAll` inclui a opção "Todos os editais". */
export function EditalSelect({ value, onChange, allowAll, className = '' }) {
  const st = useAsync(() => api.get('/teacher/editais'), []);
  const list = st.data?.editais || [];
  return (
    <select className={`select input-sm ${className}`} style={{ width: "auto", maxWidth: 320 }} value={value || ''} onChange={(e) => onChange(e.target.value || null)} aria-label="Edital" disabled={st.loading}>
      {allowAll && <option value="">Todos os editais</option>}
      {!allowAll && !value && <option value="">Selecione o edital</option>}
      {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
  );
}

export const useEditais = () => useAsync(() => api.get('/teacher/editais'), []);

/** Mini gráfico de barras das 4 semanas de constância (dias ativos por semana, teto 5). */
export function WeekBars({ weeks, max = 5 }) {
  if (!weeks?.length) return null;
  return (
    <span className="row" style={{ gap: 3, alignItems: 'flex-end', height: 22 }} role="img" aria-label={`Dias ativos por semana: ${weeks.map((w) => w.active_days).join(', ')}`}>
      {weeks.map((w) => (
        <span key={w.start} title={`${w.active_days} dia(s) ativos`} style={{ width: 8, height: `${Math.max(3, (Math.min(w.active_days, max) / max) * 22)}px`, borderRadius: 2, background: w.counted ? 'var(--accent)' : 'var(--border)', opacity: w.counted ? 1 : 0.5 }} />
      ))}
    </span>
  );
}
