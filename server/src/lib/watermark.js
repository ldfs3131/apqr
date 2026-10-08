import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const latin = (s) => String(s).replace(/[^\x20-\x7E -ÿ]/g, '?');

/** Marca d'água diagonal discreta + rodapé em todas as páginas. Se o PDF não puder ser lido (ex.: protegido), devolve null. */
export async function watermarkPdf(buffer, text) {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const t = latin(text).slice(0, 90);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const size = Math.max(14, Math.min(width, height) / 22);
      const w = font.widthOfTextAtSize(t, size);
      page.drawText(t, { x: width / 2 - (w / 2) * Math.cos(Math.PI / 5), y: height / 2 - (w / 2) * Math.sin(Math.PI / 5), size, font, color: rgb(0.5, 0.5, 0.5), opacity: 0.16, rotate: degrees(36) });
      page.drawText(t, { x: 24, y: 12, size: 7, font, color: rgb(0.45, 0.45, 0.45), opacity: 0.7 });
    }
    return Buffer.from(await doc.save());
  } catch {
    return null;
  }
}
