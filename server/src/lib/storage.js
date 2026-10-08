/**
 * Armazenamento de arquivos enviados (materiais da área "Estudar com IA" e logotipos).
 * Local em disco (FILES_DIR, padrão ./data/files). Os arquivos NUNCA ficam numa pasta pública:
 * só saem pela API, que confere ambiente e permissão. Para nuvem (S3/R2), trocar só este módulo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const filesDir = () => path.resolve(process.env.FILES_DIR || 'data/files');

export async function saveBuffer(buf) {
  const key = randomUUID();
  const dir = path.join(filesDir(), key.slice(0, 2));
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, key), buf, { flag: 'wx' });
  return { key, sha256: createHash('sha256').update(buf).digest('hex') };
}

export function pathFor(key) {
  if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error('chave inválida');
  return path.join(filesDir(), key.slice(0, 2), key);
}

/** Tipos aceitos, identificados pelos BYTES do arquivo (não pela extensão informada). */
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
const OFFICE = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function detectType(buf, originalName = '') {
  for (const s of SIGNATURES) if (buf.length > 12 && s.test(buf)) return { mime: s.mime, ext: s.ext };
  const ext = String(originalName).toLowerCase().split('.').pop();
  // Office moderno é um ZIP (PK..); aceitamos só com a extensão correspondente.
  if (buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && OFFICE[ext]) return { mime: OFFICE[ext], ext };
  return null;
}

export const isImage = (mime) => mime.startsWith('image/');
export const safeName = (name) => String(name || 'arquivo').replace(/[\r\n"\\/]/g, '').replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 120) || 'arquivo';
