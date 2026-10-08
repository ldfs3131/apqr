import { useState } from 'react';
import { CheckCircle2, Copy, RefreshCcw, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/store.jsx';
import { useAsync } from '../lib/useAsync.js';
import { fmtDateTime } from '../lib/format.js';
import { Alert, Async, Card, Empty } from './ui.jsx';

const STATUS = {
  ok: { label: 'Texto da IA validado', tone: 'good', icon: CheckCircle2 },
  deterministic: { label: 'Relatório por regras (sem IA)', tone: 'info', icon: ShieldCheck },
  rejected: { label: 'Texto da IA reprovado na validação — exibindo a versão por regras', tone: 'warning', icon: TriangleAlert },
  error: { label: 'A IA não respondeu — exibindo a versão por regras', tone: 'warning', icon: TriangleAlert },
};

/** Relatório do aluno com IA: fatos calculados → texto da IA validado (ou versão por regras). */
export function AiReport({ enrollmentId }) {
  const toast = useToast();
  const list = useAsync(() => api.get(`/teacher/enrollments/${enrollmentId}/ai-reports`), [enrollmentId]);
  const status = useAsync(() => api.get('/teacher/ai/status'), []);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);
  const generate = async (force) => {
    setBusy(true);
    try {
      const r = await api.post(`/teacher/enrollments/${enrollmentId}/ai-report`, { force });
      setCurrent(r.report);
      if (r.cached) toast.info('Nada mudou desde o último relatório: exibindo a versão salva (sem novo custo).');
      else if (r.limit_reached) toast.info('Limite diário de relatórios com IA atingido: gerado por regras.');
      list.reload({ silent: true });
      status.reload({ silent: true });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const st = status.data;
  return (
    <div className="stack">
      <Card title="Relatório com IA" icon={Sparkles}
        subtitle="A plataforma calcula os números e o diagnóstico. A IA escreve só as frases: ela não digita nenhum número ou data — cada valor do texto é preenchido pela plataforma."
        action={<div className="row" style={{ gap: 6 }}>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => generate(false)}><Sparkles size={15} aria-hidden="true" />{busy ? 'Gerando…' : 'Gerar relatório'}</button>
          {(current || list.data?.reports?.length > 0) && <button className="btn btn-sm" disabled={busy} onClick={() => generate(true)} title="Gera de novo mesmo sem mudanças nos dados"><RefreshCcw size={15} aria-hidden="true" />Gerar novamente</button>}
        </div>}>
        {st && !st.configured && <Alert tone="info">A IA ainda não está configurada neste servidor. O relatório é montado pelas regras da plataforma (mesmos números, texto mais simples). Para ativar, a ONE UP informa a chave da API nas configurações do servidor.</Alert>}
        {st?.configured && <p className="xs muted">Modelo: {st.model} · {st.used_today} de {st.daily_limit} relatórios com IA hoje neste ambiente · relatórios iguais são reaproveitados por {st.cache_hours}h.</p>}
      </Card>
      <Async state={list} compact>
        {({ reports }) => {
          const r = current || reports[0];
          if (!r) return <div className="card"><Empty icon={Sparkles} title="Nenhum relatório gerado">Clique em “Gerar relatório”.</Empty></div>;
          return <ReportView r={r} history={reports} onPick={setCurrent} />;
        }}
      </Async>
    </div>
  );
}

function ReportView({ r, history, onPick }) {
  const toast = useToast();
  const s = STATUS[r.status] || STATUS.deterministic;
  const n = r.narrative || {};
  const copyMsg = async () => { try { await navigator.clipboard.writeText(n.mensagem_ao_aluno); toast.success('Mensagem copiada.'); } catch { toast.info('Selecione o texto e copie.'); } };
  const section = (title, items) => items?.length > 0 && (
    <div><h3 style={{ fontSize: 15 }}>{title}</h3><ul className="small ink2" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{items.map((x) => <li key={x} style={{ marginBottom: 4 }}>{x}</li>)}</ul></div>
  );
  const f = r.facts || {};
  return (
    <div className="grid g-main">
      <Card>
        <div className="stack">
          <Alert tone={s.tone} icon={s.icon}>{s.label}{r.validation?.problems?.length ? <div className="xs" style={{ marginTop: 4 }}>{r.validation.problems.join(' ')}</div> : null}</Alert>
          <p style={{ fontSize: 15.5, lineHeight: 1.6 }}>{n.resumo}</p>
          {section('Pontos fortes', n.pontos_fortes)}
          {section('Pontos de atenção', n.pontos_de_atencao)}
          {section('Recomendações', n.recomendacoes)}
          {n.mensagem_ao_aluno && (
            <div className="card card-pad" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div className="row between"><b className="small">Mensagem sugerida para o aluno</b><button className="btn btn-ghost btn-sm" onClick={copyMsg}><Copy size={14} aria-hidden="true" />Copiar</button></div>
              <p className="small mt-sm">{n.mensagem_ao_aluno}</p>
            </div>
          )}
          <p className="xs muted">Gerado em {fmtDateTime(r.created_at)}{r.provider && r.provider !== 'none' ? ` · ${r.model}` : ''}{r.cost_usd ? ` · custo estimado US$ ${Number(r.cost_usd).toFixed(4)}` : ''}{r.validation?.placeholders ? ` · ${r.validation.placeholders} valores preenchidos pela plataforma` : ''}</p>
        </div>
      </Card>
      <div className="stack">
        <Card title="Números usados" subtitle="Exatamente o que a IA recebeu (sem nome, e-mail, CPF ou contato).">
          <dl className="kv small">
            <dt>Consolidados</dt><dd>{f.situacao_atual?.consolidados} de {f.situacao_atual?.conteudos_no_edital} ({String(f.situacao_atual?.consolidacao_percentual).replace('.', ',')}%)</dd>
            <dt>Em revisão</dt><dd>{f.situacao_atual?.em_revisao}</dd>
            <dt>Não iniciados</dt><dd>{f.situacao_atual?.nao_iniciados}</dd>
            <dt>Dias ativos (4 sem.)</dt><dd>{f.ultimas_4_semanas?.dias_ativos}</dd>
            <dt>Horas (4 sem.)</dt><dd>{String(f.ultimas_4_semanas?.horas_estudadas ?? '—').replace('.', ',')}</dd>
            <dt>Questões (4 sem.)</dt><dd>{f.ultimas_4_semanas?.questoes}{f.ultimas_4_semanas?.percentual_acerto != null ? ` · ${String(f.ultimas_4_semanas.percentual_acerto).replace('.', ',')}%` : ''}</dd>
            <dt>Constância</dt><dd>{String(f.ultimas_4_semanas?.constancia ?? '—').replace('.', ',')}</dd>
            <dt>Evolução</dt><dd>{f.ultimas_4_semanas?.evolucao_pontos_percentuais == null ? '—' : `${String(f.ultimas_4_semanas.evolucao_pontos_percentuais).replace('.', ',')} p.p.`}</dd>
            <dt>Regras</dt><dd>v{f.regras_vigentes?.versao}: &gt;{f.regras_vigentes?.consolida_acima_de_percentual}% · mín. {f.regras_vigentes?.minimo_questoes_por_revisao} questões</dd>
          </dl>
        </Card>
        {history.length > 1 && (
          <Card title="Relatórios anteriores">
            {history.map((h) => (
              <button key={h.id} className="row between small" onClick={() => onPick(h)} style={{ width: '100%', background: h.id === r.id ? 'var(--surface-2)' : 'none', border: 0, borderTop: '1px solid var(--border)', padding: '8px 6px', cursor: 'pointer', color: 'inherit' }}>
                <span>{fmtDateTime(h.created_at)}</span><span className="xs muted">{STATUS[h.status]?.label.split(' —')[0]}</span>
              </button>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
