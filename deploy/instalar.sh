#!/usr/bin/env bash
# Adapta a instalação do APQR que já está no servidor para o fluxo "peço no chat → apqr atualizar".
#
#   sudo bash /opt/oneup/apqr/repo/deploy/instalar.sh
#
# O que faz (pode rodar de novo sem efeito colateral):
#   1. confere o que já existe (instalação do APQR, clone do GitHub, porta) e NÃO mexe em nada se algo estiver errado;
#   2. faz uma cópia completa do estado atual (configuração + banco + arquivos enviados). Sem cópia, não continua;
#   3. instala o comando `apqr` em /usr/local/bin e atualiza os scripts de cópia/restauração;
#   4. agenda a cópia diária (03:40) e o vigia (a cada 5 min);
#   5. NÃO reinicia o APQR (sem queda), NÃO toca no Nginx nem nos outros sistemas, no firewall, no fuso ou no Node.
# A troca do código em si acontece no primeiro `apqr atualizar`.
set -Eeuo pipefail

APQR_DIR="${APQR_DIR:-/opt/oneup/apqr}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/oneup/backups/apqr}"
CRON_DIR="${CRON_DIR:-/etc/cron.d}"
BIN_DIR="${BIN_DIR:-/usr/local/bin}"
LOGROTATE_DIR="${LOGROTATE_DIR:-/etc/logrotate.d}"
NGINX_DIRS="${NGINX_DIRS:-/etc/nginx/sites-enabled /etc/nginx/conf.d}"
DOCKER="${DOCKER:-docker}"
export APQR_DIR BACKUP_DIR="$BACKUP_ROOT"
REPO="$APQR_DIR/repo"
STATE="${APQR_STATE:-$APQR_DIR/estado}"
TS="$(date +%F-%H%M%S)"

say() { printf '%s\n' "$*"; }
die() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }
envget() { { grep -E "^$1=" "$APQR_DIR/.env" 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | tr -d '\r'; }

if [ "${APQR_TEST:-}" != "1" ] && [ "$(id -u)" -ne 0 ]; then exec sudo -E bash "$0" "$@"; fi

say "APQR — adaptação para o fluxo de atualização por GitHub"
say "──────────────────────────────────────────────────────"

# ───── 1. Conferências (nada é alterado aqui) ─────
say "1/5 Conferindo o servidor..."
for c in git curl gpg openssl flock tar; do command -v "$c" > /dev/null || die "falta o programa '$c' (instale com: sudo apt-get install -y $c)."; done
"$DOCKER" compose version > /dev/null 2>&1 || die "o Docker Compose não está disponível."
[ -f "$APQR_DIR/.env" ] && [ -f "$APQR_DIR/docker-compose.yml" ] || die "não encontrei a instalação do APQR em $APQR_DIR (faltam .env e docker-compose.yml). Este script só adapta uma instalação que já existe."
[ -x "$APQR_DIR/backup.sh" ] || die "falta o $APQR_DIR/backup.sh da instalação atual."

if [ ! -d "$REPO/.git" ]; then
  cat >&2 <<EOF

ERRO: o clone do GitHub ainda não existe em $REPO. Faça estes passos (um comando por vez) e rode este script de novo:

  1) sudo mkdir -p $APQR_DIR/.ssh && sudo ssh-keygen -t ed25519 -N "" -C "apqr-servidor" -f $APQR_DIR/.ssh/deploy_key
  2) sudo cat $APQR_DIR/.ssh/deploy_key.pub
     → copie a linha que aparece e cole em GitHub → repositório apqr → Settings → Deploy keys → Add deploy key
       (deixe DESMARCADO "Allow write access": a chave só lê)
  3) sudo git clone -c core.sshCommand="ssh -i $APQR_DIR/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git@github.com:ldfs3131/apqr.git $REPO

Nada foi alterado no sistema.
EOF
  exit 1
fi
git -C "$REPO" fetch --tags --prune origin main > /dev/null 2>&1 || die "não consegui buscar o GitHub com a chave de leitura. Confira se a chave foi adicionada em Deploy keys e se o repositório é ldfs3131/apqr."
for f in deploy/apqr deploy/backup.sh deploy/restore.sh VERSION; do
  git -C "$REPO" cat-file -e "origin/main:$f" 2> /dev/null || die "o GitHub não tem $f no ramo main (o código ainda não foi publicado completo)."
done
say "   GitHub ok: versão $(git -C "$REPO" show origin/main:VERSION | tr -d '[:space:]') disponível."

port="$(envget APQR_PORT)"; port="${port:-3000}"
host="$(envget APP_URL | sed -E 's#^[a-z]+://##; s#[/:].*$##')"
if [ "${APQR_TEST:-}" != "1" ] && command -v ss > /dev/null; then
  owner="$(ss -ltnpH "sport = :$port" 2> /dev/null | head -n1 || true)"
  if [ -n "$owner" ] && ! printf '%s' "$owner" | grep -qE 'docker|containerd'; then
    die "a porta $port (do APQR) está sendo usada por outro programa: $owner"
  fi
