/**
 * Varredura de telas: entra com um usuário e abre cada rota, procurando erro de JavaScript, texto quebrado
 * (NaN, undefined, null, [object Object]) e rolagem horizontal no celular.
 *   BASE=http://localhost:3055 CHROMIUM_PATH=... node telas.mjs email senha  /rota1 /rota2 ...
 */
import { chromium } from 'playwright';
const [, , email, pass, ...routes] = process.argv;
const BASE = process.env.BASE || 'http://localhost:3000';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
let bad = 0;
for (const w of [1200, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 140)); });
  await p.goto(BASE + '/login');
  await p.getByLabel(/e-mail/i).fill(email); await p.getByLabel(/senha/i).first().fill(pass);
  await p.getByRole('button', { name: /entrar/i }).click(); await p.waitForTimeout(1500);
  for (const r of routes) {
    errs.length = 0;
    await p.goto(BASE + r); await p.waitForTimeout(1300);
    const txt = await p.locator('body').innerText({ timeout: 4000 }).catch(() => '');
    const issues = [];
    if (/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b/.test(txt)) issues.push('texto quebrado: ' + (txt.match(/.{0,30}(NaN|undefined|\[object Object\]|\bnull\b).{0,20}/) || [''])[0].replace(/\n/g, ' '));
    if (w === 390 && (await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2))) issues.push('rolagem horizontal no celular');
    if (txt.trim().length < 40) issues.push('página vazia');
    issues.push(...errs);
    console.log(`${issues.length ? '✗' : '✓'} ${w}px ${email.split('@')[0]} ${r}${issues.length ? '  → ' + issues.join(' | ') : ''}`);
    bad += issues.length;
  }
  await ctx.close();
}
await b.close();
process.exit(bad ? 1 : 0);
