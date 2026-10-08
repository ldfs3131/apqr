# Como colocar o Método APQR no ar (passo a passo, sem programar)

Tempo estimado: 1 a 2 horas na primeira vez. Você vai usar 3 serviços: **GitHub** (guarda o código), **Render** (roda o site e o banco) e o **Registro.br** (endereço). Nada aqui exige escrever código.

> Valores de planos mudam com frequência: confirme os preços na tela da Render antes de contratar. Em geral o total fica na casa de dezenas de reais por mês (site com disco + banco pago). **Não use banco gratuito**: ele é apagado depois de um tempo e você perderia os alunos.

## 0. O que você precisa ter em mãos
- O arquivo `oneup-apqr-v3.0.1.zip` (descompacte numa pasta).
- Um e-mail seu para ser o administrador ONE UP e uma senha forte (10+ caracteres, com letras e números).
- Cartão de crédito para a Render.
- (Depois) o arquivo `base-alunos-mentoria.csv`, que é privado (tem CPF). **Nunca suba esse arquivo para o GitHub.**

## 1. Guardar o código no GitHub
1. Crie uma conta em <https://github.com>.
2. Instale o **GitHub Desktop** (<https://desktop.github.com>) e entre com a sua conta.
3. No GitHub Desktop: **File → Add local repository** e escolha a pasta descompactada. Se ele disser que não é um repositório, clique em **create a repository** e confirme.
4. Clique em **Publish repository**. Marque **Keep this code private** (privado) e publique.

## 2. Criar o site e o banco na Render
1. Crie conta em <https://render.com> (pode entrar com o GitHub).
2. **New → Blueprint** e escolha o repositório que você publicou. A Render lê o arquivo `render.yaml` sozinha.
3. Ela vai pedir estes campos:
   - `APP_URL`: por enquanto deixe o endereço que a Render der (ex.: `https://metodo-apqr.onrender.com`). Depois você troca pelo domínio (passo 4).
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: o seu administrador ONE UP.
   - `SMTP_URL` e `MAIL_FROM`: pode deixar em branco (veja o passo 6).
4. Clique em **Apply**. Aguarde 5 a 10 minutos até o site ficar **Live**.
5. Abra o endereço do site e entre com `ADMIN_EMAIL` e `ADMIN_PASSWORD`.

## 3. Criar o ambiente da Prof. Pollyana
1. No Console ONE UP: **Ambientes → Novo ambiente**.
2. Identificador: `pollyana-lyra` (precisa ser exatamente igual ao `DEFAULT_TENANT`). Nome: `Pollyana Lyra`. Preencha o nome e o e-mail da professora.
3. A tela mostra o **link de convite** da professora. Envie a ela: é por ele que ela define a senha.
4. A marca (logo Pollyana, ONE UP, Revise Farmácia) já vem de fábrica.

## 4. Endereço próprio (mentoria.pollylyra.com.br)
1. Na Render: o serviço → **Settings → Custom Domains → Add** → `mentoria.pollylyra.com.br`.
2. A Render mostra um registro **CNAME**. No painel do Registro.br (ou onde o domínio está), em **DNS**, crie esse CNAME para o nome `mentoria`.
3. Espere até algumas horas. A Render liga o cadeado (HTTPS) sozinha.
4. Volte em **Environment** e troque `APP_URL` para `https://mentoria.pollylyra.com.br`. Salve (o site reinicia).

## 5. Trazer a base de alunos
Com a professora logada: **Relatórios → Base de alunos → Importar ou atualizar base** e escolha o `base-alunos-mentoria.csv`. Primeiro aparece uma **prévia** (nada é gravado). Confira e confirme.
Os alunos entram com cadastro pendente: a professora envia o convite quando quiser (Alunos → aluno → link de convite).

## 6. E-mail (opcional)
Sem e-mail configurado, tudo funciona; só não chegam avisos de compra por e-mail. Para ligar, use um serviço de envio (ex.: o SMTP da Locaweb, Zoho ou Brevo) e preencha `SMTP_URL` no formato `smtps://usuario:senha@servidor:465` e `MAIL_FROM`.

## 7. Ligar o checkout (quando você escolher)
1. **Financeiro → Integração → Criar endereço** (dê o nome do checkout).
2. Copie o endereço e cole no campo de **Webhook** do checkout. Marque compra aprovada, reembolso, chargeback e boleto/Pix gerado.
3. Faça uma compra de teste. Se aparecer em **Vendas**, está tudo certo. Se cair na **Caixa de entrada** como "Não entendido", me envie o conteúdo (botão "Ver conteúdo") que eu ajusto o leitor para aquele checkout.
4. Em **Produtos**, marque quais produtos **liberam acesso** (e por quantos dias) e, em **Integração → Preferências**, ligue "Liberar acesso automaticamente" quando quiser.

## 8. Cuidados
- **Backup**: o banco da Render tem cópias automáticas nos planos pagos; confirme na tela do banco. Os PDFs ficam no disco do site.
- **Atualizações**: quando eu entregar uma versão nova, é só substituir os arquivos na pasta e clicar em **Commit** e **Push** no GitHub Desktop. A Render publica sozinha e o banco se atualiza.
- **Segredos**: senha de administrador e `SMTP_URL` ficam só na Render, nunca no GitHub.
- **Teste de saúde**: `https://SEU-ENDERECO/api/health` deve mostrar `"ok": true`.
