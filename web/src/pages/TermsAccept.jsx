import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/store.jsx';
import { BrandLogo } from '../components/Brand.jsx';
import { Card, Loading } from '../components/ui.jsx';
import { homeFor } from './Auth.jsx';

/** Novos termos publicados: o aluno lê e aceita (versão, data/hora e IP ficam registrados). */
export default function TermsAccept() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get('/me/terms').then((r) => setT(r.terms)).catch(() => setT(false)); }, []);
  if (t === null) return <Loading />;
  if (t === false) return <Card><p>Não foi possível carregar os termos. Tente novamente.</p></Card>;
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div className="row between" style={{ marginBottom: 16 }}><BrandLogo forceVariant="form" /><button className="btn btn-sm btn-ghost" onClick={logout}>Sair</button></div>
        <Card title={t.title} subtitle={`Versão ${t.version} — leia e aceite para continuar`}>
          <div style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflowY: 'auto' }} className="small">{t.body}</div>
          <div className="row wrap mt" style={{ gap: 12 }}>
            <a className="small" href="/api/me/terms/pdf" target="_blank" rel="noopener noreferrer"><Download size={14} aria-hidden="true" /> Baixar em PDF</a>
            {t.drive_url && <a className="small" href={t.drive_url} target="_blank" rel="noopener noreferrer">Abrir no Drive</a>}
          </div>
          <label className="check small mt"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>Li e aceito os termos de uso e a política de privacidade (versão {t.version}).</span></label>
          <button className="btn btn-primary mt" disabled={!ok || busy} onClick={async () => {
            setBusy(true);
            try { await api.post('/me/terms/accept', { version: t.version }); const me = await api.get('/auth/me'); setUser(me.user); nav(homeFor(me.user), { replace: true }); } catch (e) { toast.error(e); } finally { setBusy(false); }
          }}>Aceitar e continuar</button>
        </Card>
      </div>
    </div>
  );
}