fi
for d in $NGINX_DIRS; do
  [ -d "$d" ] || continue
  while IFS= read -r file; do
    if [ -n "$host" ] && ! grep -q "$host" "$file"; then die "a porta $port aparece no Nginx em $file, que não é o site do APQR ($host). Confira antes de continuar."; fi
  done < <(grep -lE "127\.0\.0\.1:$port\b|localhost:$port\b" "$d"/* 2> /dev/null || true)
done
for dump in /root/.pm2/dump.pm2 /home/*/.pm2/dump.pm2 ${PM2_DUMPS:-}; do
  [ -f "$dump" ] || continue
  if grep -qE "\"PORT\": *\"?$port\"?[,} ]" "$dump"; then die "a porta $port aparece no PM2 ($dump), de outro sistema (ex.: Lava Jato), mesmo que esteja desligado. Escolha outra porta para o APQR."; fi
done
say "   porta $port: só o APQR."
if git -C "$REPO" show "origin/main:deploy/docker-compose.yml" 2> /dev/null | grep -v APP_VERSION | diff -q - <(grep -v APP_VERSION "$APQR_DIR/docker-compose.yml") > /dev/null 2>&1; then
  say "   docker-compose.yml: igual ao do GitHub."
else
  say "   AVISO: o docker-compose.yml do servidor é diferente do GitHub. O primeiro 'apqr atualizar' vai trocá-lo pelo do GitHub"
  say "          (e volta ao atual sozinho se algo falhar). Se você personalizou algo nele, avise o Claude antes."
fi
if "$DOCKER" compose -f "$APQR_DIR/docker-compose.yml" --project-directory "$APQR_DIR" port db 5432 > /dev/null 2>&1; then
  die "o banco do APQR está publicado para fora do Docker. Isso não é seguro; avise o Claude antes de continuar."
fi
say "   banco do APQR: sem porta exposta (ok)."

# ───── 2. Cópia completa do estado atual ─────
say "2/5 Cópia completa do estado atual (configuração + banco + arquivos)..."
mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
pre="$BACKUP_ROOT/pre-adaptacao-$TS.tar.gz"
(umask 077; tar -czf "$pre" -C "$APQR_DIR" --exclude=./repo --exclude=./releases --exclude=./estado . ) || die "não consegui guardar a configuração atual."
[ -s "$pre" ] || die "cópia da configuração vazia."
say "   configuração guardada em: $pre"
"$APQR_DIR/backup.sh" || die "a cópia do banco falhou. Sem cópia, não adapto nada."

# ───── 3. Comando apqr e scripts ─────
say "3/5 Instalando o comando apqr..."
mkdir -p "$STATE/alertas" "$STATE/instalador-anteriores/$TS"; chmod 700 "$STATE"
git -C "$REPO" show "origin/main:deploy/apqr" > "$BIN_DIR/apqr.novo"; chmod 755 "$BIN_DIR/apqr.novo"
bash -n "$BIN_DIR/apqr.novo" || { rm -f "$BIN_DIR/apqr.novo"; die "o comando apqr do GitHub tem erro de sintaxe."; }
for f in backup.sh restore.sh; do
  git -C "$REPO" show "origin/main:deploy/$f" > "$APQR_DIR/$f.novo"
  bash -n "$APQR_DIR/$f.novo" || { rm -f "$APQR_DIR/$f.novo" "$BIN_DIR/apqr.novo"; die "o $f do GitHub tem erro de sintaxe."; }
done
for f in backup.sh restore.sh; do
  [ -f "$APQR_DIR/$f" ] && cp -p "$APQR_DIR/$f" "$STATE/instalador-anteriores/$TS/$f"
  chmod 755 "$APQR_DIR/$f.novo"; mv -f "$APQR_DIR/$f.novo" "$APQR_DIR/$f"
done
mv -f "$BIN_DIR/apqr.novo" "$BIN_DIR/apqr"

# ───── 4. Agendamentos ─────
say "4/5 Agendando cópia diária (03:40) e vigia (a cada 5 min)..."
mkdir -p "$CRON_DIR"
cat > "$CRON_DIR/apqr-backup" <<EOF
# Cópia diária do APQR às 03:40 (horário do servidor). Gerado por instalar.sh.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
40 3 * * * root $BIN_DIR/apqr backup --agendado >> /var/log/apqr-backup.log 2>&1
EOF
cat > "$CRON_DIR/apqr-vigia" <<EOF
# Vigia do APQR a cada 5 minutos: avisa no WhatsApp (se configurado). Gerado por instalar.sh.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root $BIN_DIR/apqr vigia >> /var/log/apqr-vigia.log 2>&1
EOF
chmod 644 "$CRON_DIR/apqr-backup" "$CRON_DIR/apqr-vigia"
if [ -d "$LOGROTATE_DIR" ]; then
  cat > "$LOGROTATE_DIR/apqr" <<'EOF'
/var/log/apqr-backup.log /var/log/apqr-vigia.log /var/log/apqr-atualizacoes.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
EOF
fi

# ───── 5. Conferência final ─────
say "5/5 Conferindo..."
"$BIN_DIR/apqr" status || true
cat <<EOF

✔ Adaptação concluída. O APQR continuou no ar durante todo o processo (nada foi reiniciado).

Próximos passos (um de cada vez):
  1) apqr atualizar                  → traz a versão do GitHub e confere (o primeiro uso troca para o código do GitHub)
  2) apqr alertas configurar         → avisos no seu WhatsApp
  3) apqr backup-externo configurar  → cópia cifrada no Google Drive
  Guia completo: $REPO/docs/INSTALACAO-ONLINE.md
EOF
