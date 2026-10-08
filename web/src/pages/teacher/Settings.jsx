import { useState } from 'react';
import { FileText, History, Palette, ShieldCheck, SlidersHorizontal, Upload } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth, useToast } from '../../lib/store.jsx';
import { useAsync } from '../../lib/useAsync.js';
import { fmtDateTime } from '../../lib/format.js';
import { Page } from '../../components/Layout.jsx';
import { Alert, Async, Card, Field, Modal } from '../../components/ui.jsx';

const ORDER = ['min_questions_per_review', 'consolidation_threshold', 'max_reviews_per_cycle', 'rotation_mode', 'rotation_min_other_topics', 'inactivity_days'];
const SHORT = {
  min_questions_per_review: 'Mínimo de questões', consolidation_threshold: 'Consolidação (acima de %)', max_reviews_per_cycle: 'Revisões por ciclo',
  rotation_mode: 'Novo ciclo', rotation_min_other_topics: 'Rodízio (outros conteúdos)', inactivity_days: 'Dias para “parado”',
};
const fmtVal = (k, v) => (k === 'rotation_mode' ? (v === 'auto' ? 'Automático' : 'Manual') : k === 'consolidation_threshold' ? `${v}%` : v);

/** Regras do APQR: parametrizadas e versionadas. Cada alteração cria uma nova versão; o histórico nunca é recalculado. */
export default function Settings() {
  const state = useAsync(() => api.get('/teacher/settings'), []);
  return (
    <Page title="Configurações do método" eyebrow="APQR" topbar={false}
      subtitle="As regras valem para todos os alunos do ambiente. Toda alteração gera uma nova versão e vale só daqui para frente.">
      <Async state={state}>{(d) => <SettingsBody d={d} reload={() => state.reload({ silent: true })} />}</Async>
    </Page>
  );
}

