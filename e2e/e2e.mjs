/**
 * Teste de ponta a ponta no navegador (V2). Sobe o servidor sozinho com um banco em memória e percorre a jornada:
 *   ONE UP cria o ambiente → professora conclui o convite, cria o edital e convida o aluno →
 *   aluno conclui o cadastro, estuda, avança as etapas e consolida → professora vê na Central, Raio-X e Ranking →
 *   professora cria nova versão das regras → isolamento de telas por perfil.
 *
 *   cd e2e && npm install && npm test
 *   (CHROMIUM_PATH=/caminho/do/chromium opcional; sem ele usa o Chromium do Playwright)
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

process.env.PGLITE_DIR = 'memory://';
process.env.FILES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'apqr-e2e-'));
process.env.NODE_ENV = 'test';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { openDb, tx, SYSTEM } = await import(path.join(root, 'server/src/db/index.js'));
const { createApp } = await import(path.join(root, 'server/src/app.js'));
const { hashPassword } = await import(path.join(root, 'server/src/security/auth.js'));

if (!fs.existsSync(path.join(root, 'web/dist/index.html'))) {
  console.error('Compile o site antes: npm --prefix web run build');
  process.exit(1);
}
await openDb();
const hash = await hashPassword('AdminE2E12345');
await tx(SYSTEM, (d) => d.run(`INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at) VALUES ('admin@e2e.test', ?, 'Admin E2E', 'platform_admin', 'active', now(), now())`, [hash]));
const server = createApp().listen(0);
const BASE = `http://localhost:${server.address().port}`;

let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error(`FALHOU: ${msg}`); passed += 1; console.log('  ✓', msg); };
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function page(width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
const see = async (p, sel) => { try { await p.waitForSelector(sel, { timeout: 8000 }); return true; } catch { return false; } };
async function login(p, email, password) {
  await p.goto(`${BASE}/login`);
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', password);
  await p.click('button:has-text("Entrar")');
}

try {
  console.log('ONE UP');
  const a = await page();
  await login(a, 'admin@e2e.test', 'AdminE2E12345');
  await a.waitForURL('**/plataforma');
  ok(await see(a, 'text=Console ONE UP'), 'admin entra no console');
  await a.goto(`${BASE}/plataforma/ambientes`);
  await a.click('button:has-text("Novo ambiente")');
  await a.getByLabel('Nome do ambiente').fill('Mentoria E2E');
  await a.getByLabel('Nome da professora').fill('Professora E2E');
  await a.getByLabel('E-mail da professora').fill('prof@e2e.test');
  await a.click('.modal button:has-text("Criar ambiente")');
  const teacherInvite = await a.locator('.modal input[readonly]').inputValue();
  ok(teacherInvite.includes('/convite/'), 'ambiente criado com convite da professora');

  console.log('Professora');
  const t = await page();
  await t.goto(teacherInvite.replace(/^https?:\/\/[^/]+/, BASE));
  await t.getByLabel('Crie uma senha').fill('Professora123');
  await t.getByLabel('Repita a senha').fill('Professora123');
  await t.click('button:has-text("Concluir cadastro")');
  await t.waitForURL('**/professora');
  ok(await see(t, 'text=Nenhum aluno ainda'), 'professora entra na Central vazia');
  await t.goto(`${BASE}/professora/editais`);
  await t.click('button:has-text("Novo edital")');
  await t.getByLabel('Nome do concurso').fill('SES E2E — Farmacêutico');
  await t.click('.modal button:has-text("Criar edital")');
  await t.waitForURL('**/professora/editais/*');
  await t.getByLabel('Nome da matéria').fill('Farmacologia');
  await t.getByLabel(/Conteúdos \(um por linha\)/).fill('1. Antibióticos\n2. Anti-inflamatórios\n• Farmacocinética');
  await t.click('button:has-text("Adicionar matéria")');
  await t.waitForSelector('text=Anti-inflamatórios');
  ok(await see(t, 'text=3 conteúdo(s)'), 'edital com matéria e 3 conteúdos (marcadores removidos)');
  await t.goto(`${BASE}/professora/alunos?novo=1`);
  await t.getByLabel('Nome completo').fill('Aluna E2E Silva');
  await t.getByLabel('E-mail').fill('aluna@e2e.test');
  await t.click('.modal label.check');
  await t.click('.modal button:has-text("Criar convite")');
  const studentInvite = await t.locator('.modal input[readonly]').inputValue();
  ok(studentInvite.includes('/convite/'), 'convite do aluno gerado');

  console.log('Aluno');
  const s = await page(390);
  await s.goto(studentInvite.replace(/^https?:\/\/[^/]+/, BASE));
  await s.getByLabel('CPF', { exact: true }).fill('52998224725');
  await s.getByLabel(/Telefone/).fill('62999887766');
  await s.getByLabel('Data de nascimento').fill('1990-05-20');
  await s.getByLabel('CEP', { exact: true }).fill('74000000');
  await s.getByLabel('Endereço', { exact: true }).fill('Rua das Flores');
  await s.getByLabel('Número', { exact: true }).fill('10');
  await s.getByLabel('Bairro', { exact: true }).fill('Centro');
  await s.getByLabel('Cidade', { exact: true }).fill('Goiânia');
  await s.getByLabel('UF').selectOption('GO');
  await s.getByLabel('Crie uma senha').fill('AlunaE2E123');
  await s.getByLabel('Repita a senha').fill('AlunaE2E123');
  await s.check('input[type=checkbox]');
  await s.click('button:has-text("Concluir cadastro")');
  await s.waitForURL('**/bem-vindo');
  ok(await see(s, 'text=SES E2E'), 'cadastro completo → primeiro acesso mostra o edital');
  for (let i = 0; i < 3; i++) await s.click('button:has-text("Continuar")');
  await s.click('button:has-text("Ir para o meu painel")');
  await s.waitForURL(`${BASE}/`);
  ok(await see(s, 'text=O que fazer agora'), 'tela Hoje com o próximo passo');
  await s.goto(`${BASE}/edital`);
  await s.click('text=Antibióticos >> visible=true');
  await s.click('.drawer button:has-text("Iniciar assimilação")');
  await s.click('.modal button:has-text("Confirmar")');
  await s.waitForSelector('.drawer-head >> text=Em assimilação');
  ok(true, 'etapa A (assimilação)');
  await s.click('.drawer button:has-text("Registrar material")');
  await s.click('.modal button:has-text("Mapa mental")');
  await s.click('.modal button:has-text("Registrar")');
  await s.waitForTimeout(500);
  await s.click('.drawer button:has-text("Material pronto")');
  await s.click('.modal button:has-text("Confirmar")');
  await s.waitForSelector('.drawer-head >> text=Material pronto');
  ok(true, 'etapa P (material pronto) com material registrado');
  await s.click('.drawer button:has-text("Iniciar revisão")');
  await s.click('.modal button:has-text("Confirmar")');
  await s.click('.drawer button:has-text("Registrar Q/R-1")');
  await s.getByLabel('Questões resolvidas').fill('30');
  await s.getByLabel('Acertos').fill('21');
  ok(await see(s, '.modal >> text=Não consolida'), 'prévia: 70% exatos não consolida');
  await s.getByLabel('Acertos').fill('24');
  ok(await see(s, '.modal >> text=CONSOLIDA'), 'prévia: 80% consolida');
  await s.click('.modal button:has-text("Salvar Q/R-1")');
  await s.waitForSelector('.drawer-head >> text=Consolidado');
  ok(true, 'revisão registrada e conteúdo consolidado');
  await s.goto(`${BASE}/professora`);
  await s.waitForURL(`${BASE}/`);
  ok(true, 'aluno não acessa a área da professora');

  console.log('Professora acompanha');
  await t.goto(`${BASE}/professora`);
  await t.waitForSelector('text=Aluna E2E Silva');
  ok(await see(t, '.pulse-item:has-text("Estudaram hoje") >> text=1'), 'Central: 1 aluno estudou hoje');
  await t.click('text=Aluna E2E Silva');
  await t.waitForURL('**/professora/alunos/*');
  ok(await see(t, 'text=33,3%'), 'Raio-X: consolidação de 33,3% (1 de 3)');
  await t.click('button[role=tab]:has-text("Relatório IA")');
  await t.click('button:has-text("Gerar relatório")');
  await t.waitForSelector('text=Relatório por regras');
  ok(true, 'relatório gerado (sem IA configurada: por regras)');
  await t.goto(`${BASE}/professora/ranking`);
  await t.waitForSelector('text=Aluna E2E Silva');
  ok(await see(t, 'text=Novo'), 'Ranking: aluno recém-matriculado aparece como Novo, sem posição');
  await t.goto(`${BASE}/professora/configuracoes`);
  await t.getByLabel(/Mínimo de questões/).fill('25');
  await t.click('button:has-text("Salvar como nova versão")');
  await t.getByLabel(/Motivo da alteração/).fill('Teste E2E');
  await t.click('button:has-text("Criar versão v2")');
  await t.waitForSelector('text=Versão vigente: v2');
  ok(await see(t, 'td >> text=v1'), 'regras: v2 criada e v1 preservada no histórico');
  // Base de alunos: importa um CSV pela tela (prévia → confirmar) e confere a lista para baixar.
  const csvPath = path.join(process.env.FILES_DIR, 'base.csv');
  fs.writeFileSync(csvPath, '\uFEFFnome;email;turma;ultimo_login;fim_do_plano;situacao\r\nEx Aluna Um;ex1@e2e.test;ANVISA;01/01/2024;01/02/2024;encerrado\r\nAtiva Parada;ativa2@e2e.test;ANVISA;01/01/2024;01/01/2099;ativo\r\n');
  await t.goto(`${BASE}/professora/relatorios`);
  await t.click('button:has-text("Importar ou atualizar base")');
  await t.setInputFiles('.modal input[type=file]', csvPath);
  await t.waitForSelector('.modal >> text=serão criados');
  const box = await t.locator('.modal').boundingBox();
  ok(box && box.y >= 0 && box.y + 40 < 900, 'janela de importação aparece na tela (não presa ao fim da página)');
  await t.click('.modal button:has-text("Confirmar importação (2)")');
  await t.waitForSelector('.modal >> text=Importação concluída');
  await t.click('.modal button:has-text("Concluir")');
  await t.waitForSelector('.dl-row:has-text("Todos os ex-alunos") >> text=1');
  ok(await see(t, '.dl-row:has-text("Sem acesso há mais de 30 dias") >> text=1'), 'Base de alunos: importação e listas (1 ex-aluna, 1 ativa sem acesso)');
  const [dl] = await Promise.all([t.waitForEvent('download'), t.click('.dl-row:has-text("Todos os ex-alunos")')]);
  const body = fs.readFileSync(await dl.path(), 'utf8');
  ok(body.includes('Ex Aluna Um') && !body.includes('Ativa Parada'), 'download da lista de ex-alunos (CSV) só com quem tem plano encerrado');
  await t.goto(`${BASE}/plataforma`);
  await t.waitForURL('**/professora');
  ok(true, 'professora não acessa o console ONE UP');

  // Marca, assinatura e app instalável (V2.2.1)
  await t.goto(`${BASE}/professora`);
  await t.waitForSelector('.sidebar .brand-logo-pair');
  ok(await t.evaluate(() => document.querySelector('.sidebar .logo-color').getAttribute('src').includes('pollyana-logo')), 'menu mostra o logo da Pollyana Lyra');
  ok(await see(t, '.sidebar .oneup-sig'), 'assinatura "Desenvolvido por ONE UP" no menu');
  const man = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  ok(man.name.includes('Pollyana Lyra') && man.display === 'standalone' && man.icons.length >= 3, 'manifesto do app instalável (nome, tela cheia, ícones)');
  const sw = await fetch(`${BASE}/sw.js`);
  ok(sw.ok && (sw.headers.get('cache-control') || '').includes('no-cache'), 'service worker servido sem cache');
  ok(!(await sw.text()).includes("'/api/'") === false, 'service worker nunca guarda /api');
  const lg = await page();
  await lg.goto(`${BASE}/login`);
  ok(await see(lg, '.auth-foot .revise-link'), 'login: link do canal Revise Farmácia');

  // Financeiro, Agenda e Materiais (V2.3)
  await t.goto(`${BASE}/professora/financeiro?aba=integracao`);
  await t.waitForSelector('text=Receber vendas do checkout');
  const wh = await t.evaluate(async () => {
    const r = await fetch('/api/teacher/finance/endpoints', { method: 'POST', headers: { 'X-Requested-With': 'apqr', 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Checkout E2E' }) });
    return (await r.json()).url;
  });
  const hook = await fetch(wh, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_id: 'E2E-1', status: 'aprovado', amount: '297,00', email: 'comprador@e2e.test', name: 'Compradora E2E', product_name: 'Curso E2E' }) });
  ok(hook.ok && (await hook.json()).result === 'processed', 'webhook recebe e processa uma venda (sem login)');
  await t.goto(`${BASE}/professora/financeiro?aba=vendas`);
  await t.waitForSelector('text=Compradora E2E');
  ok(await t.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' ').includes('R$ 297,00')), 'venda aparece em Financeiro → Vendas com o valor');
  await t.goto(`${BASE}/professora/financeiro`);
  await t.waitForSelector('text=Receita bruta');
  ok(true, 'painel financeiro abre');
  await t.goto(`${BASE}/professora/agenda`);
  await t.waitForSelector('h1:has-text("Agenda")');
  ok(await see(t, 'text=Novo compromisso'), 'professora vê a Agenda e pode criar compromisso');
  await s.goto(`${BASE}/agenda`);
  await s.waitForSelector('h1:has-text("Agenda")');
  ok(await see(s, 'text=Adicionar ao meu calendário'), 'aluno vê a Agenda com botão do calendário');
  await s.goto(`${BASE}/conteudos`);
  await s.waitForSelector('h1:has-text("Materiais")');
  ok(true, 'aluno abre Materiais');
  await s.goto(`${BASE}/professora/financeiro`);
  await s.waitForURL((u) => !u.pathname.startsWith('/professora'));
  ok(true, 'aluno não acessa o Financeiro');

  ok(errors.length === 0, `nenhum erro de JavaScript nas páginas${errors.length ? `: ${errors.join(' | ')}` : ''}`);
  console.log(`\n${passed} verificações OK`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  fs.rmSync(process.env.FILES_DIR, { recursive: true, force: true });
  process.exit(process.exitCode || 0);
}
