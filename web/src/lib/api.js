/** Cliente HTTP da API. Cookie de sessão httpOnly + cabeçalho anti-CSRF. */
export class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'apqr' } };
  // Admin ONE UP operando um ambiente: toda requisição carrega o ambiente escolhido.
  try {
    const acting = JSON.parse(sessionStorage.getItem('oneup.actingTenant') || 'null');
    if (acting?.id) opts.headers['X-Tenant-Id'] = acting.id;
  } catch { /* ignore */ }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${url}`, opts);
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data.error || {};
    if (res.status === 401 && url !== '/auth/login' && url !== '/auth/me') window.dispatchEvent(new CustomEvent('apqr:unauthenticated'));
    throw new ApiError(res.status, e.message || 'Algo deu errado. Tente novamente.', e.code, e.details);
  }
  return data;
}

/** Envio de arquivo (corpo binário). O servidor identifica o tipo pelos bytes. */
async function upload(url, file) {
  const headers = { 'X-Requested-With': 'apqr', 'Content-Type': 'application/octet-stream' };
  try { const acting = JSON.parse(sessionStorage.getItem('oneup.actingTenant') || 'null'); if (acting?.id) headers['X-Tenant-Id'] = acting.id; } catch { /* ignore */ }
  let res;
  try { res = await fetch(`/api${url}${url.includes('?') ? '&' : '?'}name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers, body: file }); }
  catch { throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error?.message || (res.status === 413 ? 'Arquivo grande demais (máximo 20 MB).' : 'Falha no envio.'), data.error?.code);
  return data;
}

/** Baixa um arquivo da API (ex.: planilha CSV) mantendo sessão e ambiente escolhido. */
export async function download(url) {
  const headers = { 'X-Requested-With': 'apqr' };
  try { const acting = JSON.parse(sessionStorage.getItem('oneup.actingTenant') || 'null'); if (acting?.id) headers['X-Tenant-Id'] = acting.id; } catch { /* ignore */ }
  let res;
  try { res = await fetch(`/api${url}`, { credentials: 'same-origin', headers }); }
  catch { throw new ApiError(0, 'Sem conexão com o servidor. Verifique sua internet.'); }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error?.message || 'Não foi possível baixar o arquivo.', data.error?.code);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'arquivo.csv';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export const api = {
  upload,
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url) => request('DELETE', url),
};

export function qs(params) {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${new URLSearchParams(p).toString()}` : '';
}
