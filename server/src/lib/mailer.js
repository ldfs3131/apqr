import nodemailer from 'nodemailer';

let transport = null;

/**
 * Envia e-mail se SMTP_URL estiver configurado (ex.: smtps://usuario:senha@smtp.servidor.com:465).
 * Retorna false quando não há SMTP. Nesse caso NADA é registrado em log (links são segredos):
 * a professora gera o link de redefinição pelo painel e envia ao aluno.
 */
export async function sendMail({ to, subject, text }) {
  if (!process.env.SMTP_URL) return false;
  try {
    transport ||= nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: process.env.MAIL_FROM || 'ONE UP <no-reply@localhost>', to, subject, text });
    return true;
  } catch (e) {
    console.error('[mailer] falha ao enviar e-mail:', e.message);
    return false;
  }
}
