# Guia de instalação do APQR no VPS (para iniciante)

Regra de ouro: **um comando por vez**. Copie o comando, cole no terminal do VPS, aperte Enter e compare com o "Resultado esperado". Só siga quando bater. Se aparecer algo diferente, pare e mande o print.

Os comandos assumem que você entrou como `root` (padrão da Hostinger). Onde aparecer `SEU_IP`, use o IP do VPS (painel da Hostinger).

Antes de começar, tenha em mãos: o arquivo `oneup-apqr-vps-2.3.0.zip`, o seu e-mail e uma senha forte para o administrador ONE UP (10+ caracteres, letras e números) e acesso ao painel do Registro.br do domínio `pollylyra.com.br`.

---

## Fase 0 · Conferir o servidor

**0.1 Versão do Docker Compose**
- O que faz: confirma que o Docker Compose novo está instalado (o pacote precisa dele).
- Comando:
  ```
  docker compose version
  ```
- Resultado esperado: `Docker Compose version v2.` seguido de números (v2.20 ou maior).
- Se der erro: se aparecer "docker: 'compose' is not a docker command", o servidor tem só a versão antiga. Pare aqui e avise.

**0.2 Quem está usando as portas 80 e 443**
- O que faz: mostra se algum programa já atende os endereços da internet (o Caddy precisa dessas portas).
- Comando:
  ```
  ss -tlnp | grep -E ':(80|443)\s'
  ```
- Resultado esperado: nada, ou linhas com `nginx`.
- Se aparecer `nginx`, faça o passo 0.3. Se aparecer outro nome, pare e avise.

**0.3 O Nginx atende algum site?**
- O que faz: lista os sites configurados no Nginx.
- Comando:
  ```
  ls /etc/nginx/sites-enabled/
  ```
- Resultado esperado: só `default` (ou nada). Isso quer dizer que o Nginx não atende nenhum sistema e pode ser desligado no passo 5.1.
- Se aparecer outro nome (ex.: um site da Comanda), **pare e avise**: aí decidimos entre migrar esse site para o Caddy ou usar o arquivo `nginx-alternativo/` deste pacote.

**0.4 Firewall**
- O que faz: confirma que só as portas 22, 80 e 443 estão abertas.
- Comando:
  ```
  ufw status
  ```
- Resultado esperado: `Status: active` e regras para `22`, `80` e `443` (ALLOW). Nenhuma regra para 3000 ou 5432.
- Se der diferente: avise antes de continuar.

**0.5 Espaço e memória**
- O que faz: mostra disco livre e memória.
- Comando:
  ```
  df -h / && free -h
  ```
- Resultado esperado: mais de 10 GB livres no disco (coluna "Avail") e a linha `Swap` com cerca de 2 GB.
- Se der diferente: avise.

**0.6 Docker liga sozinho quando o servidor reinicia?**
- Comando:
  ```
  systemctl is-enabled docker
  ```
- Resultado esperado: `enabled`.
- Se aparecer `disabled`: rode `systemctl enable docker` e confira de novo.

---

## Fase 1 · Apontar o endereço (Registro.br)

**1.1 Criar o registro DNS (no navegador, não no terminal)**
No painel do Registro.br → domínio `pollylyra.com.br` → **DNS** → **Editar zona** → **Nova entrada**:
- Tipo: `A` · Nome: `mentoria` · Valor: `SEU_IP` · salvar.
- Não mexa em nada do `pollylyra.com` (é a Proluno).
- Se o painel disser que o DNS não é do Registro.br, a entrada é criada onde o DNS estiver hospedado. Avise se não souber onde.

**1.2 Conferir se já propagou**
- O que faz: pergunta à internet para onde `mentoria.pollylyra.com.br` aponta.
- Comando:
  ```
  getent ahostsv4 mentoria.pollylyra.com.br | head -1
  ```
