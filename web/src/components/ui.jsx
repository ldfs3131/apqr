import { cloneElement, isValidElement, useEffect, useId, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Inbox, OctagonAlert, TrendingDown, TrendingUp, Minus, X, Puzzle } from 'lucide-react';
import { STATUS, STATUSES, fmtPct, initials } from '../lib/format.js';

export function StatusBadge({ status, size, locked }) {
  const s = STATUS[status];
  return (
    <span className={`st st-${status} ${size === 'sm' ? 'st-sm' : ''}`} title={s.desc}>
      <span className="st-glyph" aria-hidden="true">{s.glyph}</span>
      {s.short}{locked ? ' · limite' : ''}
    </span>
  );
}

export function ApqrLegend({ compact }) {
  return (
    <div className="legend" aria-label="Legenda do método APQR">
      {STATUSES.map((s) => (
        <span key={s} className="legend-item">
          <span className={`dot bg-${s}`} aria-hidden="true" />
          {compact ? STATUS[s].short : STATUS[s].label}
        </span>
      ))}
    </div>
  );
}

/** Barra empilhada de distribuição APQR, com gaps de 2px e legenda textual. */
export function DistBar({ counts, total, large, showLegend }) {
  const t = total ?? STATUSES.reduce((a, s) => a + (counts[s] || 0), 0);
  return (
    <div>
      <div className={`dist ${large ? 'dist-lg' : ''}`} role="img" aria-label={STATUSES.map((s) => `${STATUS[s].short}: ${counts[s] || 0}`).join(', ')}>
        {t > 0 && STATUSES.map((s) => counts[s] ? <span key={s} className={`bg-${s}`} style={{ flex: counts[s] }} title={`${STATUS[s].short}: ${counts[s]}`} /> : null)}
      </div>
      {showLegend && (
        <div className="legend mt-sm small">
          {STATUSES.map((s) => (
            <span key={s} className="legend-item"><span className={`dot bg-${s}`} />{STATUS[s].short} <b className="num">{counts[s] || 0}</b></span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon, trend }) {
  return (
    <div className="card stat">
      <div className="stat-label">{Icon && (typeof Icon === 'string' ? <span aria-hidden="true">{Icon}</span> : <Icon size={15} aria-hidden="true" />)}{label}</div>
      <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><div className="stat-value">{value}</div>{trend}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** Variação vs. período anterior. `good` define se subir é bom (padrão) ou ruim. */
export function Trend({ delta, suffix = '', good = 'up', label }) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return null;
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const cls = dir === 'flat' ? 'flat' : (dir === good ? 'up' : 'down');
  const Icon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
  const txt = `${delta > 0 ? '+' : ''}${Number(delta).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${suffix}`;
  return <span className={`trend ${cls}`} title={label}><Icon size={13} aria-hidden="true" />{txt}</span>;
}

const ALERT_ICON = { info: Info, good: CheckCircle2, warning: AlertTriangle, serious: AlertTriangle, critical: OctagonAlert };
export function Alert({ tone = 'info', title, children, className = '', icon }) {
  const Icon = icon || ALERT_ICON[tone] || Info;
  return (
    <div className={`alert ${tone} ${className}`} role={tone === 'critical' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden="true" />
      <div>{title && <b>{title} </b>}{children}</div>
    </div>
  );
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <o.icon size={15} aria-hidden="true" />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size, photo }) {
  return <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} aria-hidden="true">{photo ? <img src={`/api/files/${photo}`} alt="" loading="lazy" /> : initials(name)}</span>;
}

export function Card({ title, action, children, className = '', pad = true, subtitle, icon: Icon }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            {Icon && <span className="card-ico" aria-hidden="true"><Icon size={17} /></span>}
            <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted small">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={pad ? 'card-body' : ''}>{children}</div>
    </section>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <div className="e-ico" aria-hidden="true">{typeof Icon === 'string' ? Icon : <Icon size={24} />}</div>
      {title && <h3>{title}</h3>}
      {children && <p className="small">{children}</p>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

/** Carregamento: esqueleto no formato da tela (percepção de velocidade) ou indicador simples (`compact`). */
export function Loading({ label = 'Carregando…', compact }) {
  if (compact) return <div className="center-pad" aria-busy="true"><div className="spinner" /><span className="sr-only">{label}</span></div>;
  return (
    <div className="stack sk-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="grid g4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96 }} />)}</div>
      <div className="skeleton" style={{ height: 180 }} />
      <div className="grid g2"><div className="skeleton" style={{ height: 150 }} /><div className="skeleton" style={{ height: 150 }} /></div>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="empty">
      <div className="e-ico"><AlertTriangle size={24} aria-hidden="true" /></div>
      <h3>Não foi possível carregar</h3>
      <p className="small">{error?.message}</p>
      {onRetry && <button className="btn mt" onClick={() => onRetry()}>Tentar novamente</button>}
    </div>
  );
}

/** Renderiza loading/erro/conteúdo de um useAsync. */
export function Async({ state, children, compact }) {
  if (state.loading && !state.data) return <Loading compact={compact} />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  return children(state.data);
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay modal-center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: 'min(720px,100%)' } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Confirmar', onConfirm, onClose, danger, children }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>
            {busy ? 'Salvando…' : confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="ink2">{message}</p>}
      {children}
    </Modal>
  );
}

/** Campo de formulário: associa o rótulo, a dica e o erro ao controle (acessibilidade). */
export function Field({ label, hint, children, error }) {
  const uid = useId();
  const single = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const id = single ? children.props.id || uid : undefined;
  const descId = hint || error ? `${uid}-d` : undefined;
  const control = single ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': descId }) : children;
  return (
    <div className="field">
      {label && (single ? <label htmlFor={id}>{label}</label> : <span className="field-label" id={`${uid}-l`}>{label}</span>)}
      {single ? control : <div role="group" aria-labelledby={label ? `${uid}-l` : undefined}>{control}</div>}
      {hint && !error && <span className="hint" id={descId}>{hint}</span>}
      {error && <span className="err" id={descId} role="alert">{error}</span>}
    </div>
  );
}

export function Seg({ value, onChange, options, ariaLabel }) {
  return (
    <div className="seg" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function PeriodFilter({ value, onChange }) {
  const [custom, setCustom] = useState({ from: value.from || '', to: value.to || '' });
  return (
    <div className="row wrap">
      <Seg
        ariaLabel="Período"
        value={value.period}
        onChange={(p) => onChange({ period: p })}
        options={[{ value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: '3m', label: '3 meses' }, { value: '6m', label: '6 meses' }, { value: 'all', label: 'Tudo' }, { value: 'custom', label: 'Personalizado' }]}
      />
      {value.period === 'custom' && (
        <div className="row wrap">
          <input type="date" className="input input-sm" style={{ width: 150 }} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Data inicial" />
          <span className="muted">até</span>
          <input type="date" className="input input-sm" style={{ width: 150 }} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Data final" />
          <button className="btn btn-sm" disabled={!custom.from || !custom.to} onClick={() => onChange({ period: 'custom', ...custom })}>Aplicar</button>
        </div>
      )}
    </div>
  );
}

export function periodQuery(p) {
  if (p.period === 'custom') return { from: p.from, to: p.to };
  if (p.period === 'all') return {};
  return { period: p.period };
}

/** Célula de revisão R1..R4 */
export function ReviewCell({ review, n, isNext, locked }) {
  if (review) {
    return (
      <span className={`rv done ${review.consolidated ? 'cons' : ''} ${review.extra ? 'extra' : ''}`} title={`Q/R-${n}: ${review.correct}/${review.questions} acertos${review.extra ? ' (revisão extra)' : ''}`}>
        {fmtPct(review.percent, 1)}
      </span>
    );
  }
  if (isNext) return <span className="rv next" title={`Q/R-${n} disponível`}>Q/R-{n}</span>;
  return <span className={`rv ${locked ? 'lock' : ''}`} aria-label={`Q/R-${n} não realizada`}>—</span>;
}

export function ProgressBar({ value, color }) {
  return <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>;
}

export function FutureNote({ children }) {
  return <div className="future row"><Puzzle size={15} aria-hidden="true" /><span><b>Futura funcionalidade:</b> {children}</span></div>;
}
