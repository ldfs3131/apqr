import { ExternalLink, Plus, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useData, useExam } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtPct } from '../lib/format.js';
import { Page } from '../components/Layout.jsx';
import { Async, Card, Stat } from '../components/ui.jsx';
import { ManualSessionModal } from '../components/ManualSession.jsx';
import { NoExam } from './Dashboard.jsx';
import { QuestionsHistory } from './Studies.jsx';

/** Selo da plataforma de questões da casa. Se o arquivo /brand/faco-questao.png existir, usa o logotipo. */
function FacoQuestaoBadge() {
  const [logo, setLogo] = useState(true);
  return (
    <span className="faco-badge">
      {logo && <img src="/brand/faco-questao.png" alt="" onError={() => setLogo(false)} style={{ height: 60 }} />}
      <span>{!logo && <b>Faço Questão de Farmácia</b>}<span className="xs muted" style={{ display: 'block' }}>Plataforma de questões da casa</span></span>
    </span>
  );
}

export default function Questions() {
  const { examId, exams } = useExam();
  const { version } = useData();
  const [modal, setModal] = useState(null);
  const cfg = useAsync(() => api.get('/me/config'), []);
  const sum = useAsync(() => (examId ? api.get(`/enrollments/${examId}/dashboard`) : Promise.resolve(null)), [examId, version]);
  useEffect(() => {}, []);
  if (exams && !examId) return <NoExam />;
  const url = cfg.data?.config?.faco_questao_url;
  return (
    <Page title="Questões" eyebrow="Estudar" subtitle="Resolva questões na plataforma da casa e registre aqui o que fez: por tema, só pela matéria ou em simulado.">
      <div className="stack">
        {url && (
          <div className="card card-pad row between wrap" style={{ gap: 14 }}>
            <FacoQuestaoBadge />
            <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">Resolver questões<ExternalLink size={15} aria-hidden="true" /></a>
          </div>
        )}
        <Card title="Registrar questões" icon={Target}>
          <p className="small ink2">Fez questões em qualquer lugar? Lance aqui. Não precisa saber o tema: dá para registrar só a matéria, ou um simulado inteiro.</p>
          <div className="row wrap mt-sm" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setModal('topic')}><Plus size={16} aria-hidden="true" />Por tema</button>
            <button className="btn" onClick={() => setModal('subject')}><Plus size={16} aria-hidden="true" />Só a matéria</button>
            <button className="btn" onClick={() => setModal('simulado')}><Plus size={16} aria-hidden="true" />Simulado</button>
          </div>
        </Card>
        <Async state={sum}>{(d) => d && d.summary ? (
          <div className="grid g3">
            <Stat label="Questões no total" value={(d.summary.questions || 0).toLocaleString('pt-BR')} />
            <Stat label="Acertos" value={(d.summary.correct || 0).toLocaleString('pt-BR')} />
            <Stat label="% de acerto" value={d.summary.questions ? fmtPct((d.summary.correct / d.summary.questions) * 100, 1) : '—'} />
          </div>
        ) : null}</Async>
        <QuestionsHistory examId={examId} readOnly={false} />
      </div>
      {modal && <ManualSessionModal initialKind={modal} onClose={() => setModal(null)} onSaved={() => setModal(null)} />}
    </Page>
  );
}
