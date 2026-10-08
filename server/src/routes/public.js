/** Rotas públicas (sem login): identidade visual do ambiente para a tela de login. */
import { Router } from 'express';
import { tx, SYSTEM } from '../db/index.js';
import { ah, notFound } from '../lib/util.js';
import { sendStoredFile } from './files.js';
import { currentTerms } from '../domain/termos.js';

const r = Router();

/**
 * Resolve o ambiente pelo subdomínio (professora.oneup.com.br) ou, na V2 com um único
 * ambiente, por DEFAULT_TENANT (slug) ou pelo único ambiente existente.
 */
export async function resolveTenantFromHost(host) {
  return tx(SYSTEM, async (d) => {
    const sub = String(host || '').split(':')[0].split('.')[0];
    let t = sub ? await d.one("SELECT id, slug, name, brand FROM tenants WHERE slug = ? AND status = 'active'", [sub]) : null;
    if (!t && process.env.DEFAULT_TENANT) t = await d.one("SELECT id, slug, name, brand FROM tenants WHERE slug = ? AND status = 'active'", [process.env.DEFAULT_TENANT]);
    if (!t) {
      const all = await d.all("SELECT id, slug, name, brand FROM tenants WHERE status = 'active' LIMIT 2");
      if (all.length === 1) t = all[0];
    }
    return t;
  });
}

r.get('/branding', ah(async (req, res) => {
  const t = await resolveTenantFromHost(req.get('host'));
  if (!t) return res.json({ tenant: null });
  res.json({
    tenant: {
      slug: t.slug,
      name: t.brand?.display_name || t.name,
      primary_color: t.brand?.primary_color || null,
      logo_url: t.brand?.logo_file_id ? `/api/public/logo/${t.slug}` : null,
    },
  });
}));

/** Termos vigentes (a tela de convite mostra o texto antes do aceite). */
r.get('/terms', ah(async (req, res) => {
  const t = await resolveTenantFromHost(req.get('host'));
  if (!t) throw notFound('Ambiente não encontrado.');
  const cur = await tx(SYSTEM, (d) => currentTerms(d, t.id));
  res.json({ terms: { version: cur.version, title: cur.title, body: cur.body, drive_url: cur.drive_url } });
}));

/** Logotipo público do ambiente (tela de login e menu). */
r.get('/logo/:slug', ah(async (req, res) => {
  const f = await tx(SYSTEM, async (d) => {
    const t = await d.one("SELECT id, brand FROM tenants WHERE slug = ? AND status = 'active'", [String(req.params.slug).slice(0, 60)]);
    const fid = t?.brand?.logo_file_id;
    if (!fid) return null;
    return d.one("SELECT * FROM files WHERE id = ? AND tenant_id = ? AND purpose = 'logo' AND deleted_at IS NULL", [fid, t.id]);
  });
  if (!f) throw notFound('Logotipo não encontrado.');
  sendStoredFile(res, f, { cache: 'public, max-age=3600' });
}));

export default r;
