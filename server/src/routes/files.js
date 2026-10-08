/**
 * Arquivos: envio (professora) e download (com checagem de ambiente e permissão).
 * Aluno só baixa arquivo ligado a um conteúdo PUBLICADO do próprio ambiente.
 */
import express, { Router } from 'express';
import fs from 'node:fs';
import { tx } from '../db/index.js';
import { requireAuth, requireRole, isTeacher } from '../security/auth.js';
import { audit } from '../security/access.js';
import { ah, badRequest, forbidden, notFound, nowIso, parseId } from '../lib/util.js';
import { detectType, isImage, pathFor, safeName, saveBuffer } from '../lib/storage.js';
import { watermarkPdf } from '../lib/watermark.js';

const r = Router();
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

r.post('/', requireRole('teacher', 'coordinator', 'mentor'), express.raw({ type: () => true, limit: MAX_FILE_BYTES }), ah(async (req, res) => {
  if (!isTeacher(req.ctx)) throw forbidden('Somente a professora envia arquivos.');
  const purpose = req.query.purpose === 'logo' ? 'logo' : 'content';
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw badRequest('Arquivo vazio.');
  const name = safeName(req.query.name);
  const type = detectType(buf, name);
  if (!type) throw badRequest('Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG, WEBP) ou documento do Office (DOCX, PPTX, XLSX).');
  if (purpose === 'logo' && (!isImage(type.mime) || buf.length > MAX_LOGO_BYTES)) throw badRequest('O logotipo deve ser PNG, JPG ou WEBP de até 2 MB.');
  const saved = await saveBuffer(buf);
  const file = await tx(req.ctx, async (d) => {
    const row = await d.one(
      `INSERT INTO files (tenant_id, owner_user_id, purpose, original_name, mime, size_bytes, storage_key, sha256, created_at)
       VALUES (?,?,?,?,?,?,?,?,?) RETURNING id, purpose, original_name, mime, size_bytes, created_at`,
      [req.ctx.tenantId, req.ctx.userId, purpose, name, type.mime, buf.length, saved.key, saved.sha256, nowIso()]
    );
    await audit(d, req.ctx, 'file.upload', { targetType: 'file', targetId: row.id, payload: { purpose, mime: type.mime, bytes: buf.length } });
    return row;
  });
  res.status(201).json({ file });
}));

/** Envia o arquivo com cabeçalhos seguros (sem execução de conteúdo no navegador). */
export function sendStoredFile(res, f, { cache = 'private, max-age=300' } = {}) {
  const p = pathFor(f.storage_key);
  if (!fs.existsSync(p)) throw notFound('Arquivo não encontrado.');
  const inline = f.mime === 'application/pdf' || isImage(f.mime);
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Length', f.size_bytes);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', cache);
  fs.createReadStream(p).pipe(res);
}

r.get('/:id', requireAuth, ah(async (req, res) => {
  const id = parseId(req.params.id, 'arquivo');
  const f = await tx(req.ctx, async (d) => {
    const row = await d.one('SELECT * FROM files WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw notFound('Arquivo não encontrado.');
    if (req.ctx.role === 'student') {
      const ok = (row.purpose === 'photo' && row.owner_user_id === req.ctx.userId) || await d.one('SELECT 1 FROM content_items WHERE file_id = ? AND published AND archived_at IS NULL AND (cohort IS NULL OR cohort = (SELECT cohort FROM students WHERE id = ?))', [id, req.ctx.studentId]);
      if (!ok) throw notFound('Arquivo não encontrado.');
    }
    return row;
  });
  // PDF aberto por aluno: marca d'água discreta com o nome dele (desencoraja o compartilhamento do material).
  if (req.ctx.role === 'student' && f.mime === 'application/pdf' && fs.existsSync(pathFor(f.storage_key))) {
    const out = await watermarkPdf(fs.readFileSync(pathFor(f.storage_key)), `${req.user.name} · ${req.user.email}`);
    if (out) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', out.length);
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.original_name)}`);
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
      res.setHeader('Cache-Control', 'private, no-store');
      return res.end(out);
    }
  }
  sendStoredFile(res, f, f.purpose === 'photo' ? { cache: 'private, max-age=60' } : undefined);
}));

export default r;
