/** CPF: normalização, validação dos dígitos verificadores e máscara para exibição. */
export const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export const formatCpf = (c) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c || null);
/** Máscara para listas: ***.456.789-** */
export const maskCpf = (c) => (c && c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : null);
