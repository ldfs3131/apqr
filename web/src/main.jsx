import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import './styles.css';
import App from './App.jsx';
import { registerServiceWorker } from './lib/pwa.js';
import { applyTheme, getThemePref } from './lib/theme.js';

applyTheme(getThemePref());

// Depois de uma atualização, uma aba antiga pede arquivos que já não existem: recarrega uma vez para pegar a versão nova.
window.addEventListener("vite:preloadError", () => { try { if (sessionStorage.getItem("apqr-reload")) return; sessionStorage.setItem("apqr-reload", "1"); } catch { /* sem armazenamento */ } location.reload(); });
setTimeout(() => { try { sessionStorage.removeItem("apqr-reload"); } catch { /* ok */ } }, 15000);
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();
