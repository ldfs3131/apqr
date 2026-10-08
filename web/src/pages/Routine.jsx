import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useExam, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { CATEGORIES, WEEKDAYS, WEEKDAYS_SHORT, fmtDur, hhmmToMin, minToHHMM, todayLocal } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Confirm, Empty, Field, Modal } from '../components/ui.jsx';

export default function Routine() {
  const { examId } = useExam();
  const { version } = useData();
  const state = useAsync(() => api.get('/me/routine'), [version]);
  const actual = useAsync(() => (examId ? api.get(`/enrollments/${examId}/analytics?period=7d`) : Promise.resolve(null)), [examId, version]);
  return (
    <Page title="Mapa de Rotinas" eyebrow="Sua semana" subtitle="Organize sua semana e veja seus horários disponíveis para estudo. Não é um cronograma obrigatório.">
      <Async state={state}>{({ routine }) => <RoutineEditor routine={routine} actual={actual.data} onSaved={() => state.reload({ silent: true })} />}</Async>
    </Page>
  );
}

const TEMPLATE = (() => {
  const b = [];
  for (let d = 0; d < 5; d++) {
    b.push({ weekday: d, start_min: 360, end_min: 420, category: 'alimentacao', label: 'Café' });
    b.push({ weekday: d, start_min: 420, end_min: 480, category: 'deslocamento', label: null });
    b.push({ weekday: d, start_min: 480, end_min: 1020, category: 'trabalho', label: null });
    b.push({ weekday: d, start_min: 1020, end_min: 1080, category: 'deslocamento', label: null });
    b.push({ weekday: d, start_min: 1140, end_min: 1260, category: 'estudo', label: null });
  }
  b.push({ weekday: 5, start_min: 480, end_min: 660, category: 'estudo', label: null });
  b.push({ weekday: 6, start_min: 540, end_min: 660, category: 'estudo', label: null });
  return b;
})();

