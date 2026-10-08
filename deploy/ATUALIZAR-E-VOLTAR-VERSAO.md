# Atualizar o APQR e voltar para a versão anterior

Cada versão fica na própria pasta (`/opt/oneup/apqr/releases/apqr-<versão>`) e vira uma imagem com o número da versão (`oneup/apqr:<versão>`). A versão em uso é a do `APQR_VERSION` no `.env`. Por isso, **voltar** é só trocar esse número e religar, sem reconstruir nada.

Todos os comandos rodam dentro de `/opt/oneup/apqr` (`cd /opt/oneup/apqr`). Use `2.3.1` como exemplo de versão nova.

## Atualizar

1. **Enviar o ZIP da versão nova** (no Windows, como no passo 2.1 do guia):
   ```
   scp %USERPROFILE%\Downloads\oneup-apqr-vps-2.3.1.zip root@SEU_IP:/root/
   ```
2. **Descompactar** (no VPS):
   ```
   unzip -q /root/oneup-apqr-vps-2.3.1.zip -d /opt/oneup/apqr/releases/
   ```
   Esperado: aparece a pasta `releases/apqr-2.3.1`.
3. **Ler as notas da versão** (`releases/apqr-2.3.1/deploy/LEIA-ME.md`). Se disserem que os arquivos de produção mudaram (`docker-compose.yml`, scripts), copie-os de novo como no passo 3.1 do guia. **O `.env` nunca é substituído.**
4. **Backup antes de tudo** (obrigatório):
   ```
   ./backup.sh
   ```
   Esperado: `backup ok`. Anote o nome da pasta do backup.
5. **Trocar a versão no `.env`**: `nano .env`, mude para `APQR_VERSION=2.3.1`, salve e saia.
6. **Construir a versão nova** (o sistema antigo continua no ar durante a construção):
   ```
   docker compose build app
   ```
7. **Trocar para a versão nova** (o sistema fica fora do ar por alguns segundos):
   ```
   docker compose up -d app
   ```
8. **Conferir**:
   ```
   docker compose ps
   ```
   ```
   curl -s http://127.0.0.1:3000/api/health
   ```
   Esperado: `healthy` e `{"ok":true,"database":"postgres"`. Abra o site e faça um teste rápido (entrar, abrir a Central).

## Voltar para a versão anterior (rollback)

1. `nano .env` → volte para `APQR_VERSION=2.3.0` (a imagem antiga ainda está no servidor).
2. Religue:
   ```
   docker compose up -d app
   ```
3. Confira com `docker compose ps` e o teste de saúde.

**Atenção na passagem 2.x → 3.0.x:** as migrações 009 a 012 rodam sozinhas quando o app sobe e **não são totalmente reversíveis**: a 009 permite registrar questões sem tema (matéria ou simulado). Se, depois de atualizar, algum aluno já lançou questão livre ou simulado, **não use "voltar versão"**: a versão 2.x pode não saber ler essas linhas. Nesse caso o caminho é restaurar o backup feito antes da atualização, com a versão antiga. Depois de atualizar, confira `https://SEU-DOMINIO/api/health`: precisa mostrar `"schema":"ok"` e `"applied":12`.

**E o banco?** As mudanças de banco do APQR só **acrescentam** (tabelas e colunas novas), então a versão anterior costuma funcionar com o banco já atualizado. Se as notas da versão nova avisarem o contrário, ou se a versão anterior der erro depois de voltar, restaure o backup feito no passo 4 da atualização (`BACKUP-E-RESTAURACAO.md`). Tudo o que foi registrado entre a atualização e a restauração é perdido, por isso o rollback deve ser decidido logo.

## Limpeza (de vez em quando)

Mantenha as duas últimas versões. Para apagar uma bem antiga (ex.: 2.2.0) depois de ter certeza de que não vai precisar:
```
rm -rf releases/apqr-2.2.0 && docker image rm oneup/apqr:2.2.0
```
Para limpar sobras de construção:
```
docker builder prune -f
```
