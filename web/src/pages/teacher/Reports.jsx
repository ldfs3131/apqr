import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Sparkles, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Page } from '../../components/Layout.jsx';
import { Alert, Async, Avatar, Card, Empty, Tabs } from '../../components/ui.jsx';
import Roster from './Roster.jsx';
import { EditalSelect, useEditais } from '../../components/teacher.jsx';

/** Relatórios: base de alunos (planos, vencimentos, engajamento) e relatório por aluno (PDF e IA). */
export default function Reports() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('aba') === 'alunos' ? 'alunos' : 'base';
  const setTab = (v) => { const n = new URLSearchParams(sp); if (v === 'base') n.delete('aba'); else n.set('aba', v); setSp(n, { replace: true }); };
  return (
    <Page title="Relatórios" eyebrow="Mentoria" topbar={false}
      subtitle={tab === 'base' ? 'Quem está estudando, quem está para vencer e quem já passou pela mentoria.' : 'Relatório de desempenho de cada aluno, pronto para imprimir ou salvar em PDF.'}>
      <div className="stack">
        <Tabs value={tab} onChange={setTab} options={[{ value: 'base', label: 'Base de alunos', icon: Users }, { value: 'alunos', label: 'Relatório por aluno', icon: FileText }]} />
        {tab === 'base' ? <Roster /> : <StudentReports />}
      </div>
    </Page>
  );
}

function StudentReports() {
  const editais = useEditais();
  const [edital, setEdital] = useState(null);
  useEffect(() => { if (!edital && editais.data?.editais?.length) setEdital(editais.data.editais[0].id); }, [editais.data, edital]);
  const state = useAsync(() => (edital ? api.get(`/teacher/editais/${edital}`) : Promise.resolve(null)), [edital]);
  return (
      <div className="stack">
        <div className="row" style={{ justifyContent: 'flex-end' }}><EditalSelect value={edital} onChange={setEdital} /></div>
        <Alert tone="info" icon={Sparkles}><span>O <b>Relatório IA</b> traz um texto de análise escrito pela IA; todos os números e datas do texto são preenchidos pela plataforma, nunca digitados pela IA.</span></Alert>
        {editais.data && !editais.data.editais.length ? <div className="card"><Empty icon={FileText} title="Nenhum edital">Crie um edital e vincule alunos.</Empty></div> : (
          <Async state={state}>
            {(d) => d && (
              <Card pad={false}>
                {d.enrollments.filter((e) => e.status === 'active').length === 0 ? <div className="card-pad"><p className="small muted">Nenhum aluno neste edital.</p></div> : d.enrollments.filter((e) => e.status === 'active').map((e) => (
                  <div key={e.id} className="row between wrap" style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', gap: 8 }}>
                    <span className="row" style={{ gap: 10 }}><Avatar name={e.name} /><span><b>{e.name}</b><div className="xs muted">{e.email}</div></span></span>
                    <span className="row" style={{ gap: 6 }}>
                      <Link className="btn btn-sm btn-ghost" to={`/professora/alunos/${e.student_id}`}>Raio-X</Link>
                      <Link className="btn btn-sm" to={`/professora/alunos/${e.student_id}?aba=ai`}><Sparkles size={15} aria-hidden="true" />Relatório IA</Link>
                      <Link className="btn btn-sm" to={`/professora/relatorio/${e.id}`}><FileText size={15} aria-hidden="true" />Relatório</Link>
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </Async>
        )}
      </div>
  );
}
