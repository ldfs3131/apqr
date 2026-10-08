import { useState } from 'react';
import { Check, Download, ExternalLink, Palette, PlaySquare, Share, SquarePlus, X } from 'lucide-react';
import { BRAND, COPYRIGHT, MAKER, REVISE } from '../lib/brand.js';
import { dismissFor, dismissedRecently, usePwaInstall } from '../lib/pwa.js';
import { getActingTenant, useAuth } from '../lib/store.jsx';
import { Modal } from './ui.jsx';
import { THEMES, useTheme } from '../lib/theme.js';

/** Logo e nome do ambiente: o logo enviado pelo ambiente vence; senão, a marca padrão (Pollyana Lyra). */
export function useBrandInfo(tenantOverride) {
  const { user } = useAuth();
  const tenant = tenantOverride || getActingTenant() || user?.tenant;
  const custom = tenant?.brand?.logo_file_id && tenant?.slug ? `/api/public/logo/${tenant.slug}` : null;
  return { logo: custom || BRAND.logo, custom: Boolean(custom), name: tenant?.brand?.display_name || BRAND.name };
}

/** Logo do ambiente. Logo próprio enviado pelo ambiente: uma só imagem sobre base branca. Marca padrão: versão colorida (tema Claro) e branca (Tradicional/Escuro), trocadas por CSS. */
export function BrandLogo({ className = '', tenant, forceVariant }) {
  const { logo, custom, name } = useBrandInfo(tenant);
  if (custom) return <img className={`brand-logo custom ${className}`} src={logo} alt={name} />;
  return (
    <span className={`brand-logo-pair ${forceVariant || ''} ${className}`}>
      <img className="logo-color" src={BRAND.logo} alt={name} />
      <img className="logo-white" src={BRAND.logoWhite} alt="" aria-hidden="true" />
    </span>
  );
}

/** Símbolo da marca (cruz) — usado em cabeçalhos pequenos. */
export function BrandSymbol({ size = 38 }) {
  return <img className="brand-symbol" src={BRAND.symbol} alt="" width={size} height={size} style={{ width: size, height: size }} />;
}

/** Assinatura discreta da ONE UP. tone: 'on-dark' (fundo azul/escuro) | 'on-light'. */
export function OneUpSignature({ tone = 'on-light', compact = false, className = '' }) {
  const h = compact ? 16 : 20;
  return (
    <div className={`oneup-sig ${tone} ${compact ? 'compact' : ''} ${className}`} title={`Método APQR · v${MAKER.version} · plataforma desenvolvida pela ${MAKER.name}`}>
      <span className="oneup-sig-by">Desenvolvido por</span>
      {tone === 'adaptive' ? (
        <span className="sig-pair">
          <img className="sig-on-dark" src={MAKER.logoOnDark} alt={MAKER.name} height={h} />
          <img className="sig-on-light" src={MAKER.logoOnLight} alt="" aria-hidden="true" height={h} />
        </span>
      ) : <img src={tone === 'on-dark' ? MAKER.logoOnDark : MAKER.logoOnLight} alt={MAKER.name} height={h} />}
      {!compact && <span className="oneup-sig-rights">{COPYRIGHT}</span>}
      {compact && <span className="oneup-sig-rights">Todos os direitos reservados</span>}
    </div>
  );
}

/** Divulgação do canal Revise Farmácia. dismissible: o aluno pode dispensar por 30 dias. */
export function ReviseCard({ dismissible = false }) {
  const [gone, setGone] = useState(() => dismissible && dismissedRecently('apqr.revise.dismissed', 30));
  if (gone) return null;
  return (
    <aside className="revise-card" aria-label="Canal Revise Farmácia">
      <span className="revise-plate"><img src={REVISE.logo} alt="" width={52} height={52} /></span>
      <div className="revise-text">
        <b>{REVISE.name}</b>
        <span>O canal da Prof. Pollyana no YouTube, com revisões e dicas para a sua prova.</span>
      </div>
      <a className="btn btn-sm" href={REVISE.url} target="_blank" rel="noopener noreferrer"><PlaySquare size={15} aria-hidden="true" />Conhecer o canal<ExternalLink size={13} aria-hidden="true" /></a>
      {dismissible && <button className="btn btn-ghost icon-btn revise-x" aria-label="Dispensar aviso" onClick={() => { dismissFor('apqr.revise.dismissed'); setGone(true); }}><X size={16} /></button>}
    </aside>
  );
}

