import { useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useExam, useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { ACTIVITY, todayLocal } from '../lib/format.js';
import { Field, Modal } from './ui.jsx';

/** Seletor de conteúdo agrupado por matéria (conteúdos do edital da matrícula). */
export function TopicSelect({ value, onChange, examId, autoFocus }) {
  const st = useAsync(() => api.get(`/enrollments/${examId}/topics`), [examId]);
  const groups = [];
  for (const t of st.data?.topics || []) {
    let g = groups[groups.length - 1];
    if (!g || g.id !== t.subject_id) { g = { id: t.subject_id, name: t.subject_name, topics: [] }; groups.push(g); }
    g.topics.push(t);
  }
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value || null)} autoFocus={autoFocus} disabled={st.loading} aria-label="Conteúdo">
      <option value="">{st.loading ? 'Carregando…' : 'Selecione o conteúdo'}</option>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          {g.topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Seletor da atividade da sessão (qual etapa do APQR o aluno estava fazendo). */
export function ActivitySelect({ value, onChange }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Atividade">
      {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}

/** Seletor de matéria (derivado dos conteúdos do edital da matrícula). */
export function SubjectSelect({ value, onChange, examId }) {
  const st = useAsync(() => api.get(`/enrollments/${examId}/topics`), [examId]);
  const seen = new Map();
  for (const t of st.data?.topics || []) if (!seen.has(t.subject_id)) seen.set(t.subject_id, t.subject_name);
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value || null)} disabled={st.loading} aria-label="Matéria">
      <option value="">{st.loading ? 'Carregando…' : 'Selecione a matéria'}</option>
      {[...seen.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
}

const KINDS = [
  { value: 'study', label: 'Estudo (horas)' },
  { value: 'topic', label: 'Por tema' },
  { value: 'subject', label: 'Só a matéria' },
  { value: 'simulado', label: 'Simulado' },
];

export function ManualSessionModal({ fixedTopic, initialKind = 'study', onClose, onSaved }) {
  const { examId } = useExam();
  const { bump } = useData();
  const toast = useToast();
  const [kind, setKind] = useState(initialKind);
  const [topicId, setTopicId] = useState(fixedTopic?.id || null);
  const [subjectId, setSubjectId] = useState(null);
  const [date, setDate] = useState(todayLocal());
  const [h, setH] = useState('1');
  const [m, setM] = useState('0');
  const [start, setStart] = useState('');
  const [note, setNote] = useState('');
  const [activity, setActivity] = useState('study');
  const [qTotal, setQTotal] = useState('');
  const [qRight, setQRight] = useState('');
  const [simName, setSimName] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const minutes = (Number(h) || 0) * 60 + (Number(m) || 0);
  const isQ = kind !== 'study';
  const total = Number(qTotal) || 0;
  const right = Number(qRight);
  const qOk = total >= 1 && qRight !== '' && right >= 0 && right <= total;
  const target = kind === 'study' || kind === 'topic' ? !!topicId : kind === 'subject' ? !!subjectId : true;
  const canSave = isQ ? qOk && target : !!topicId && minutes >= 1;
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      if (isQ) {
        await api.post(`/enrollments/${examId}/questions`, { kind, topic_id: kind === 'topic' ? topicId : null, subject_id: kind === 'subject' ? subjectId : null, name: kind === 'simulado' ? simName || null : null, date, questions: total, correct: right, note: note || null });
        toast.success(kind === 'simulado' ? 'Simulado registrado.' : 'Questões registradas.');
      } else {
        await api.post(`/enrollments/${examId}/sessions`, { topic_id: topicId, date, duration_minutes: minutes, start_time: start || null, note: note || null, activity });
        toast.success('Estudo registrado.');
      }
      bump();
      onSaved?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Registrar estudo ou questões" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={!canSave || busy} onClick={save}>{busy ? 'Salvando…' : 'Registrar'}</button></>}>
      {!fixedTopic && (
        <Field label="O que você quer registrar?">
          <div className="row wrap" style={{ gap: 6 }} role="tablist">
            {KINDS.map((k) => <button key={k.value} type="button" aria-pressed={kind === k.value} className={`btn btn-sm ${kind === k.value ? 'btn-primary' : ''}`} onClick={() => setKind(k.value)}>{k.label}</button>)}
          </div>
        </Field>
      )}
      {kind === 'study' && <p className="small muted">Para estudos feitos sem o aplicativo aberto.</p>}
      {kind === 'topic' && <p className="small muted">Você sabe o tema: informe matéria, tema, quantidade e acertos.</p>}
      {kind === 'subject' && <p className="small muted">Não sabe o tema exato ou fez questões misturadas? Registre só a matéria. Ex.: 20 questões de Português.</p>}
      {kind === 'simulado' && <p className="small muted">Simulado com questões misturadas: informe o total de questões e o total de acertos.</p>}
      {(kind === 'study' || kind === 'topic') && <Field label="Conteúdo (matéria e tema)">{fixedTopic ? <div className="input" style={{ background: 'var(--surface-2)' }}>{fixedTopic.name}</div> : <TopicSelect examId={examId} value={topicId} onChange={setTopicId} autoFocus />}</Field>}
      {kind === 'subject' && <Field label="Matéria"><SubjectSelect examId={examId} value={subjectId} onChange={setSubjectId} /></Field>}
      {kind === 'simulado' && <Field label="Nome do simulado (opcional)"><input className="input" value={simName} maxLength={80} onChange={(e) => setSimName(e.target.value)} placeholder="Ex.: Simulado banca X" /></Field>}
      {kind === 'study' && <Field label="O que você fez" hint="Ajuda a sua professora a entender em que etapa do APQR o tempo foi usado."><ActivitySelect value={activity} onChange={setActivity} /></Field>}
      {isQ && (
        <div className="grid g2">
          <Field label={kind === 'simulado' ? 'Total de questões' : 'Quantidade de questões'}><input className="input num" inputMode="numeric" value={qTotal} onChange={(e) => setQTotal(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
          <Field label={kind === 'simulado' ? 'Total de acertos' : 'Acertos'}><input className="input num" inputMode="numeric" value={qRight} onChange={(e) => setQRight(e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
        </div>
      )}
      <div className="grid g2">
        <Field label="Data"><input type="date" className="input" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></Field>
        {kind === 'study' && <Field label="Horário inicial (opcional)"><input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>}
      </div>
      {kind === 'study' && (
        <Field label="Duração">
          <div className="row">
            <input className="input num" style={{ width: 80 }} inputMode="numeric" value={h} onChange={(e) => setH(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Horas" /><span>h</span>
            <input className="input num" style={{ width: 80 }} inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/\D/g, '').slice(0, 2))} aria-label="Minutos" /><span>min</span>
          </div>
        </Field>
      )}
      <Field label="Observação (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {isQ && right > total && <div className="error-box">Acertos não podem passar do total de questões.</div>}
      {err && <div className="error-box">{err}</div>}
    </Modal>
  );
}
