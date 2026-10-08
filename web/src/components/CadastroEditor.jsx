import { useState } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/store.jsx';
import { Alert, Field, Modal } from './ui.jsx';

const FIELDS = [
  ['name', 'Nome completo'], ['email', 'E-mail (login)', 'email'], ['cpf', 'CPF'], ['phone', 'Celular (WhatsApp)'],
  ['birth_date', 'Data de nascimento', 'date'], ['postal_code', 'CEP'], ['address_line', 'Endereço'], ['address_number', 'Número'],
  ['address_complement', 'Complemento'], ['district', 'Bairro'], ['city', 'Cidade'], ['state', 'UF'], ['goal', 'Objetivo'],
];
const isoDate = (v) => (v ? String(v).slice(0, 10) : '');
const norm = (k, v) => (k === 'birth_date' ? isoDate(v) : (v ?? ''));

/**
 * Edição de cadastro com caixa de confirmação "antes → depois".
 * `initial`: dados atuais; `editable`: campos permitidos; `endpoint`: PATCH que aceita { fields, dry_run }.
 */
export default function CadastroEditor({ initial, editable, endpoint, onSaved, buttonLabel = 'Editar cadastro' }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({});
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const start = () => { setF(Object.fromEntries(FIELDS.filter(([k]) => editable.includes(k)).map(([k]) => [k, norm(k, initial[k])]))); setPreview(null); setOpen(true); };
  const diff = () => Object.fromEntries(Object.entries(f).filter(([k, v]) => String(v ?? '') !== String(norm(k, initial[k]) ?? '')));

  const review = async () => {
    const fields = diff();
    if (!Object.keys(fields).length) { toast.info('Nenhuma alteração.'); return; }
    setBusy(true);
    try { const r = await api.patch(endpoint, { fields, dry_run: true }); setPreview({ fields, changes: r.changes }); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await api.patch(endpoint, { fields: preview.fields }); toast.success('Dados atualizados.'); setOpen(false); onSaved?.(); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn btn-sm" onClick={start}><Pencil size={15} aria-hidden="true" />{buttonLabel}</button>
      {open && !preview && (
        <Modal title="Editar cadastro" onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy} onClick={review}>Revisar alterações</button></>}>
          <div className="grid g2">
            {FIELDS.filter(([k]) => editable.includes(k)).map(([k, label, type]) => (
              <Field key={k} label={label}><input className="input" type={type || 'text'} value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
            ))}
          </div>
        </Modal>
      )}
      {open && preview && (
        <Modal title="Confirmar alterações?" onClose={() => setPreview(null)}
          footer={<><button className="btn" onClick={() => setPreview(null)}>Voltar e corrigir</button><button className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Salvando…' : 'Sim, confirmar'}</button></>}>
          <Alert tone="info">Confira se a mudança foi intencional. Ela fica registrada com o valor anterior e o novo.</Alert>
          <div className="stack-sm mt">
            {preview.changes.map((c) => (
              <div key={c.field} className="card" style={{ padding: 10, boxShadow: 'none' }}>
                <div className="xs muted">{c.label}</div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <span className="small" style={{ textDecoration: 'line-through' }}>{c.from || '—'}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                  <b className="small">{c.to || '—'}</b>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
