import { useState } from 'react';
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Card, Confirm, Empty, Field, Modal, Seg } from '../../components/ui.jsx';
import { KIND_LABEL, brtDay, brtTime, dayTitle, endsAfterNow, groupByDay } from '../../lib/agenda.js';
import { EventCard } from '../Agenda.jsx';
import { useAuth } from '../../lib/store.jsx';

const audienceText = (e) => ({ all: 'Todos os alunos', cohort: `Turma ${e.cohort}`, edital: `Edital: ${e.edital_name}`, student: `Só ${e.student_name}` }[e.audience]);

export default function TeacherAgenda() {
  const { user } = useAuth();
  const canEdit = user.role !== 'mentor';
  const [view, setView] = useState('next');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const toast = useToast();
  const state = useAsync(() => api.get('/teacher/agenda'), []);
  return (
    <Page title="Agenda" eyebrow="Mentoria" topbar={false} subtitle="Marque aulas, reuniões, plantões e datas importantes. Os alunos veem só o que é para eles e podem levar para o próprio calendário."
      actions={canEdit && <button className="btn btn-primary" onClick={() => setEdit({})}><Plus size={16} aria-hidden="true" />Novo compromisso</button>}>
      <Async state={state}>
        {(d) => {
          const upcoming = d.events.filter(endsAfterNow);
          const past = d.events.filter((e) => !endsAfterNow(e)).reverse();
          const list = view === 'next' ? upcoming : past;
          return (
            <div className="stack">
              <Seg ariaLabel="Período" value={view} onChange={setView} options={[{ value: 'next', label: `Próximos (${upcoming.length})` }, { value: 'past', label: 'Anteriores' }]} />
              {list.length === 0 ? <div className="card"><Empty icon={CalendarClock} title="Nada por aqui">Crie o primeiro compromisso para aparecer na agenda dos alunos.</Empty></div> : groupByDay(list).map(([day, evs]) => (
                <Card key={day} title={dayTitle(day)}>
                  <div className="ag-list">
                    {evs.map((e) => (
                      <EventCard key={e.id} e={e} actions={
                        <div className="row wrap mt-sm" style={{ gap: 8 }}>
                          <span className="xs muted">Para: {audienceText(e)}</span>
                          {canEdit && <><button className="btn btn-sm btn-ghost" onClick={() => setEdit(e)}><Pencil size={14} aria-hidden="true" />Editar</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setDel(e)}><Trash2 size={14} aria-hidden="true" />Excluir</button></>}
                        </div>} />
                    ))}
                  </div>
                </Card>
              ))}
              {edit && <EventModal ev={edit} data={d} onClose={() => setEdit(null)} onDone={() => { setEdit(null); state.reload({ silent: true }); }} />}
              {del && <Confirm danger title="Excluir compromisso" message={`Excluir “${del.title}”? Ele some da agenda dos alunos.`} confirmLabel="Excluir" onClose={() => setDel(null)}
                onConfirm={async () => { try { await api.del(`/teacher/agenda/${del.id}`); setDel(null); toast.success('Compromisso excluído.'); state.reload({ silent: true }); } catch (e) { toast.error(e); } }} />}
            </div>
          );
        }}
      </Async>
    </Page>
  );
}

function EventModal({ ev, data, onClose, onDone }) {
  const toast = useToast();
  const isNew = !ev.id;
  const [v, setV] = useState(() => ({
    kind: ev.kind || 'aula', title: ev.title || '', description: ev.description || '', date: ev.starts_at ? brtDay(ev.starts_at) : '',
    all_day: !!ev.all_day, start_time: ev.starts_at && !ev.all_day ? brtTime(ev.starts_at) : '19:00', end_time: ev.ends_at ? brtTime(ev.ends_at) : '',
    link: ev.link || '', audience: ev.audience || 'all', cohort: ev.cohort || '', edital_id: ev.edital_id || '', student_id: ev.student_id || '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { kind: v.kind, title: v.title, description: v.description || null, date: v.date, all_day: v.all_day, link: v.link || null, audience: v.audience };
      if (!v.all_day) { body.start_time = v.start_time; body.end_time = v.end_time || null; }
      if (v.audience === 'cohort') body.cohort = v.cohort;
      if (v.audience === 'edital') body.edital_id = v.edital_id;
      if (v.audience === 'student') body.student_id = v.student_id;
      if (isNew) await api.post('/teacher/agenda', body); else await api.put(`/teacher/agenda/${ev.id}`, body);
      toast.success('Agenda atualizada.'); onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const ok = v.title.trim().length >= 3 && v.date && (v.all_day || v.start_time)
    && (v.audience !== 'cohort' || v.cohort) && (v.audience !== 'edital' || v.edital_id) && (v.audience !== 'student' || v.student_id);
  return (
    <Modal wide title={isNew ? 'Novo compromisso' : 'Editar compromisso'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={busy || !ok} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="stack">
        <div className="grid g2">
          <Field label="Tipo"><select className="input" value={v.kind} onChange={set('kind')}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Título"><input className="input" value={v.title} onChange={set('title')} placeholder="Ex.: Aula de Farmacologia" /></Field>
        </div>
        <div className="grid g3">
          <Field label="Data (Brasília)"><input className="input" type="date" value={v.date} onChange={set('date')} /></Field>
          {!v.all_day && <Field label="Início"><input className="input" type="time" value={v.start_time} onChange={set('start_time')} /></Field>}
          {!v.all_day && <Field label="Término" hint="Opcional."><input className="input" type="time" value={v.end_time} onChange={set('end_time')} /></Field>}
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={v.all_day} onChange={set('all_day')} /><span className="small">Dia todo (ex.: data da prova)</span></label>
        <Field label="Link" hint="Opcional. Sala da aula, reunião, formulário… precisa começar com https://"><input className="input" value={v.link} onChange={set('link')} placeholder="https://" /></Field>
        <Field label="Detalhes" hint="Opcional."><textarea className="input" rows={3} value={v.description} onChange={set('description')} /></Field>
        <Field label="Quem vê">
          <select className="input" value={v.audience} onChange={set('audience')}>
            <option value="all">Todos os alunos</option><option value="cohort">Uma turma</option><option value="edital">Alunos de um edital</option><option value="student">Um aluno (privado)</option>
          </select>
        </Field>
        {v.audience === 'cohort' && <Field label="Turma"><select className="input" value={v.cohort} onChange={set('cohort')}><option value="">Escolha…</option>{data.cohorts.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>}
        {v.audience === 'edital' && <Field label="Edital"><select className="input" value={v.edital_id} onChange={set('edital_id')}><option value="">Escolha…</option>{data.editais.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>}
        {v.audience === 'student' && <Field label="Aluno"><select className="input" value={v.student_id} onChange={set('student_id')}><option value="">Escolha…</option>{data.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {err && <div className="error-box">{err}</div>}
      </div>
    </Modal>
  );
}