function SettingsBody({ d, reload }) {
  const { user } = useAuth();
  const toast = useToast();
  const canEdit = user.role !== 'mentor';
  const current = d.settings;
  const [draft, setDraft] = useState(() => Object.fromEntries(ORDER.map((k) => [k, current[k]])));
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const changes = ORDER.filter((k) => draft[k] !== current[k]);
  const set = (k, v) => setDraft((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true); setErr(null); setErrors({});
    try {
      await api.put('/teacher/settings', { settings: Object.fromEntries(changes.map((k) => [k, draft[k]])), reason, confirm: true });
      toast.success(`Nova versão das regras salva (v${current.version + 1}).`);
      setConfirm(false); setReason('');
      reload();
    } catch (e) { setErr(e.message); if (e.details && !Array.isArray(e.details)) setErrors(e.details); } finally { setBusy(false); }
  };
  return (
    <div className="stack" style={{ gap: 18 }}>
      <Alert tone="info" icon={ShieldCheck}>
        <span>Versão vigente: <b>v{current.version}</b>. Cada revisão guarda a versão e os valores usados no momento do registro. Mudar as regras <b>não altera</b> nenhuma revisão ou consolidação que já aconteceu.</span>
      </Alert>
      <Card title="Regras vigentes" icon={SlidersHorizontal}>
        <div className="grid g2">
          {ORDER.map((k) => {
            const sc = d.schema[k];
            return (
              <Field key={k} label={sc.label} hint={`${sc.hint} Padrão inicial: ${fmtVal(k, sc.default)}.`} error={errors[k]}>
                {k === 'rotation_mode' ? (
                  <select className="select" disabled={!canEdit} value={draft[k]} onChange={(e) => set(k, e.target.value)}>
                    <option value="manual">Manual — a professora libera o novo ciclo</option>
                    <option value="auto">Automático — libera quando o rodízio for cumprido</option>
                  </select>
                ) : (
                  <input className="input num" inputMode="numeric" disabled={!canEdit} value={draft[k]} onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')))} />
                )}
              </Field>
            );
          })}
        </div>
        {canEdit ? (
          <div className="row mt">
            <button className="btn btn-primary" disabled={!changes.length} onClick={() => setConfirm(true)}>Salvar como nova versão</button>
            {changes.length > 0 && <button className="btn btn-ghost" onClick={() => setDraft(Object.fromEntries(ORDER.map((k) => [k, current[k]])))}>Descartar</button>}
          </div>
        ) : <p className="xs muted mt">Somente a professora altera as regras do método.</p>}
      </Card>

      <Card title="Histórico de versões" icon={History} subtitle="Versões usadas nunca são alteradas nem apagadas." pad={false}>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Versão</th><th>Quando</th><th>Por</th>{ORDER.slice(0, 3).map((k) => <th key={k} className="r">{SHORT[k]}</th>)}<th className="hide-mobile">Motivo</th></tr></thead>
            <tbody>
              {d.versions.map((v) => (
                <tr key={v.version}>
                  <td><b>v{v.version}</b>{v.version === current.version && <span className="tag good" style={{ marginLeft: 6 }}>vigente</span>}</td>
                  <td className="small">{fmtDateTime(v.created_at)}</td>
                  <td className="small">{v.created_by_name || 'Sistema'}</td>
                  {ORDER.slice(0, 3).map((k) => <td key={k} className="r num">{fmtVal(k, v.params[k])}</td>)}
                  <td className="small hide-mobile">{v.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canEdit && <ConfigCard />}
      {canEdit && <BrandingCard />}
      {canEdit && <TermsCard />}

      {confirm && (
        <Modal title="Confirmar nova versão das regras" onClose={() => setConfirm(false)}
          footer={<><button className="btn" onClick={() => setConfirm(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy || reason.trim().length < 3} onClick={save}>{busy ? 'Salvando…' : `Criar versão v${current.version + 1}`}</button></>}>
          <div className="stack-sm">
            {changes.map((k) => <div key={k} className="row between small"><span>{SHORT[k]}</span><span className="num"><s className="muted">{fmtVal(k, current[k])}</s> → <b>{fmtVal(k, draft[k])}</b></span></div>)}
          </div>
          <Alert tone="warning"><span>Vale para <b>novas revisões</b> de todos os alunos a partir de agora. Revisões e consolidações já registradas continuam com a regra da época.</span></Alert>
          <Field label="Motivo da alteração (obrigatório)"><input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: turma avançada — exigir mais questões por revisão" /></Field>
          {err && <div className="error-box">{err}</div>}
        </Modal>
      )}
    </div>
  );
}

/** Recursos opcionais e réguas do Bônus de Execução (valores a validar com a Pollyana). */
function ConfigCard() {
  const toast = useToast();
  const state = useAsync(() => api.get('/teacher/config'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const cfg = state.data?.config;
  const v = f || (cfg ? {
    route_adjust_enabled: !!cfg.route_adjust_enabled, faco_questao_url: cfg.faco_questao_url || '',
    constancy_weeks: cfg.bonus.constancy_weeks, pacto_min_minutes: cfg.bonus.pacto_min_minutes, questions_goal: cfg.bonus.questions_goal, plan_pct: cfg.bonus.plan_pct, valid_days: cfg.bonus.valid_days,
    bronze: cfg.bonus.values_cents.bronze / 100, prata: cfg.bonus.values_cents.prata / 100, ouro: cfg.bonus.values_cents.ouro / 100,
    subject_accuracy_min: cfg.credibility.subject_accuracy_min,
  } : null);
  const num = (k) => (e) => setF({ ...v, [k]: e.target.value === '' ? '' : Number(e.target.value.replace(/\D/g, '')) });
  const save = async () => {
    setBusy(true);
    try {
      await api.put('/teacher/config', {
        route_adjust_enabled: v.route_adjust_enabled, faco_questao_url: v.faco_questao_url,
        bonus: { constancy_weeks: v.constancy_weeks, pacto_min_minutes: v.pacto_min_minutes, questions_goal: v.questions_goal, plan_pct: v.plan_pct, valid_days: v.valid_days,
          values_cents: { bronze: v.bronze * 100, prata: v.prata * 100, ouro: v.ouro * 100 } },
        credibility: { subject_accuracy_min: v.subject_accuracy_min },
      });
      toast.success('Configurações salvas.'); setF(null); await state.reload({ silent: true });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Recursos e Bônus de Execução" icon={SlidersHorizontal} subtitle="Liga/desliga o Ajuste de Rota, link das questões e réguas do bônus da consultoria.">
      {!v ? <div className="skeleton" style={{ height: 160 }} /> : (
        <div className="stack">
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={v.route_adjust_enabled} onChange={(e) => setF({ ...v, route_adjust_enabled: e.target.checked })} />
            <span><b>Ajuste de Rota quinzenal</b> <span className="muted small">(aba aparece para os alunos)</span></span>
          </label>
          <Field label="Link da plataforma de questões (Faço Questão de Farmácia)"><input className="input" type="url" value={v.faco_questao_url} onChange={(e) => setF({ ...v, faco_questao_url: e.target.value })} placeholder="https://" /></Field>
          <div className="grid g3">
            <Field label="Semanas válidas de 4 (constância)"><input className="input num" inputMode="numeric" value={v.constancy_weeks} onChange={num('constancy_weeks')} /></Field>
            <Field label="Pacto mínimo para a semana valer (minutos)"><input className="input num" inputMode="numeric" value={v.pacto_min_minutes} onChange={num('pacto_min_minutes')} /></Field>
            <Field label="Meta de questões"><input className="input num" inputMode="numeric" value={v.questions_goal} onChange={num('questions_goal')} /></Field>
            <Field label="Plano de ação cumprido (%)"><input className="input num" inputMode="numeric" value={v.plan_pct} onChange={num('plan_pct')} /></Field>
            <Field label="Validade do bônus (dias)"><input className="input num" inputMode="numeric" value={v.valid_days} onChange={num('valid_days')} /></Field>
            <Field label="Bronze (R$)"><input className="input num" inputMode="numeric" value={v.bronze} onChange={num('bronze')} /></Field>
            <Field label="Prata (R$)"><input className="input num" inputMode="numeric" value={v.prata} onChange={num('prata')} /></Field>
            <Field label="Ouro (R$)"><input className="input num" inputMode="numeric" value={v.ouro} onChange={num('ouro')} /></Field>
            <Field label="Amostra mínima por matéria (análise)"><input className="input num" inputMode="numeric" value={v.subject_accuracy_min} onChange={num('subject_accuracy_min')} /></Field>
          </div>
          <p className="xs muted">Os valores iniciais são sugestões: valide as réguas com a Pollyana antes de usar com alunos reais.</p>
          <div className="row"><button className="btn btn-primary" disabled={!f || busy} onClick={save}>Salvar</button></div>
        </div>
      )}
    </Card>
  );
}

/** Identidade visual do ambiente: nome exibido, cor principal e logotipo (tela de login e menu). */
function BrandingCard() {
  const toast = useToast();
  const { refresh } = useAuth();
  const state = useAsync(() => api.get('/teacher/branding'), []);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const b = state.data?.branding;
  const v = f || (b ? { display_name: b.display_name || b.name, primary_color: b.primary_color || '#003778', renew_url: b.renew_url || '', coordinator_whatsapp: b.coordinator_whatsapp || '' } : null);
  const save = async (patch) => {
    setBusy(true);
    try { await api.put('/teacher/branding', patch); toast.success('Identidade visual atualizada.'); setF(null); await state.reload({ silent: true }); await refresh(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <Card title="Identidade visual" icon={Palette} subtitle="Aparece na tela de login, no menu e nos relatórios dos seus alunos.">
      {!v ? <div className="skeleton" style={{ height: 120 }} /> : (
        <div className="grid g3" style={{ alignItems: 'end' }}>
          <Field label="Nome exibido"><input className="input" value={v.display_name} onChange={(e) => setF({ ...v, display_name: e.target.value })} /></Field>
          <Field label="Cor principal">
            <div className="row" style={{ gap: 8 }}>
              <input type="color" value={v.primary_color} onChange={(e) => setF({ ...v, primary_color: e.target.value })} aria-label="Escolher cor" style={{ width: 44, height: 40, border: 0, background: 'none', padding: 0 }} />
              <input className="input num" value={v.primary_color} onChange={(e) => setF({ ...v, primary_color: e.target.value })} />
            </div>
          </Field>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={!f || busy} onClick={() => save({ display_name: v.display_name, primary_color: v.primary_color, renew_url: v.renew_url || null, coordinator_whatsapp: v.coordinator_whatsapp || null })}>Salvar</button>
          </div>
          <Field label="Link de renovação" hint="Botão 'Renovar meu acesso' que o aluno vê quando o período encerra (página de venda ou checkout)."><input className="input" type="url" placeholder="https://" value={v.renew_url} onChange={(e) => setF({ ...v, renew_url: e.target.value })} /></Field>
          <Field label="WhatsApp da coordenação" hint="Só números com DDD. Usado nos botões de contato."><input className="input" value={v.coordinator_whatsapp} onChange={(e) => setF({ ...v, coordinator_whatsapp: e.target.value })} /></Field>
          <Field label="Logotipo" hint="PNG, JPG ou WEBP de até 2 MB. Prefira fundo transparente.">
            <div className="row wrap" style={{ gap: 10 }}>
              {b?.logo_url && <img src={`${b.logo_url}?v=${b.logo_file_id}`} alt="Logotipo atual" style={{ height: 40, maxWidth: 160, objectFit: 'contain', background: 'var(--surface-2)', borderRadius: 8, padding: 4 }} />}
              <label className="btn btn-sm"><Upload size={15} aria-hidden="true" />{b?.logo_url ? 'Trocar logotipo' : 'Enviar logotipo'}
                <input type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  try { const r = await api.upload('/files?purpose=logo', file); await save({ logo_file_id: r.file.id }); } catch (err) { toast.error(err); }
                }} />
              </label>
              {b?.logo_url && <button className="btn btn-ghost btn-sm" onClick={() => save({ logo_file_id: null })}>Remover</button>}
            </div>
          </Field>
        </div>
      )}
    </Card>
  );
}

/** Termos de uso: texto versionado, PDF gerado, link do Drive e quantos alunos já aceitaram cada versão. */
function TermsCard() {
  const toast = useToast();
  const state = useAsync(() => api.get('/teacher/terms'), []);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title="Termos de uso e privacidade" icon={FileText} subtitle="Cada versão nova precisa ser aceita de novo por todos os alunos (registramos versão, data, hora e IP)."
      action={<button className="btn btn-sm" onClick={() => setEdit({ title: state.data.current.title, body: state.data.current.body, drive_url: state.data.current.drive_url || '' })} disabled={!state.data}>Publicar nova versão</button>}>
      <Async state={state}>{(d) => (
        <div className="stack-sm">
          {d.documents.map((t) => (
            <div key={t.id} className="row between wrap" style={{ gap: 8 }}>
              <span><b>Versão {t.version}</b> <span className="muted small">· {fmtDateTime(t.created_at)} · {t.accepted} de {d.active_students} alunos aceitaram</span></span>
              <span className="row" style={{ gap: 8 }}>
                <a className="btn btn-sm btn-ghost" href={`/api/teacher/terms/${t.id}/pdf`} target="_blank" rel="noopener noreferrer">PDF</a>
                {t.drive_url && <a className="btn btn-sm btn-ghost" href={t.drive_url} target="_blank" rel="noopener noreferrer">Drive</a>}
              </span>
            </div>
          ))}
        </div>
      )}</Async>
      {edit && (
        <Modal title="Publicar nova versão dos termos" wide onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy || edit.body.trim().length < 200} onClick={async () => {
            setBusy(true);
            try { await api.post('/teacher/terms', { title: edit.title, body: edit.body, drive_url: edit.drive_url || null }); toast.success('Nova versão publicada. Os alunos vão precisar aceitar.'); setEdit(null); await state.reload({ silent: true }); } catch (e) { toast.error(e); } finally { setBusy(false); }
          }}>Publicar versão</button></>}>
          <Alert tone="warning">Ao publicar, todos os alunos precisarão aceitar novamente no próximo acesso. Peça uma revisão jurídica do texto antes de publicar.</Alert>
          <Field label="Título"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Link do Drive (opcional)"><input className="input" type="url" value={edit.drive_url} onChange={(e) => setEdit({ ...edit, drive_url: e.target.value })} placeholder="https://drive.google.com/…" /></Field>
          <Field label="Texto"><textarea className="input" rows={14} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
        </Modal>
      )}
    </Card>
  );
}
