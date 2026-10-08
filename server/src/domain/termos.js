/**
 * Termos de uso e política de privacidade: versionados por ambiente; o aceite guarda versão, data/hora e IP.
 * Uma nova versão exige novo aceite de todos os alunos. O PDF é gerado a partir do texto da versão (cópia guardada no sistema).
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { badRequest, forbidden, nowIso } from '../lib/util.js';
import { audit } from '../security/access.js';

export const DEFAULT_TITLE = 'Termos de Uso e Política de Privacidade';
export const DEFAULT_BODY = `1. Quem somos
Esta plataforma (Método APQR) é oferecida pela mentoria da Prof. Pollyana Lyra, em parceria com a ONE UP, para acompanhar os estudos de candidatos a concursos públicos.

2. O que você aceita ao usar a plataforma
Você usa a plataforma para registrar seus estudos, acompanhar seu edital, receber orientações e acessar materiais da mentoria. O acesso é pessoal e intransferível. Você não deve compartilhar sua senha, nem copiar, distribuir ou revender os materiais, que são protegidos por direitos autorais.

3. Dados que coletamos
Coletamos os dados que você informa (nome, e-mail, CPF, celular, data de nascimento, endereço e objetivo), os registros de estudo (horas, questões, revisões e conteúdos), a foto de perfil, quando você a enviar, e dados técnicos de acesso (data, hora e endereço de IP do aceite destes termos e dos acessos).

4. Para que usamos seus dados
Usamos seus dados para: criar e manter sua conta; acompanhar seu desempenho e orientar seus estudos; emitir comunicações sobre seu acesso, renovações e avisos da mentoria; cumprir obrigações legais e fiscais; e garantir a segurança da plataforma. A foto de perfil é de uso interno da equipe, apenas para identificar você.

5. Com quem compartilhamos
Seus dados ficam acessíveis à equipe da mentoria (professora, coordenação e administradores) conforme o perfil de cada pessoa. Outros alunos nunca veem seus dados nem seu desempenho. Podemos compartilhar dados com prestadores necessários à operação (hospedagem, pagamento e envio de e-mails), que seguem as mesmas regras de proteção. Não vendemos seus dados.

6. Seus direitos (LGPD)
Você pode, a qualquer momento, pedir acesso, correção, portabilidade, anonimização ou exclusão dos seus dados, e revogar consentimentos. Na própria plataforma você pode baixar uma cópia dos seus dados e corrigir seu cadastro. Para os demais pedidos, fale com a coordenação da mentoria.

7. Guarda e segurança
Mantemos seus dados enquanto sua conta existir e pelo prazo exigido por lei. Usamos conexão segura, controle de acesso por perfil, registro de auditoria e cópias de segurança.

8. Pagamentos, acesso e cancelamento
O período de acesso depende do plano contratado. Ao fim do período, o acesso é encerrado, e seus dados continuam guardados. Pausas e cancelamentos seguem as regras do plano contratado e as combinadas com a coordenação.

9. Alterações destes termos
Podemos atualizar estes termos. Quando isso acontecer, você verá o novo texto e precisará aceitá-lo para continuar usando a plataforma.

10. Contato
Dúvidas sobre estes termos ou sobre seus dados: fale com a coordenação da mentoria pelos canais oficiais.`;

/** Termo vigente do ambiente (cria a versão 1.0 padrão na primeira necessidade). */
export async function currentTerms(d, tenantId) {
  let t = await d.one('SELECT * FROM terms_documents WHERE tenant_id = ? ORDER BY created_at DESC, version DESC LIMIT 1', [tenantId]);
  if (!t) {
    t = await d.one(
      'INSERT INTO terms_documents (tenant_id, version, title, body, created_at) VALUES (?,?,?,?,?) RETURNING *',
      [tenantId, '1.0', DEFAULT_TITLE, DEFAULT_BODY, nowIso()]
    );
  }
  return t;
}

export async function hasAccepted(d, studentId, version) {
  return !!(await d.one('SELECT 1 AS x FROM terms_acceptances WHERE student_id = ? AND version = ?', [studentId, version]));
}

