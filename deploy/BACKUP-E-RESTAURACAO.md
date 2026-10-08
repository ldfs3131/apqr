# Backup e restauração do APQR

## O que é guardado

| Item | Como | Onde |
|---|---|---|
| Banco inteiro (alunos, estudos, vendas, agenda…) | `pg_dump` com o sistema no ar, conferido logo depois | `banco.dump` |
| Arquivos enviados (PDFs, logotipos) | pacote do volume `/data/files` | `arquivos.tar.gz` |
| Conferência | SHA-256 dos dois arquivos | `SHA256SUMS` |
| Resumo | data, versão do APQR, tamanhos | `INFO.txt` |

Pasta: `/opt/oneup/backups/apqr/diario/apqr-AAAA-MM-DD-HHMM/` (só o administrador do servidor lê).

**Não entra no backup:** o `.env` (tem as senhas). Guarde uma cópia dele no seu gerenciador de senhas. Sem ele, dá para restaurar, mas é preciso criar senhas novas.

## Quando roda e quanto tempo fica

- Todo dia às **03:15**, pelo agendamento `/etc/cron.d/apqr-backup`. Registro em `/var/log/apqr-backup.log`.
- **Diário:** os últimos 14 dias.
- **Mensal:** o primeiro backup de cada mês fica 12 meses (pasta `mensal/`).
- Manual, a qualquer hora: `/opt/oneup/apqr/backup.sh` (faça sempre antes de atualizar).

## Cópia fora do VPS (faça na primeira semana)

Backup no mesmo servidor não protege contra perda do VPS. Escolha uma opção, ou as duas:

**Opção A · Painel da Hostinger:** ative os backups ou snapshots automáticos do VPS, se o seu plano tiver. É uma camada extra (servidor inteiro), não substitui o backup do APQR.

**Opção B · Baixar para o seu computador (semanal, sem instalar nada no VPS).** No Prompt de Comando do Windows:
```
scp -r root@SEU_IP:/opt/oneup/backups/apqr/mensal %USERPROFILE%\Documents\backups-apqr
```
(ou arraste a pasta pelo WinSCP). Guarde também numa nuvem sua.

**Opção C · Automática para o Google Drive (rclone).** Recomendado depois que tudo estiver estável. Precisa de uma configuração única guiada:
1. `apt-get install -y rclone`
2. `rclone config` → criar um "remote" chamado `gdrive` do tipo Google Drive (o rclone mostra um link para autorizar no navegador do seu computador).
3. No `.env` do APQR: `OFFSITE_REMOTE=gdrive:backups/apqr`.
4. Teste: `/opt/oneup/apqr/backup.sh` → a linha final deve dizer `cópia externa: enviada para gdrive:backups/apqr`.

Se a cópia externa falhar, o backup local continua valendo, e a linha do registro avisa `FALHOU`.

## Restaurar

Use quando algo foi apagado ou corrompido, ou para voltar uma atualização.

1. Liste os backups:
   ```
   ls /opt/oneup/backups/apqr/diario /opt/oneup/backups/apqr/mensal
   ```
2. Rode a restauração com a pasta escolhida:
   ```
   /opt/oneup/apqr/restore.sh /opt/oneup/backups/apqr/diario/apqr-2026-10-01-0315
   ```
3. O script confere a integridade, mostra o resumo e pede para **digitar `RESTAURAR`**. Antes de mexer em qualquer coisa, ele faz um **backup de segurança do estado atual** (dá para desfazer a restauração restaurando esse backup).
4. Ele para o app, recria o banco, carrega a cópia, troca os arquivos enviados, religa o app e espera o teste de saúde. Esperado: `Restauração concluída`.

Tudo o que foi registrado depois do backup escolhido é substituído. Vendas que chegaram por webhook nesse intervalo podem ser reenviadas pelo checkout ou importadas por planilha.

## Restaurar num servidor novo

1. Siga o guia de instalação até o passo 4.3 (com senhas novas, se não tiver o `.env` antigo).
2. Copie a pasta do backup para `/opt/oneup/backups/apqr/` no servidor novo.
3. Rode o `restore.sh` com essa pasta.

## Trocar as senhas do banco depois da instalação

As senhas do `.env` só são lidas na primeira criação do banco. Para trocar depois:

- **Usuário do app (`APQR_DB_PASSWORD`)**: gere a nova (`openssl rand -hex 24`), aplique no banco e no `.env` e religue:
  ```
  docker compose exec db psql -U postgres -c "ALTER ROLE apqr_app PASSWORD 'NOVA_SENHA';"
  ```
  depois `nano .env` (troque `APQR_DB_PASSWORD`) e `docker compose up -d app`.
- **Administrador do banco (`POSTGRES_ADMIN_PASSWORD`)**: mesmo caminho, com `ALTER ROLE postgres PASSWORD 'NOVA_SENHA';`, depois atualize o `.env`.

## Backup próprio do app (alternativa)

O APQR também tem `npm run backup` / `npm run restore` (formato próprio, com conferência por tabela). Serve para mudar de tipo de banco ou de provedor. Para o dia a dia no VPS, use o `backup.sh`.
