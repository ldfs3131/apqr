import { useEffect, useState } from 'react';
import CadastroEditor from '../components/CadastroEditor.jsx';
import { InstallButton, ReviseCard } from '../components/Brand.jsx';
import { usePwaInstall } from '../lib/pwa.js';
import { THEMES, useTheme } from '../lib/theme.js';
import { api } from '../lib/api.js';
import { useAuth, useToast } from '../lib/store.jsx';
import { Page } from '../components/Layout.jsx';
import { Download } from 'lucide-react';
import { ApqrLegend, Avatar, Card, Field } from '../components/ui.jsx';
import { STATUS, STATUSES } from '../lib/format.js';

export default function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ name: user.name, phone: user.phone || '', goal: user.goal || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const { pref: theme, set: applyTheme } = useTheme();
  return (
    <Page title="Perfil">
      <div className="grid g2">
        <Card title="Seus dados">
          <div className="stack">
            {user.role !== 'student' && <Field label="Nome"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>}
            {user.role === 'student' && <PhotoField user={user} onChanged={async () => { try { setUser((await api.get('/auth/me')).user); } catch { /* ignora */ } }} />}
            <Field label="E-mail"><input className="input" value={user.email} disabled /></Field>
            {user.role === 'student' && <StudentCadastro onSaved={async () => { try { setUser((await api.get('/auth/me')).user); } catch { /* ignora */ } }} />}
            {user.role !== 'student' && <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={async () => {
              try { const r = await api.patch('/auth/profile', { name: f.name }); setUser(r.user); toast.success('Perfil salvo.'); } catch (e) { toast.error(e); }
            }}>Salvar</button>}
          </div>
        </Card>
        <div className="stack">
          <Card title="Alterar senha">
            <div className="stack">
              <Field label="Senha atual"><input className="input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
              <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números."><input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
              <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!pw.current_password || pw.new_password.length < 8} onClick={async () => {
                try { await api.post('/auth/change-password', pw); toast.success('Senha alterada.'); setPw({ current_password: '', new_password: '' }); } catch (e) { toast.error(e); }
              }}>Alterar senha</button>
            </div>
          </Card>
          <Card title="Aplicativo">
            <p className="small ink2">Instale o APQR na tela inicial do celular ou do computador: abre mais rápido e em tela cheia.</p>
            <div className="mt-sm"><InstallButton className="btn btn-primary btn-sm" /><InstalledNote /></div>
          </Card>
          <Card title="Aparência">
            <div className="theme-grid" role="radiogroup" aria-label="Aparência">
              {THEMES.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={theme === t.value} className={`theme-card ${theme === t.value ? 'on' : ''}`} onClick={() => applyTheme(t.value)}>
                  <span className={`theme-preview sw-${t.value}`} aria-hidden="true"><i /><b /></span>
                  <span className="theme-card-label">{t.label}</span>
                  <span className="theme-card-hint">{t.hint}</span>
                </button>
              ))}
            </div>
          </Card>
          {user.role === 'student' && (
            <Card title="Seus dados (LGPD)">
              <p className="small ink2">Baixe uma cópia de todos os seus dados e registros de estudo. Para corrigir CPF ou endereço, ou pedir a exclusão da conta, fale com a sua professora.</p>
              <div className="kv small mt-sm"><span className="muted">CPF</span><span>{user.cpf || '—'}</span><span className="muted">Cidade</span><span>{user.city ? `${user.city}/${user.state}` : '—'}</span></div>
              <a className="btn btn-sm mt" href="/api/me/export" download><Download size={15} aria-hidden="true" />Baixar meus dados</a>
            </Card>
          )}
        </div>
      </div>
      <div className="mt"><ReviseCard /></div>
      <Card title="O método APQR" className="mt">
        <ApqrLegend />
        <div className="stack-sm mt small ink2">
          {STATUSES.map((s) => <div key={s} className="row" style={{ gap: 8, alignItems: 'baseline' }}><span className={`dot bg-${s}`} aria-hidden="true" /><span><b>{STATUS[s].label}:</b> {STATUS[s].desc}</span></div>)}
        </div>
      </Card>
    </Page>
  );
}

function InstalledNote() {
  const { standalone, available } = usePwaInstall();
  if (standalone) return <span className="small muted">Você já está usando o aplicativo instalado.</span>;
  if (!available) return <span className="small muted">Para instalar, abra esta página no Chrome (Android ou computador) ou no Safari (iPhone).</span>;
  return null;
}

function StudentCadastro({ onSaved }) {
  const [data, setData] = useState(null);
  const load = () => api.get('/me/cadastro').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const c = data.cadastro;
  const fmtBirth = c.birth_date ? c.birth_date.split('-').reverse().join('/') : '—';
  return (
    <>
      <dl className="kv small">
        <dt>Nome</dt><dd>{c.name}</dd>
        <dt>Celular</dt><dd>{c.phone ? c.phone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3') : '—'}</dd>
        <dt>Nascimento</dt><dd>{fmtBirth}</dd>
        <dt>Endereço</dt><dd>{[c.address_line, c.address_number, c.district, c.city && `${c.city}/${c.state}`].filter(Boolean).join(', ') || '—'}</dd>
        <dt>Objetivo</dt><dd>{c.goal || '—'}</dd>
      </dl>
      <CadastroEditor initial={c} editable={data.editable} endpoint="/me/cadastro" onSaved={() => { load(); onSaved?.(); }} />
    </>
  );
}

function PhotoField({ user, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('A foto deve ter até 2 MB (PNG, JPG ou WEBP).'); return; }
    setBusy(true);
    try { await api.upload('/me/photo', file); toast.success('Foto atualizada.'); await onChanged(); } catch (err) { toast.error(err); } finally { setBusy(false); }
  };
  return (
    <Field label="Foto de perfil" hint="Uso interno: só você e a equipe da mentoria veem. Não aparece para outros alunos. PNG, JPG ou WEBP, até 2 MB.">
      <div className="row" style={{ gap: 14 }}>
        <Avatar name={user.name} size="lg" photo={user.photo_file_id} />
        <label className="btn btn-sm" style={{ cursor: 'pointer' }}>{busy ? 'Enviando…' : user.photo_file_id ? 'Trocar foto' : 'Enviar foto'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} disabled={busy} /></label>
        {user.photo_file_id && <button type="button" className="btn btn-sm btn-ghost" onClick={async () => { try { await api.del('/me/photo'); await onChanged(); toast.info('Foto removida.'); } catch (err) { toast.error(err); } }}>Remover</button>}
      </div>
    </Field>
  );
}
