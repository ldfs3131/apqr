import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CalendarPlus, ChevronRight, ExternalLink, Video } from 'lucide-react';
import { api, download } from '../lib/api.js';
import { useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Empty, Seg } from '../components/ui.jsx';
import { KIND_CLS, KIND_LABEL, brtDay, dayTitle, endsAfterNow, groupByDay, whenText } from '../lib/agenda.js';

export function EventCard({ e, actions }) {
  return (
    <div className="ag-event">
      <div className="ag-time">{whenText(e)}</div>
      <div className="ag-body">
        <div className="row wrap" style={{ gap: 8 }}><span className={`eng-badge ${KIND_CLS[e.kind]}`}>{KIND_LABEL[e.kind]}</span><b>{e.title}</b></div>
        {e.description && <p className="small ink2 ag-desc">{e.description}</p>}
        {e.link && <a className="btn btn-sm mt-sm" href={e.link} target="_blank" rel="noopener noreferrer"><Video size={15} aria-hidden="true" />Abrir link<ExternalLink size={13} aria-hidden="true" /></a>}
        {actions}
      </div>
    </div>
  );
}

/** Agenda da professora (aluno). */
export default function Agenda() {
  const toast = useToast();
  const [view, setView] = useState('next');
  const state = useAsync(() => api.get('/me/agenda'), []);
  return (
    <Page title="Agenda" subtitle="Aulas ao vivo, reuniões, plantões e datas importantes da professora."
      actions={<button className="btn" onClick={() => download('/me/agenda.ics').catch((e) => toast.error(e))}><CalendarPlus size={16} aria-hidden="true" />Adicionar ao meu calendário</button>}>
      <Async state={state}>
        {(d) => {
          const upcoming = d.events.filter(endsAfterNow);
          const past = d.events.filter((e) => !endsAfterNow(e)).reverse();
          const list = view === 'next' ? upcoming : past;
          return (
            <div className="stack">
              <Seg ariaLabel="Período" value={view} onChange={setView} options={[{ value: 'next', label: `Próximos (${upcoming.length})` }, { value: 'past', label: 'Anteriores' }]} />
              {list.length === 0 ? <div className="card"><Empty icon={CalendarClock} title={view === 'next' ? 'Nada marcado por enquanto' : 'Nenhum compromisso anterior'}>{view === 'next' ? 'Quando a professora marcar uma aula, reunião ou data importante, aparece aqui.' : ''}</Empty></div> : (
                groupByDay(view === 'next' ? list : list).map(([day, evs]) => (
                  <Card key={day} title={dayTitle(day)} className={day === brtDay(new Date().toISOString()) ? 'ag-today' : ''}>
                    <div className="ag-list">{evs.map((e) => <EventCard key={e.id} e={e} />)}</div>
                  </Card>
                ))
              )}
              <p className="xs muted">Horários de Brasília. O arquivo “Adicionar ao meu calendário” funciona no Google Agenda, Apple Calendário e Outlook.</p>
            </div>
          );
        }}
      </Async>
    </Page>
  );
}

/** Cartão "próximo compromisso" para a tela Hoje. */
export function NextEvent() {
  const state = useAsync(() => api.get('/me/agenda'), []);
  const next = state.data?.events.find(endsAfterNow);
  if (!next) return null;
  return (
    <Link to="/agenda" className="next-event">
      <span className="countdown-ico" aria-hidden="true"><CalendarClock size={22} /></span>
      <span className="ne-text"><span className="xs bold muted">PRÓXIMO COMPROMISSO</span><b className="ellipsis">{next.title}</b>
        <span className="small muted">{dayTitle(brtDay(next.starts_at))} · {whenText(next)}</span></span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}