- Resultado esperado: o IP do seu VPS.
- Se não aparecer nada: aguarde de 15 minutos a algumas horas e repita. **Não faça a Fase 5 antes disso** (o certificado HTTPS falha e o Let's Encrypt bloqueia novas tentativas por um tempo). As Fases 2 a 4 podem seguir enquanto isso.

---

## Fase 2 · Enviar o pacote para o VPS

**2.1 Enviar o arquivo (no seu computador Windows)**
- O que faz: copia o ZIP do seu computador para o VPS.
- Onde: no **Prompt de Comando** do Windows (tecla Windows → `cmd` → Enter).
- Comando (ajuste a pasta se o arquivo não estiver em Downloads):
  ```
  scp %USERPROFILE%\Downloads\oneup-apqr-vps-2.3.0.zip root@SEU_IP:/root/
  ```
- Resultado esperado: pergunta a senha do VPS (na primeira vez também pergunta "Are you sure…?": digite `yes`) e mostra `100%`.
- Se der erro: alternativa sem comando é o programa **WinSCP** (conectar com IP, usuário `root` e senha; arrastar o arquivo para `/root`).

**2.2 Instalar o descompactador (no VPS)**
- O que faz: instala o programa que abre arquivos ZIP.
- Comando:
  ```
  apt-get install -y unzip
  ```
- Resultado esperado: termina sem "E:" (erro). Se disser "already the newest version", também está certo.
- Se der erro de "lock": espere 2 minutos (o Ubuntu está se atualizando) e repita.

**2.3 Criar as pastas da ONE UP**
- O que faz: cria a estrutura `/opt/oneup/apqr/releases` e a pasta dos backups.
- Comando:
  ```
  mkdir -p /opt/oneup/apqr/releases /opt/oneup/backups/apqr
  ```
- Resultado esperado: nenhuma mensagem.

**2.4 Descompactar a versão**
- O que faz: abre o ZIP dentro de `releases`.
- Comando:
  ```
  unzip -q /root/oneup-apqr-vps-2.3.0.zip -d /opt/oneup/apqr/releases/
  ```
- Resultado esperado: nenhuma mensagem.

**2.5 Conferir**
- Comando:
  ```
  ls /opt/oneup/apqr/releases/apqr-2.3.0
  ```
- Resultado esperado: entre outros, `Dockerfile`, `deploy`, `server`, `web`.
- Se não existir a pasta `apqr-2.3.0`: mande o resultado de `ls /opt/oneup/apqr/releases`.

---

## Fase 3 · Configurar o APQR

**3.1 Copiar os arquivos de produção para a pasta do APQR**
- O que faz: coloca o compose, os scripts e o modelo de configuração em `/opt/oneup/apqr`.
- Comando:
  ```
  cd /opt/oneup/apqr && cp -r releases/apqr-2.3.0/deploy/{docker-compose.yml,.env.example,postgres-init,backup.sh,restore.sh} .
  ```
- Resultado esperado: nenhuma mensagem.

**3.2 Criar o arquivo de configuração**
- O que faz: cria o `.env` a partir do modelo e deixa só o administrador do servidor ler.
- Comando:
  ```
  cp .env.example .env && chmod 600 .env
  ```
- Resultado esperado: nenhuma mensagem.

**3.3 Gerar as duas senhas do banco**
- O que faz: sorteia duas senhas fortes (só letras e números).
- Comando:
  ```
  echo "POSTGRES_ADMIN_PASSWORD=$(openssl rand -hex 24)"; echo "APQR_DB_PASSWORD=$(openssl rand -hex 24)"
  ```
- Resultado esperado: duas linhas com senhas longas. **Copie as duas** para o seu gerenciador de senhas (ou um bloco de notas seguro).

**3.4 Preencher o `.env`**
- O que faz: abre o editor de texto do terminal.
- Comando:
  ```
  nano .env
  ```
- Preencha: `POSTGRES_ADMIN_PASSWORD` e `APQR_DB_PASSWORD` (as do passo 3.3), `ADMIN_EMAIL` e `ADMIN_PASSWORD` (o seu acesso de administrador ONE UP). Confira `APP_URL=https://mentoria.pollylyra.com.br`. O resto pode ficar como está.
- Para salvar: `Ctrl + O`, Enter. Para sair: `Ctrl + X`.
- Atenção: sem espaços antes ou depois do `=`.

**3.5 Conferir a configuração**
- O que faz: o Docker lê tudo e avisa se faltar algo.
- Comando:
  ```
  docker compose config --quiet && echo CONFIG-OK
  ```
- Resultado esperado: `CONFIG-OK`.
- Se aparecer "defina … no .env": volte ao 3.4 e preencha o campo citado.

---

## Fase 4 · Construir e ligar o APQR

**4.1 Construir a imagem**
- O que faz: monta o sistema dentro do Docker (baixa dependências e compila o site). Demora de 5 a 15 minutos neste servidor.
- Comando:
  ```
  docker compose build
  ```
- Resultado esperado: termina com algo como `Built` / `naming to docker.io/oneup/apqr:2.3.0 done`, sem `ERROR`.
- Se der erro: mande as últimas 30 linhas. Nada foi alterado ainda; dá para repetir com segurança.

**4.2 Ligar banco e app**
- O que faz: cria o banco (com o usuário limitado) e sobe o APQR.
- Comando:
  ```
  docker compose up -d
  ```
- Resultado esperado: `Container apqr-db-1 Healthy` e `Container apqr-app-1 Started`.

**4.3 Ver se está saudável**
- O que faz: mostra a situação dos dois serviços.
- Comando:
  ```
  docker compose ps
  ```
- Resultado esperado: `db` e `app` com STATUS `Up … (healthy)`. Na primeira vez, o app pode levar até 1 minuto para ficar `healthy`; repita o comando.
- Se aparecer `Restarting` ou `unhealthy`: rode `docker compose logs --tail 50 app` e mande o resultado.

**4.4 Teste de saúde**
- O que faz: pergunta ao APQR, de dentro do servidor, se está tudo certo.
- Comando:
  ```
  curl -s http://127.0.0.1:3000/api/health
  ```
- Resultado esperado: começa com `{"ok":true,"database":"postgres"`. A palavra **postgres** é importante.

**4.5 Confirmar que a porta não está exposta**
- O que faz: mostra em qual endereço o APQR escuta.
- Comando:
  ```
  ss -tlnp | grep 3000
  ```
- Resultado esperado: `127.0.0.1:3000`. Se aparecer `0.0.0.0:3000` ou `*:3000`, **pare e avise**.

---

## Fase 5 · HTTPS com o Caddy

Só faça esta fase depois que o passo 1.2 mostrar o IP do VPS.

**5.1 Desligar o Nginx (só se o passo 0.3 mostrou apenas `default` ou nada)**
- O que faz: libera as portas 80 e 443 para o Caddy e impede o Nginx de voltar ao reiniciar.
- Comando:
  ```
  systemctl disable --now nginx
  ```
- Resultado esperado: `Removed …` ou nenhuma mensagem.
- Se o 0.3 mostrou outro site: **não rode**; avise.

**5.2 Criar a pasta do proxy e copiar os arquivos**
- O que faz: prepara o Caddy, que vai atender todos os sistemas da ONE UP.
- Comando:
  ```
  mkdir -p /opt/oneup/proxy && cp /opt/oneup/apqr/releases/apqr-2.3.0/deploy/proxy/{docker-compose.yml,Caddyfile,.env.example} /opt/oneup/proxy/ && cd /opt/oneup/proxy && cp .env.example .env
  ```
- Resultado esperado: nenhuma mensagem.

**5.3 Informar o e-mail do certificado**
- Comando:
  ```
  nano .env
  ```
- Preencha `ACME_EMAIL=seu@email.com`, salve (`Ctrl + O`, Enter) e saia (`Ctrl + X`).

**5.4 Ligar o Caddy**
- O que faz: sobe o proxy e pede o certificado HTTPS automaticamente.
- Comando:
  ```
  docker compose up -d
  ```
- Resultado esperado: `Container oneup-proxy-caddy-1 Started`.
- Se disser que a porta 80 ou 443 está em uso: o Nginx ainda está ligado (volte ao 5.1).

**5.5 Conferir o certificado**
- O que faz: mostra o registro do Caddy.
- Comando:
  ```
  docker compose logs --tail 30 caddy
  ```
- Resultado esperado: uma linha com `certificate obtained successfully` para `mentoria.pollylyra.com.br`.
- Se aparecer erro de "challenge" ou "DNS": o endereço ainda não aponta para o VPS (volte ao 1.2) ou a porta 80 está bloqueada.

**5.6 Abrir no navegador**
Acesse `https://mentoria.pollylyra.com.br`. Deve abrir a tela de entrada com o cadeado.

---

## Fase 6 · Primeiro acesso

1. Entre com o `ADMIN_EMAIL` e o `ADMIN_PASSWORD` do `.env`.
2. **Ambientes → Novo ambiente**: identificador `pollyana-lyra`, nome `Pollyana Lyra`, nome e e-mail da professora. Envie à professora o link de convite que aparece.
3. Com a professora (ou você, pelo console, operando o ambiente): **Relatórios → Base de alunos → Importar** com o `base-alunos-mentoria.csv` (prévia primeiro, depois confirmar).

**6.1 Tirar a senha do administrador do `.env` (recomendado)**
- O que faz: a senha só era usada para criar o primeiro acesso; depois disso não precisa ficar gravada.
- Comando:
  ```
  cd /opt/oneup/apqr && nano .env
  ```
- Apague só o que vem depois de `ADMIN_PASSWORD=` (a linha fica `ADMIN_PASSWORD=`), salve e saia. Não precisa reiniciar.

---

## Fase 7 · Backup diário

**7.1 Primeiro backup manual**
- O que faz: testa o backup completo (banco + arquivos) agora.
- Comando:
  ```
  /opt/oneup/apqr/backup.sh
  ```
- Resultado esperado: uma linha `backup ok: /opt/oneup/backups/apqr/diario/apqr-…`.
- Se aparecer `BACKUP FALHOU`: mande a mensagem.

**7.2 Agendar o backup diário (03:15)**
- O que faz: instala o agendamento automático.
- Comando:
  ```
  install -m 644 /opt/oneup/apqr/releases/apqr-2.3.0/deploy/apqr-backup.cron /etc/cron.d/apqr-backup
  ```
- Resultado esperado: nenhuma mensagem.

**7.3 Conferir no dia seguinte**
- Comando:
  ```
  tail -3 /var/log/apqr-backup.log
  ```
- Resultado esperado: uma linha `backup ok` com a data do dia.

**7.4 Cópia fora do VPS**
Um backup só no próprio VPS não protege contra perda do servidor. Faça pelo menos uma das opções do `BACKUP-E-RESTAURACAO.md` (seção "Cópia fora do VPS") na primeira semana.

---

## Comandos úteis do dia a dia (sempre dentro de `/opt/oneup/apqr`)

| Para | Comando |
|---|---|
| Ver se está tudo no ar | `docker compose ps` |
| Ver os últimos registros do app | `docker compose logs --tail 100 app` |
| Reiniciar o app | `docker compose restart app` |
| Consumo de memória e CPU | `docker stats --no-stream` |
| Teste de saúde | `curl -s http://127.0.0.1:3000/api/health` |
