# APQR v3.0.2 — página de vendas da Consultoria

**O que muda para os alunos:** nada. Login, rotas, banco e cabeçalhos de segurança do app continuam iguais.

## Novo
- `pollylyra.com.br/consultoria/` passa a mostrar a página de vendas da Consultoria Individual da Prof. Pollyana
  (HTML estático em `web/public/consultoria/`, copiado para `web/dist/consultoria/` na compilação).
- `/consultoria` (sem barra) redireciona para `/consultoria/` mantendo os parâmetros UTM.
- A página tem política de segurança própria (`LANDING_CSP` em `server/src/app.js`): libera Google Fonts,
  o script da própria página e Meta Pixel / Google Analytics. O app continua com a política original.
- O service worker do app ignora `/consultoria` (não guarda a página de vendas como tela do APQR).

## Configurar depois (sem mexer no resto)
No fim de `web/public/consultoria/index.html`, objeto `CONFIG`: links de checkout Pix e cartão (Pagar.me),
`META_PIXEL_ID` e `GA4_ID`. Enquanto os checkouts estiverem vazios, os botões de pagamento abrem o WhatsApp da equipe.
Depois de editar: `npm run build:web`, subir a versão no `VERSION` e publicar normalmente.

## Estrutura de domínios planejada (Prof. Pollyana)
- `pollylyra.com.br` → página institucional (futura); hoje ainda é o app.
- `pollylyra.com.br/consultoria` → vendas da Consultoria (esta versão).
- `pollylyra.com.br/metodo-apqr` → vendas da Plataforma + Mentoria (futura; basta acrescentar o nome em `LANDING_PAGES`).
- `pollylyra.com.br/apqr-login` → atalho para o login (futuro).
- App APQR → mudar para subdomínio próprio numa etapa futura e planejada (URL base, cookies, e-mails, PWA).
- `pollylyra.com` → cursos (Proluno), fora deste sistema.

## Testes
`server/test/pagina-consultoria.test.js` (redirecionamento, política de segurança, imagens, app intacto). Suíte completa: 182 testes ok.

---

# APQR v3.0.3 — ajustes na página /consultoria

- Retiradas as regras do método do bloco de cores (20 questões, 70%, 4 revisões) e a lista de credenciais (Farmacêutica, Analista, Desde 2015, 54 mil seguidores).
- Botões de pagamento: tocar sem o aceite do termo leva até o aceite e explica o que falta.
- Legenda de cores em lista no celular; foto de "Quem conduz" sem cortar a cabeça; botão da barra fixa sem quebrar linha.
- Imagem de compartilhamento em JPG 1200×630 (WhatsApp/Instagram); endereço canônico com barra final.
- Numerais de preço alinhados; texto neutro no bônus ("Quem faz a sua parte").