export function RoutineEditor({ routine, actual, onSaved, readOnly, compact }) {
  const toast = useToast();
  const { bump } = useData();
  const [edit, setEdit] = useState(null);
  const [clear, setClear] = useState(false);
  const blocks = routine.blocks;
  const save = async (next, msg = 'Rotina atualizada.') => {
    try {
      await api.put('/me/routine', { blocks: next.map(({ weekday, start_min, end_min, category, label }) => ({ weekday, start_min, end_min, category, label: label || null })) });
      toast.success(msg); bump(); onSaved?.();
      return true;
    } catch (e) { toast.error(e); return false; }
  };
  const minH = Math.min(6, ...blocks.map((b) => Math.floor(b.start_min / 60)));
  const maxH = Math.max(23, ...blocks.map((b) => Math.ceil(b.end_min / 60)));
  const PX = 34;
  const actualByWd = Array(7).fill(0);
  if (actual) for (const d of actual.daily) actualByWd[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7] += d.seconds;
  const todayWd = (new Date(`${todayLocal()}T12:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid g-main">
        <Card title="Carga horária potencial de estudo" subtitle="Soma dos blocos de ESTUDO da sua semana.">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6 }}>
            {WEEKDAYS_SHORT.map((d, i) => (
              <div key={d} style={{ textAlign: 'center' }} className={i === todayWd ? 'bold' : ''}>
                <div className="xs muted">{d}</div>
                <div className="num bold" style={{ fontSize: 15 }}>{fmtDur(routine.study_minutes_per_day[i] * 60, { zero: '—' })}</div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="row between"><span className="ink2">Total potencial na semana</span><b className="num" style={{ fontSize: 22 }}>{fmtDur(routine.weekly_study_minutes * 60, { zero: '0h' })}</b></div>
        </Card>
        {actual && !compact && (
          <Card title="Disponível × estudado (últimos 7 dias)" subtitle="Comparação para você enxergar sua semana — não é cobrança.">
            <div className="stack-sm">
              {WEEKDAYS_SHORT.map((d, i) => {
                const plan = routine.study_minutes_per_day[i] * 60;
                const done = actualByWd[i];
                const max = Math.max(plan, done, 1);
                return (
                  <div key={d} className="row" style={{ gap: 8 }}>
                    <span className="xs muted" style={{ width: 28 }}>{d}</span>
                    <div style={{ flex: 1 }}>
                      <div className="progress" style={{ height: 6, background: 'transparent' }}><span style={{ width: `${(plan / max) * 100}%`, background: 'var(--surface-3)' }} /></div>
                      <div className="progress" style={{ height: 6, marginTop: 2, background: 'transparent' }}><span style={{ width: `${(done / max) * 100}%`, background: 'var(--chart-1)' }} /></div>
                    </div>
                    <span className="xs num" style={{ width: 90, textAlign: 'right' }}>{fmtDur(done, { zero: '0' })} / {fmtDur(plan, { zero: '0' })}</span>
                  </div>
                );
              })}
              <div className="legend xs mt-sm"><span className="legend-item"><span className="dot" style={{ background: 'var(--surface-3)' }} />Disponível na rotina</span><span className="legend-item"><span className="dot" style={{ background: 'var(--chart-1)' }} />Estudado</span></div>
            </div>
          </Card>
        )}
      </div>

      <Card title="Semana" action={!readOnly && (
        <div className="row wrap">
          {blocks.length === 0 && <button className="btn btn-sm" onClick={() => save(TEMPLATE, 'Modelo aplicado. Ajuste à sua realidade.')}>Usar modelo</button>}
          {blocks.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setClear(true)}>Limpar</button>}
          <button className="btn btn-primary btn-sm" onClick={() => setEdit({ weekdays: [0], start: '19:00', end: '21:00', category: 'estudo', label: '' })}>+ Adicionar bloco</button>
        </div>
      )}>
        <div className="legend small mb">
          {Object.entries(CATEGORIES).map(([k, v]) => <span key={k} className="legend-item"><span className={`blk cat-${k}`} style={{ position: 'static', width: 14, height: 12, display: 'inline-block', padding: 0 }} />{v}</span>)}
        </div>
        {blocks.length === 0 ? <Empty icon={CalendarDays} title="Sua semana está vazia">Adicione blocos (trabalho, deslocamento, estudo…) ou comece pelo modelo.</Empty> : (
          <>
            {/* Grade semanal (desktop) */}
            <div className="hide-mobile" style={{ overflowX: 'auto' }}>
              <div className="week" style={{ minWidth: 720 }}>
                <div />
                {WEEKDAYS_SHORT.map((d, i) => <div key={d} className="week-day-head" style={{ color: i === todayWd ? 'var(--accent)' : undefined }}>{d}<small>{fmtDur(routine.study_minutes_per_day[i] * 60, { zero: '—' })}</small></div>)}
                <div className="week-hours" style={{ height: (maxH - minH) * PX }}>
                  {Array.from({ length: maxH - minH + 1 }, (_, i) => <span key={i} style={{ top: i * PX }}>{String(minH + i).padStart(2, '0')}h</span>)}
                </div>
                {WEEKDAYS.map((_, wd) => (
                  <div key={wd} className="week-col" style={{ height: (maxH - minH) * PX }}>
                    {blocks.filter((b) => b.weekday === wd).map((b) => (
                      <div key={b.id} className={`blk cat-${b.category}`} style={{ top: ((b.start_min - minH * 60) / 60) * PX + 1, height: Math.max(((b.end_min - b.start_min) / 60) * PX - 2, 14) }}
                        title={`${CATEGORIES[b.category]}${b.label ? ` · ${b.label}` : ''} · ${minToHHMM(b.start_min)}–${minToHHMM(b.end_min)}`}
                        onClick={() => !readOnly && setEdit({ id: b.id, weekdays: [b.weekday], start: minToHHMM(b.start_min), end: minToHHMM(b.end_min === 1440 ? 1439 : b.end_min), category: b.category, label: b.label || '' })}>
                        {b.label || CATEGORIES[b.category]}{b.end_min - b.start_min >= 90 ? <br /> : ' '}<span style={{ opacity: .75 }}>{minToHHMM(b.start_min)}–{minToHHMM(b.end_min)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Lista por dia (celular) */}
            <div className="only-mobile">
              {WEEKDAYS.map((name, wd) => {
                const day = blocks.filter((b) => b.weekday === wd);
                return (
                  <div key={wd} className="routine-list-day">
                    <div className="row between"><b>{name}</b><span className="small muted">Estudo: {fmtDur(routine.study_minutes_per_day[wd] * 60, { zero: '—' })}</span></div>
                    {day.length === 0 && <p className="xs muted">Sem blocos.</p>}
                    {day.map((b) => (
                      <div key={b.id} className="row between small" style={{ padding: '5px 0' }} onClick={() => !readOnly && setEdit({ id: b.id, weekdays: [b.weekday], start: minToHHMM(b.start_min), end: minToHHMM(b.end_min === 1440 ? 1439 : b.end_min), category: b.category, label: b.label || '' })}>
                        <span className="num muted">{minToHHMM(b.start_min)}–{minToHHMM(b.end_min)}</span>
                        <span className={`tag`} style={b.category === 'estudo' ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}>{b.label || CATEGORIES[b.category]}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {edit && <BlockModal edit={edit} blocks={blocks} onClose={() => setEdit(null)} onSave={async (next) => { if (await save(next)) setEdit(null); }} />}
      {clear && <Confirm title="Limpar a rotina?" danger confirmLabel="Limpar" onClose={() => setClear(false)} message="Todos os blocos da semana serão removidos." onConfirm={async () => { if (await save([], 'Rotina limpa.')) setClear(false); }} />}
    </div>
  );
}

function BlockModal({ edit, blocks, onClose, onSave }) {
  const [f, setF] = useState(edit);
  const [err, setErr] = useState(null);
  const toggleDay = (d) => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] });
  const submit = () => {
    const s = hhmmToMin(f.start);
    let e = hhmmToMin(f.end);
    if (f.end === '00:00') e = 1440;
    if (!(e > s)) return setErr('O horário final deve ser depois do inicial.');
    if (!f.weekdays.length) return setErr('Escolha ao menos um dia.');
    const rest = blocks.filter((b) => b.id !== f.id);
    const created = f.weekdays.map((wd) => ({ weekday: wd, start_min: s, end_min: e, category: f.category, label: f.label }));
    onSave([...rest, ...created]);
  };
  return (
    <Modal title={f.id ? 'Editar bloco' : 'Adicionar bloco'} onClose={onClose}
      footer={<>
        {f.id && <button className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={() => onSave(blocks.filter((b) => b.id !== f.id))}>Remover</button>}
        <button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={submit}>Salvar</button>
      </>}>
      <Field label={f.id ? 'Dia' : 'Dias da semana'}>
        <div className="row wrap" style={{ gap: 6 }}>
          {WEEKDAYS_SHORT.map((d, i) => <button key={d} className={`chip ${f.weekdays.includes(i) ? 'on' : ''}`} onClick={() => (f.id ? setF({ ...f, weekdays: [i] }) : toggleDay(i))}>{d}</button>)}
          {!f.id && <button className="chip" onClick={() => setF({ ...f, weekdays: [0, 1, 2, 3, 4] })}>Seg–Sex</button>}
        </div>
      </Field>
      <div className="grid g2">
        <Field label="Início"><input type="time" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Fim"><input type="time" className="input" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
      </div>
      <Field label="Tipo">
        <div className="row wrap" style={{ gap: 6 }}>
          {Object.entries(CATEGORIES).map(([k, v]) => <button key={k} className={`chip ${f.category === k ? 'on' : ''}`} onClick={() => setF({ ...f, category: k })}>{v}</button>)}
        </div>
      </Field>
      <Field label="Descrição (opcional)"><input className="input" value={f.label} maxLength={60} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Ex.: Academia, Almoço, Estudo de questões" /></Field>
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
