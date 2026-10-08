import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine, Cell } from 'recharts';
import { STATUS, STATUSES, fmtDur, fmtPct, fmtShort, fmtDate } from '../lib/format.js';

const STATUS_VAR = { not_started: 'var(--s-red)', assimilation: 'var(--s-orange)', production: 'var(--s-yellow)', review: 'var(--s-green)', consolidated: 'var(--s-cons)' };
const axis = { stroke: 'var(--chart-grid)', tickLine: false, axisLine: false, tick: { fill: 'var(--ink-3)', fontSize: 12 } };
const hTick = (v) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}h`;

/** Eixo de horas em números redondos (0, 1h, 2h… ou 0,5h, 1h…), no máximo 5 marcas. */
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function niceHourAxis(maxHours) {
  const steps = [0.25, 0.5, 1, 2, 3, 5, 10, 20];
  const max = Math.max(maxHours || 0, 0.25);
  const step = steps.find((st) => Math.ceil(max / st) <= 4) || 20;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, domain: [0, top] };
}

function Tt({ active, payload, label, fmt, labelFmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tt">
      <div className="tt-label">{labelFmt ? labelFmt(label, payload[0].payload) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 6 }}>
          <span className="dot" style={{ background: p.color || p.fill }} />
          <span>{p.name}: <b className="num">{fmt ? fmt(p.value, p.payload) : p.value}</b></span>
        </div>
      ))}
    </div>
  );
}

/** Agrupa série diária em semanas ou meses quando o período é longo. */
export function bucketize(daily) {
  if (daily.length <= 62) return { unit: 'dia', rows: daily.map((d) => ({ ...d, label: d.date })) };
  const byMonth = daily.length > 200;
  const map = new Map();
  for (const d of daily) {
    let key;
    if (byMonth) key = d.date.slice(0, 7);
    else {
      const dt = new Date(`${d.date}T12:00:00Z`);
      const wd = (dt.getUTCDay() + 6) % 7;
      dt.setUTCDate(dt.getUTCDate() - wd);
      key = dt.toISOString().slice(0, 10);
    }
    const b = map.get(key) || { label: key, seconds: 0, questions: 0, correct: 0, days: 0 };
    b.seconds += d.seconds; b.questions += d.questions; b.correct += d.correct; b.days += d.seconds > 0 ? 1 : 0;
    map.set(key, b);
  }
  return { unit: byMonth ? 'mês' : 'semana', rows: [...map.values()].map((b) => ({ ...b, accuracy: b.questions ? (b.correct / b.questions) * 100 : null })) };
}

const labelTick = (unit) => (v) => (unit === 'mês' ? `${v.slice(5, 7)}/${v.slice(2, 4)}` : fmtShort(v));
const labelTip = (unit) => (v) => (unit === 'mês' ? `Mês ${v.slice(5, 7)}/${v.slice(0, 4)}` : unit === 'semana' ? `Semana de ${fmtDate(v)}` : fmtDate(v, { weekday: true }));

export function HoursChart({ daily, height = 220 }) {
  const { unit, rows } = bucketize(daily);
  const data = rows.map((r) => ({ ...r, hours: Math.round((r.seconds / 3600) * 100) / 100 }));
  const { ticks, domain } = niceHourAxis(Math.max(0, ...data.map((r) => r.hours)));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axis} tickFormatter={labelTick(unit)} minTickGap={16} />
        <YAxis {...axis} width={44} tickFormatter={hTick} ticks={ticks} domain={domain} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tt fmt={(_, p) => fmtDur(p.seconds)} labelFmt={labelTip(unit)} />} />
        <Bar dataKey="hours" name="Horas estudadas" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuestionsChart({ daily, height = 220 }) {
  const { unit, rows } = bucketize(daily);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axis} tickFormatter={labelTick(unit)} minTickGap={16} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tt labelFmt={labelTip(unit)} fmt={(v, p) => `${v} (${p.correct} acertos)`} />} />
        <Bar dataKey="questions" name="Questões" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AccuracyChart({ daily, threshold, height = 220 }) {
  const { unit, rows } = bucketize(daily);
  const data = rows.filter((r) => r.accuracy != null);
  if (!data.length) return <NoData>Sem questões registradas no período.</NoData>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axis} tickFormatter={labelTick(unit)} minTickGap={16} />
        <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        {threshold && <ReferenceLine y={threshold} stroke="var(--s-cons)" strokeDasharray="4 4" label={{ value: `meta >${threshold}%`, position: 'insideTopRight', fontSize: 11 }} />}
        <Tooltip content={<Tt labelFmt={labelTip(unit)} fmt={(v, p) => `${fmtPct(v)} (${p.correct}/${p.questions})`} />} />
        <Line dataKey="accuracy" name="Acertos" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ApqrProgressChart({ series, height = 220 }) {
  if (!series.length) return <NoData>Sem dados.</NoData>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="date" {...axis} tickFormatter={fmtShort} minTickGap={24} />
        <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip content={<Tt labelFmt={(v) => fmtDate(v)} fmt={(v, p) => `${fmtPct(v, 1)} · ${p.consolidated} consolidado(s)`} />} />
        <Line dataKey="progress" name="Progresso APQR" stroke="var(--s-cons)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} type="stepAfter" />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais: horas por matéria (rótulo direto, sem legenda). */
export function SubjectHoursChart({ subjects }) {
  const data = subjects.filter((s) => s.total_topics > 0).map((s) => ({ name: s.name, hours: Math.round((s.study_seconds / 3600) * 10) / 10, seconds: s.study_seconds }));
  if (!data.some((d) => d.seconds)) return <NoData>Sem horas registradas no período.</NoData>;
  const max = Math.max(...data.map((d) => d.seconds));
  return (
    <div className="stack-sm">
      {data.sort((a, b) => b.seconds - a.seconds).map((d) => (
        <div key={d.name} title={`${d.name}: ${fmtDur(d.seconds)}`}>
          <div className="row between small"><span className="ink2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span><b className="num">{fmtDur(d.seconds)}</b></div>
          <div className="progress" style={{ height: 10, marginTop: 3 }}><span style={{ width: `${max ? (d.seconds / max) * 100 : 0}%`, background: 'var(--chart-1)', borderRadius: 4 }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Progresso APQR por matéria: barras de distribuição de etapas. */
export function SubjectApqrBars({ subjects }) {
  const list = subjects.filter((s) => s.total_topics > 0);
  if (!list.length) return <NoData>Cadastre matérias e conteúdos.</NoData>;
  return (
    <div className="stack">
      {list.map((s) => (
        <div key={s.id}>
          <div className="row between small"><span className="ink2">{s.name}</span><span className="num"><b>{fmtPct(s.apqr_progress, 0)}</b> <span className="muted">· {s.counts.consolidated}/{s.total_topics} consolidados</span></span></div>
          <div className="dist mt-sm" role="img" aria-label={STATUSES.map((st) => `${STATUS[st].short}: ${s.counts[st]}`).join(', ')}>
            {STATUSES.map((st) => s.counts[st] ? <span key={st} className={`bg-${st}`} style={{ flex: s.counts[st] }} title={`${STATUS[st].short}: ${s.counts[st]}`} /> : null)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatusDonutish({ counts, total }) {
  return (
    <div className="stack-sm">
      {STATUSES.map((s) => {
        const n = counts[s] || 0;
        const p = total ? (n / total) * 100 : 0;
        return (
          <div key={s} className="row" style={{ gap: 10 }}>
            <span style={{ width: 130 }} className="small row"><span className={`dot bg-${s}`} />{STATUS[s].short}</span>
            <div className="progress" style={{ flex: 1, height: 10 }}><span style={{ width: `${p}%`, borderRadius: 4, background: STATUS_VAR[s] }} /></div>
            <span className="num small" style={{ width: 70, textAlign: 'right' }}><b>{n}</b> <span className="muted">{Math.round(p)}%</span></span>
          </div>
        );
      })}
    </div>
  );
}

export function ReviewEvolutionChart({ data, threshold, height = 200 }) {
  if (!data.length) return <NoData>Nenhuma revisão registrada ainda.</NoData>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <ReferenceLine y={threshold} stroke="var(--s-cons)" strokeDasharray="4 4" />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tt fmt={(v, p) => `${fmtPct(v)} · ${p.reviews} revisões, ${p.consolidated} consolidaram`} />} />
        <Bar dataKey="accuracy" name="Média de acertos" radius={[4, 4, 0, 0]} maxBarSize={56} label={{ position: 'top', fontSize: 12, fill: 'var(--ink-2)', formatter: (v) => fmtPct(v, 0) }}>
          {data.map((d) => <Cell key={d.number} fill="var(--s-green)" />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Calendário de dias estudados (intensidade = horas). */
export function StudyCalendar({ daily }) {
  const rows = daily.slice(-182);
  if (!rows.length) return null;
  const max = Math.max(1, ...rows.map((d) => d.seconds));
  const first = new Date(`${rows[0].date}T12:00:00Z`);
  const pad = (first.getUTCDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...rows];
  const level = (s) => (s === 0 ? 0 : s < max * 0.25 ? 1 : s < max * 0.5 ? 2 : s < max * 0.75 ? 3 : 4);
  const bg = ['var(--surface-2)', 'color-mix(in srgb, var(--chart-1) 25%, var(--surface))', 'color-mix(in srgb, var(--chart-1) 50%, var(--surface))', 'color-mix(in srgb, var(--chart-1) 75%, var(--surface))', 'var(--chart-1)'];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gridAutoColumns: '14px', gap: 3, overflowX: 'auto', paddingBottom: 4 }}>
        {cells.map((c, i) => c ? <span key={c.date} title={`${fmtDate(c.date, { weekday: true })}: ${fmtDur(c.seconds, { zero: 'sem estudo' })}`} style={{ borderRadius: 3, background: bg[level(c.seconds)] }} /> : <span key={`p${i}`} />)}
      </div>
      <div className="row xs muted mt-sm" style={{ gap: 4 }}>Menos {bg.map((b, i) => <span key={i} style={{ width: 11, height: 11, borderRadius: 3, background: b, display: 'inline-block' }} />)} Mais</div>
    </div>
  );
}

/** Calendário mensal "Dias de estudo": segunda a domingo; cor = tempo estudado; no computador mostra as horas no dia. */
export function MonthCalendar({ daily }) {
  const map = new Map(daily.map((d) => [d.date, d.seconds]));
  const last = daily.length ? daily[daily.length - 1].date : new Date().toISOString().slice(0, 10);
  const firstDate = daily.length ? daily[0].date : last;
  const [ym, setYm] = useState(last.slice(0, 7));
  const [y, m] = ym.split('-').map(Number);
  const shift = (n) => { const dt = new Date(Date.UTC(y, m - 1 + n, 1)); setYm(dt.toISOString().slice(0, 7)); };
  const monthSecs = [...map.entries()].filter(([k]) => k.startsWith(ym)).map(([, v]) => v);
  // Faixas fixas (iguais para todos): até 1h · 1–2h · 2–3h · 3h ou mais.
  const level = (s) => (!s ? 0 : s < 3600 ? 1 : s < 7200 ? 2 : s < 10800 ? 3 : 4);
  const bg = ['var(--surface)', '#dbe8f7', '#a9c8ee', '#5b8fd6', '#0b4394'];
  const LEG = ['Sem estudo', 'até 1h', '1–2h', '2–3h', '3h ou mais'];
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array(pad).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];
  const title = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const canPrev = ym > firstDate.slice(0, 7);
  const canNext = ym < last.slice(0, 7);
  const days = monthSecs.filter((v) => v > 0).length;
  return (
    <div className="month-cal">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm btn-ghost icon-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Mês anterior">‹</button>
        <b>{cap(title)}</b>
        <button className="btn btn-sm btn-ghost icon-btn" onClick={() => shift(1)} disabled={!canNext} aria-label="Próximo mês">›</button>
      </div>
      <div className="month-grid" role="grid" aria-label={`Dias de estudo de ${title}`}>
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((w, i) => <span key={`w${i}`} className="xs muted" style={{ textAlign: 'center' }}>{w}</span>)}
        {cells.map((day, i) => {
          if (!day) return <span key={`p${i}`} />;
          const date = `${ym}-${String(day).padStart(2, '0')}`;
          const secs = map.get(date) || 0;
          const lv = level(secs);
          return (
            <span key={date} className="month-day" role="gridcell" title={`${fmtDate(date, { weekday: true })}: ${fmtDur(secs, { zero: 'sem estudo' })}`} style={{ background: bg[lv], color: lv >= 3 ? '#fff' : undefined, border: lv === 0 ? '1px solid var(--border)' : undefined }}>
              <b>{day}</b>
              {secs > 0 && <span className="month-hours hide-mobile">{fmtDur(secs)}</span>}
            </span>
          );
        })}
      </div>
      <div className="row wrap xs muted mt-sm" style={{ gap: 10 }}>{bg.map((b, i) => <span key={i} className="row" style={{ gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: b, border: '1px solid var(--border)', display: 'inline-block' }} />{LEG[i]}</span>)}<span>· {days} {days === 1 ? 'dia estudado' : 'dias estudados'} no mês</span></div>
    </div>
  );
}

export function NoData({ children }) {
  return <div className="empty" style={{ padding: '28px 10px' }}><p className="small">{children}</p></div>;
}
