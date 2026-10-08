import { useState } from 'react';
import { Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { Page } from '../../components/Layout.jsx';
import { Async, Card, Empty, Field } from '../../components/ui.jsx';

/** Turmas: nome vem do cadastro dos alunos; aqui a equipe guarda os 2 links de WhatsApp (avisos e alunos). */
export default function Turmas() {
  const state = useAsync(() => api.get('/teacher/cohorts'), []);
  const [name, setName] = useState('');
  const toast = useToast();
  return (
    <Page title="Turmas" eyebrow="Mentoria" topbar={false} subtitle="Cada turma tem 2 grupos de WhatsApp: avisos e alunos. O aluno vê os botões na tela Hoje; a entrada é aprovada no próprio WhatsApp. Materiais podem ser publicados só para uma turma.">
      <Async state={state}>{(d) => (
        <div className="stack">
          {!d.cohorts.length && <Card><Empty icon={Users} title="Nenhuma turma ainda">As turmas aparecem quando você define a turma de um aluno (ficha do aluno) ou cria uma abaixo.</Empty></Card>}
          {d.cohorts.map((c) => <CohortRow key={c.name} c={c} onSaved={() => state.reload({ silent: true })} />)}
          <Card title="Nova turma">
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input" style={{ maxWidth: 320 }} aria-label="Nome da turma" placeholder="Nome da turma (ex.: ANVISA 2026)" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary" disabled={name.trim().length < 2} onClick={async () => { try { await api.put('/teacher/cohorts', { name: name.trim() }); setName(''); toast.success('Turma criada.'); state.reload({ silent: true }); } catch (e) { toast.error(e); } }}>Criar turma</button>
            </div>
          </Card>
        </div>
      )}</Async>
    </Page>
  );
}

function CohortRow({ c, onSaved }) {
  const toast = useToast();
  const [a, setA] = useState(c.whatsapp_notices_url || '');
  const [b, setB] = useState(c.whatsapp_students_url || '');
  const [busy, setBusy] = useState(false);
  const dirty = a !== (c.whatsapp_notices_url || '') || b !== (c.whatsapp_students_url || '');
  const save = async () => {
    setBusy(true);
    try { await api.put('/teacher/cohorts', { name: c.name, whatsapp_notices_url: a || null, whatsapp_students_url: b || null }); toast.success('Links salvos.'); onSaved(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title={c.name} subtitle={`${c.students} ${c.students === 1 ? 'aluno' : 'alunos'}`}>
      <div className="grid g2">
        <Field label="Grupo de avisos (WhatsApp)"><input className="input" type="url" placeholder="https://chat.whatsapp.com/…" value={a} onChange={(e) => setA(e.target.value)} /></Field>
        <Field label="Grupo de alunos (WhatsApp)"><input className="input" type="url" placeholder="https://chat.whatsapp.com/…" value={b} onChange={(e) => setB(e.target.value)} /></Field>
      </div>
      <button className="btn btn-primary btn-sm mt-sm" disabled={!dirty || busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar links'}</button>
    </Card>
  );
}