/** Link discreto para a tela de entrada. */
export function ReviseLink() {
  return <a className="revise-link" href={REVISE.url} target="_blank" rel="noopener noreferrer"><PlaySquare size={14} aria-hidden="true" />Conheça o canal {REVISE.name}</a>;
}

function IosGuide({ onClose }) {
  return (
    <Modal title="Instalar no iPhone" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Entendi</button>}>
      <ol className="install-steps">
        <li><span className="install-n">1</span><span>Abra esta página no <b>Safari</b>.</span></li>
        <li><span className="install-n">2</span><span>Toque em <b>Compartilhar</b> <Share size={16} aria-label="ícone de compartilhar" style={{ verticalAlign: '-3px' }} />, na barra do navegador.</span></li>
        <li><span className="install-n">3</span><span>Escolha <b>Adicionar à Tela de Início</b> <SquarePlus size={16} aria-label="ícone de adicionar" style={{ verticalAlign: '-3px' }} /> e confirme em <b>Adicionar</b>.</span></li>
        <li><span className="install-n">4</span><span>Pronto: abra pelo ícone <b>APQR</b> na tela inicial, em tela cheia, como um app.</span></li>
      </ol>
      <p className="small muted mt-sm">As notificações do iPhone só funcionam depois de instalar o app na tela inicial.</p>
    </Modal>
  );
}

/** Botão "Instalar aplicativo": instala com um toque (Android/computador) ou mostra o guia (iPhone). Some quando já instalado. */
export function InstallButton({ className = 'btn btn-sm', label = 'Instalar aplicativo', onDone }) {
  const pwa = usePwaInstall();
  const [guide, setGuide] = useState(false);
  if (!pwa.available) return null;
  const click = async () => {
    if (pwa.canPrompt) { const ok = await pwa.install(); if (ok) onDone?.(); } else setGuide(true);
  };
  return (
    <>
      <button type="button" className={className} onClick={click}><Download size={15} aria-hidden="true" />{label}</button>
      {guide && <IosGuide onClose={() => setGuide(false)} />}
    </>
  );
}

/** Aviso no primeiro acesso; o aluno pode dispensar por 14 dias. */
export function InstallBanner() {
  const pwa = usePwaInstall();
  const [gone, setGone] = useState(() => dismissedRecently('apqr.install.dismissed', 14));
  if (!pwa.available || gone) return null;
  return (
    <aside className="install-banner" aria-label="Instalar aplicativo">
      <span className="install-banner-icon"><BrandSymbol size={34} /></span>
      <div className="revise-text"><b>Tenha o APQR na tela inicial</b><span>Abra mais rápido e estude em tela cheia, como um aplicativo.</span></div>
      <InstallButton className="btn btn-sm btn-primary" onDone={() => setGone(true)} />
      <button className="btn btn-ghost icon-btn revise-x" aria-label="Dispensar aviso" onClick={() => { dismissFor('apqr.install.dismissed'); setGone(true); }}><X size={16} /></button>
    </aside>
  );
}

/** Aviso de falta de internet. */
export function OfflineBar({ online }) {
  if (online) return null;
  return <div className="offline-bar" role="status">Sem conexão com a internet. O que você vê pode estar desatualizado e novos registros não serão salvos até a conexão voltar.</div>;
}

/** Seletor de tema (Tradicional, Claro, Escuro, Automático). compact: só o ícone, abre uma lista. */
export function ThemeMenu({ className = '' }) {
  const { pref, set } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div className={`theme-menu ${className}`}>
      <button type="button" className="btn btn-ghost icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Escolher aparência" title="Aparência" onClick={() => setOpen((o) => !o)}><Palette size={18} /></button>
      {open && (
        <>
          <div className="theme-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-pop" role="menu" aria-label="Aparência">
            {THEMES.map((t) => (
              <button key={t.value} type="button" role="menuitemradio" aria-checked={pref === t.value} className={`theme-opt ${pref === t.value ? 'on' : ''}`} onClick={() => { set(t.value); setOpen(false); }}>
                <span className={`theme-swatch sw-${t.value}`} aria-hidden="true" />
                <span className="theme-opt-text"><b>{t.label}</b><span>{t.hint}</span></span>
                {pref === t.value && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
