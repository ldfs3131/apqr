/** Link do WhatsApp (wa.me) com texto pronto. O sistema NUNCA envia: só abre a conversa para a equipe revisar e enviar. */
export function waLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  let full = null;
  if (digits.length === 10 || digits.length === 11) full = `55${digits}`;
  else if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) full = digits;
  if (!full) return null;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