export async function recordAcceptance(d, { tenantId, studentId, ip }) {
  const t = await currentTerms(d, tenantId);
  const ts = nowIso();
  await d.run('INSERT INTO terms_acceptances (tenant_id, student_id, version, accepted_at, ip) VALUES (?,?,?,?,?) ON CONFLICT (student_id, version) DO NOTHING', [tenantId, studentId, t.version, ts, ip || null]);
  await d.run('UPDATE students SET terms_version = ?, terms_accepted_at = ? WHERE id = ?', [t.version, ts, studentId]);
  return t;
}

export async function publishTerms(d, ctx, { title, body, drive_url }) {
  if (ctx.role !== 'teacher' && !ctx.actingAsPlatform) throw forbidden('Somente a professora/administrador publica novos termos.');
  const text = String(body || '').trim();
  if (text.length < 200) throw badRequest('O texto dos termos está curto demais.');
  const cur = await currentTerms(d, ctx.tenantId);
  const [maj] = String(cur.version).split('.');
  const version = `${Number(maj) + 1}.0`;
  const row = await d.one(
    'INSERT INTO terms_documents (tenant_id, version, title, body, drive_url, created_by, created_at) VALUES (?,?,?,?,?,?,?) RETURNING *',
    [ctx.tenantId, version, String(title || DEFAULT_TITLE).slice(0, 160), text, drive_url || null, ctx.userId, nowIso()]
  );
  await audit(d, ctx, 'terms.publish', { targetType: 'terms', targetId: row.id, payload: { version } });
  return row;
}

export async function listTerms(d, tenantId) {
  await currentTerms(d, tenantId);
  const docs = await d.all('SELECT id, version, title, drive_url, created_at FROM terms_documents WHERE tenant_id = ? ORDER BY created_at DESC, version DESC', [tenantId]);
  const acc = await d.all('SELECT version, count(*)::int AS n FROM terms_acceptances WHERE tenant_id = ? GROUP BY version', [tenantId]);
  const total = (await d.one("SELECT count(*)::int AS n FROM students st JOIN users u ON u.id = st.user_id WHERE u.status = 'active'")).n;
  return { documents: docs.map((x) => ({ ...x, accepted: acc.find((a) => a.version === x.version)?.n || 0 })), active_students: total };
}

/** PDF simples e legível a partir do texto da versão. */
export async function termsPdf(terms, tenantName) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595; const H = 842; const M = 56; const size = 10.5; const lh = 15;
  let page = pdf.addPage([W, H]);
  let y = H - M;
  const ensure = (n = lh) => { if (y - n < M) { page = pdf.addPage([W, H]); y = H - M; } };
  const wrap = (text, f, s, max) => {
    const out = []; let line = '';
    for (const word of String(text).split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, s) > max) { if (line) out.push(line); line = word; } else line = test;
    }
    if (line) out.push(line);
    return out;
  };
  const put = (text, f, s, color = rgb(0.06, 0.09, 0.15)) => { for (const l of wrap(text, f, s, W - 2 * M)) { ensure(); page.drawText(l, { x: M, y, size: s, font: f, color }); y -= s + 5; } };
  put(tenantName || '', bold, 10, rgb(0.04, 0.26, 0.59));
  y -= 4;
  put(terms.title, bold, 17);
  put(`Versão ${terms.version} · publicada em ${String(terms.created_at).slice(0, 10).split('-').reverse().join('/')}`, font, 9, rgb(0.42, 0.47, 0.54));
  y -= 10;
  for (const para of String(terms.body).split(/\n{2,}/)) {
    const lines = para.split('\n');
    const head = /^\d+\.\s/.test(lines[0]) && lines.length > 1;
    if (head) { y -= 4; put(lines[0], bold, 11.5); put(lines.slice(1).join(' '), font, size); } else put(lines.join(' '), font, size);
    y -= 6;
  }
  return Buffer.from(await pdf.save());
}
