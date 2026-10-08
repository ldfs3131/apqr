import { useEffect, useState } from 'react';
import { Download, Lock, LogOut, PauseCircle, RotateCcw } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/store.jsx';
import { fmtDate, fmtDur } from '../lib/format.js';
import { BrandLogo } from '../components/Brand.jsx';
import { Card, Loading } from '../components/ui.jsx';
import { MedalDot, brl } from './Consultoria.jsx';
import { STATUS, STATUSES } from '../lib/format.js';

/** Tela única para aluno com período encerrado ou plano pausado. O servidor bloqueia o restante. */
export default function AccessEnded() {
  const { user, logout } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/me/access').then((r) => setD(r.access)).catch(() => setD(false)); }, []);
  if (d === null) return <Loading />;
  const paused = user.access_state === 'paused';
  const brand = user.tenant?.brand || {};
  const total = (d?.colors || []).reduce((a, c) => a + c.n, 0);
  const byStatus = Object.fromEntries((d?.colors || []).map((c) => [c.status, c.n]));
  return (
    <div className="auth-wrap" style={{ display: 'block', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 48px' }}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <BrandLogo forceVariant="form" />
          <button className="btn btn-sm btn-ghost" onClick={logout}><LogOut size={15} aria-hidden="true" />Sair</button>
        </div>
        <Card>
          <div className="stack">
            <div className="row" style={{ gap: 10 }}>
              {paused ? <PauseCircle size={28} aria-hidden="true" /> : <Lock size={28} aria-hidden="true" />}
              <h1 style={{ margin: 0 }}>{paused ? 'Seu plano está pausado' : 'Seu período de acesso encerrou'}</h1>
            </div>
            <p className="ink2">
              {paused
                ? `Seus estudos estão guardados e voltam exatamente de onde pararam${d?.paused_since ? ` (pausado desde ${fmtDate(d.paused_since)})` : ''}. Quando a equipe retomar o plano, o tempo parado é somado ao seu período.`
                : `Olá, ${user.name.split(' ')[0]}! Você chegou até aqui, e tudo o que construiu continua guardado. Veja o que conquistou:`}
            </p>
            {d && (
              <div className="grid g2 ended-tiles">
                <div className="rc"><b>{fmtDur(d.totals.seconds)}</b><span>horas estudadas</span></div>
                <div className="rc"><b>{d.totals.questions.toLocaleString('pt-BR')}</b><span>questões resolvidas</span></div>
                <div className="rc"><b>{d.totals.consolidated}</b><span>tópicos consolidados</span></div>
                <div className="rc"><b>{d.totals.started}</b><span>tópicos iniciados</span></div>
              </div>
            )}
            {d && total > 0 && (
              <div>
                <div className="xs muted" style={{ marginBottom: 6 }}>Edital em cores (miniatura)</div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="pill-stat"><i className="dot-lg bg-not_started" /> {byStatus.not_started || 0} não iniciados</span>
                  <span className="pill-stat"><i className="dot-lg bg-production" /> {(byStatus.assimilation || 0) + (byStatus.production || 0)} em andamento</span>
                  <span className="pill-stat"><i className="dot-lg bg-review" /> {byStatus.review || 0} em questões/revisão</span>
                  <span className="pill-stat"><i className="dot-lg bg-consolidated" /> {byStatus.consolidated || 0} consolidados</span>
                </div>
              </div>
            )}
            {!paused && (
              <div className="stack-sm">
                {brand.renew_url
                  ? <a className="btn btn-primary btn-lg" style={{ justifyContent: 'center' }} href={brand.renew_url} target="_blank" rel="noopener noreferrer"><RotateCcw size={18} aria-hidden="true" />Renovar meu acesso</a>
                  : <p className="small ink2">Para renovar, fale com a equipe da sua professora.</p>}
                {d?.ends_on && <p className="xs muted">Seu último período terminou em {fmtDate(d.ends_on)}.</p>}
              </div>
            )}
            {!paused && d?.bonus && !d.bonus.applied && !d.bonus.expired && (
              <div className="bonus-gold">
                <MedalDot color="#d4a62a" size={46} />
                <div>
                  <b>Bônus da consultoria · Medalha {d.bonus.medal_label}</b>
                  <div className="small"><b>{brl(d.bonus.discount_cents)} de desconto na renovação, válido até {fmtDate(d.bonus.valid_until)}.</b></div>
                  <div className="xs" style={{ marginTop: 4 }}>O bônus é um desconto na renovação, não vale dinheiro.</div>
                </div>
              </div>
            )}
            <div>
              <div className="bold small" style={{ marginBottom: 6 }}>Recursos bloqueados</div>
              <div className="grid g3 locked-tiles">
                {['Estudar', 'Materiais', 'Cursos'].map((x) => <div key={x} className="locked-tile" title="Disponível com o acesso ativo"><Lock size={16} aria-hidden="true" />{x}</div>)}
              </div>
            </div>
            <a className="small" href="/api/me/export" download><Download size={14} aria-hidden="true" /> Baixar meus dados</a>
          </div>
        </Card>
      </div>
    </div>
  );
}
