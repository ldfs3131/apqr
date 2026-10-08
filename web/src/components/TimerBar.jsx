import { useState } from 'react';
import { useData, useTimer, useToast } from '../lib/store.jsx';
import { fmtClock, fmtDur } from '../lib/format.js';
import { Modal } from './ui.jsx';

/** Barra flutuante do cronômetro — visível em todas as telas enquanto houver estudo em andamento. */
export function TimerBar() {
  const t = useTimer();
  const [finishing, setFinishing] = useState(false);
  const toast = useToast();
  if (!t?.timer) return null;
  const paused = t.timer.state === 'paused';
  const run = (fn) => async () => { try { await fn(); } catch (e) { toast.error(e); } };
  return (
    <>
      <div className="timer-bar" role="timer" aria-live="off">
        <span className={`pulse ${paused ? 'paused' : ''}`} aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div className="time">{fmtClock(t.elapsed)}</div>
          <div className="xs tb-topic" style={{ opacity: .7, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.timer.subject_name} — {t.timer.topic_name}</div>
        </div>
        {paused
          ? <button className="btn btn-sm" onClick={run(t.resume)}>▶ Continuar</button>
          : <button className="btn btn-sm" onClick={run(t.pause)}>⏸ Pausar</button>}
        <button className="btn btn-sm btn-primary" onClick={() => setFinishing(true)}>⏹ Finalizar</button>
      </div>
      {finishing && <FinishModal onClose={() => setFinishing(false)} />}
    </>
  );
}

function FinishModal({ onClose }) {
  const t = useTimer();
  const { bump } = useData();
  const toast = useToast();
  const elapsed = t.elapsed;
  const [adjust, setAdjust] = useState(false);
  const [mins, setMins] = useState(String(Math.round(elapsed / 60)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    try {
      const adjusted = adjust ? Math.min(Number(mins) * 60, elapsed) : null;
      const r = await t.finish({ adjusted_seconds: adjusted || null, note: note || null });
      if (r.saved) toast.success(`Sessão de ${fmtDur(r.session.duration_seconds)} salva em ${t.timer?.topic_name || 'seu conteúdo'}.`);
      else toast.info(r.message);
      bump();
      onClose();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Modal title="Finalizar estudo" onClose={onClose}
      footer={<>
        <button className="btn btn-ghost btn-danger" onClick={async () => { await t.discard(); toast.info('Sessão descartada.'); onClose(); }}>Descartar</button>
        <button className="btn" onClick={onClose}>Voltar</button>
        <button className="btn btn-primary" disabled={busy} onClick={finish}>{busy ? 'Salvando…' : 'Salvar sessão'}</button>
      </>}>
      <div className="card card-pad" style={{ textAlign: 'center', boxShadow: 'none', background: 'var(--surface-2)' }}>
        <div className="muted small">{t.timer?.subject_name} — {t.timer?.topic_name}</div>
        <div className="num" style={{ fontSize: 36, fontWeight: 750 }}>{fmtDur(elapsed)}</div>
        {t.timer?.long_session && <div className="small" style={{ color: 'var(--s-orange-ink)' }}>Sessão longa. Esqueceu o cronômetro ligado? Ajuste a duração abaixo.</div>}
      </div>
      <label className="row small"><input type="checkbox" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} /> Ajustar duração (só para menos)</label>
      {adjust && <div className="row"><input className="input num" style={{ width: 110 }} inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ''))} /> <span>minutos</span></div>}
      <input className="input" placeholder="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {elapsed < 60 && <p className="xs muted">Sessões com menos de 1 minuto não são salvas.</p>}
    </Modal>
  );
}
