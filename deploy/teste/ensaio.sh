#!/usr/bin/env bash
# Ensaio do fluxo de atualização do APQR, sem servidor de verdade.
#
#   bash deploy/teste/ensaio.sh
#
# Usa um "Docker", um "rclone" e um "CallMeBot" de mentira (pasta fakes/) e um repositório Git de verdade
# (local). Os scripts testados são os REAIS: apqr, instalar.sh, backup.sh e restore.sh.
# Cenários: instalar/adaptar, atualizar com versão boa, versões quebradas (voltam sozinhas), cópia que falha,
# backup/restauração, cópia cifrada no Drive, avisos no WhatsApp e vigia.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SB="$(mktemp -d)"
PASS=0; FAIL=0

export APQR_HEALTH_TIMEOUT=6 APQR_TEST=1 APQR_POLL=1 APQR_RETRY_SLEEP=0 APQR_VIGIA_RETRY=0 APQR_SKIP_PUBLIC=1 APQR_CERT_DAYS=60 APQR_DISK_PERCENT=40
export APQR_DIR="$SB/opt/oneup/apqr" BACKUP_ROOT="$SB/opt/oneup/backups/apqr" CRON_DIR="$SB/etc/cron.d" BIN_DIR="$SB/usr/local/bin"
export LOGROTATE_DIR="$SB/etc/logrotate.d" APQR_LOG_DIR="$SB/var/log" NGINX_DIRS="$SB/etc/nginx/sites-enabled"
export FAKE_ROOT="$SB/fake" FAKE_DRIVE="$SB/drive" HOME="$SB/home" GNUPGHOME="$SB/home/.gnupg"
mkdir -p "$APQR_DIR" "$BACKUP_ROOT" "$CRON_DIR" "$BIN_DIR" "$LOGROTATE_DIR" "$APQR_LOG_DIR" "$NGINX_DIRS" "$FAKE_ROOT" "$FAKE_DRIVE/gdrive" "$HOME"
chmod 700 "$HOME"; mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
export PATH="$T/fakes:$BIN_DIR:$PATH"
PORT=$(( 20000 + RANDOM % 20000 )); WAPORT=$(( PORT + 1 ))
export APQR_ALERT_URL="http://127.0.0.1:$WAPORT/wa" WA_LOG="$SB/wa.log"
: > "$WA_LOG"
python3 "$T/wa_server.py" "$WAPORT" "$WA_LOG" & WA_PID=$!
cleanup() { kill "$WA_PID" 2>/dev/null; [ -f "$FAKE_ROOT/app.pid" ] && kill "$(cat "$FAKE_ROOT/app.pid")" 2>/dev/null; rm -rf "$SB"; }
trap cleanup EXIT
sleep 0.5

ok()   { PASS=$((PASS+1)); printf '  ✔ %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  ✘ %s\n' "$1"; [ -n "${2:-}" ] && printf '      %s\n' "$2" | head -n 12; }
expect() { # expect "descrição" comando...
  local d="$1"; shift
  if "$@" > "$SB/last.out" 2>&1; then ok "$d"; else bad "$d" "$(tail -n 8 "$SB/last.out")"; fi
}
contains() { grep -q -- "$1" "$2"; }
section() { printf '\n%s\n' "$1"; }
envget() { grep -E "^$1=" "$APQR_DIR/.env" | tail -n1 | cut -d= -f2-; }
health_version() { curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'; }
health_ok() { curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" 2>/dev/null | grep -q '"ok":true'; }
wa_count() { grep -c . "$WA_LOG" || true; }
backups_count() { ls -1d "$BACKUP_ROOT"/diario/apqr-* 2>/dev/null | wc -l; }
sleep_stamp() { sleep 1.1; } # os nomes das cópias têm resolução de minuto; o ensaio ajusta abaixo

# ───────── repositório de mentira (Git de verdade) ─────────
git init -q --bare "$SB/origin.git"; git -C "$SB/origin.git" symbolic-ref HEAD refs/heads/main
W="$SB/work"; git init -q -b main "$W"
git -C "$W" config user.email t@t; git -C "$W" config user.name teste
publish() { # publish VERSÃO MODO [sem-versao]
  local v="$1" m="$2"
  rm -rf "$W/deploy" "$W/web" "$W/server"; mkdir -p "$W/web/dist" "$W/server"
  cp -a "$ROOT/deploy" "$W/deploy"; rm -rf "$W/deploy/teste"
  cp "$ROOT/Dockerfile" "$W/Dockerfile"; echo '{}' > "$W/server/package.json"; echo "<html>$v</html>" > "$W/web/dist/index.html"
  [ "${3:-}" = sem-versao ] || echo "$v" > "$W/VERSION"
  echo "$m" > "$W/FAKE"
  [ "$m" = composeruim ] && { echo "# INVALID_MARKER" >> "$W/deploy/docker-compose.yml"; echo ok > "$W/FAKE"; }
  git -C "$W" add -A; git -C "$W" commit -q --allow-empty -m "v$v ($m)"
  git -C "$W" push -q "$SB/origin.git" main
}
mkbackup_stamp_fix() { :; }

# ───────── instalação "antiga" (como a que está no servidor: ZIP 2.3.0, sem APP_VERSION no compose) ─────────
publish 2.3.1 ok
cat > "$APQR_DIR/.env" <<EOF
APQR_VERSION=2.3.0
APP_URL=https://mentoria.exemplo.test
APQR_PORT=$PORT
POSTGRES_ADMIN_PASSWORD=senhaadmin1234567890
APQR_DB_PASSWORD=senhaapp1234567890
EOF
git -C "$W" show HEAD:deploy/docker-compose.yml | grep -v 'APP_VERSION' > "$APQR_DIR/docker-compose.yml"
git -C "$W" show HEAD:deploy/backup.sh > "$APQR_DIR/backup.sh"; git -C "$W" show HEAD:deploy/restore.sh > "$APQR_DIR/restore.sh"; chmod 755 "$APQR_DIR/backup.sh" "$APQR_DIR/restore.sh"
mkdir -p "$APQR_DIR/releases/apqr-2.3.0" "$APQR_DIR/postgres-init"; echo ok > "$APQR_DIR/releases/apqr-2.3.0/FAKE"
mkdir -p "$FAKE_ROOT/images" "$FAKE_ROOT/data/files"; : > "$FAKE_ROOT/images/oneup_apqr_2.3.0"
echo "alunos: 42" > "$FAKE_ROOT/db"; echo "pdf do aluno" > "$FAKE_ROOT/data/files/material.pdf"
docker compose up -d app > /dev/null
sleep 1

section "A. Instalador (adaptar o que já existe)"
expect "app antigo está no ar antes de começar (sem versão informada)" health_ok
if "$ROOT/deploy/instalar.sh" > "$SB/inst0.out" 2>&1; then bad "instalar.sh deveria recusar sem o clone do GitHub"; else ok "recusa sem o clone do GitHub, com as instruções"; fi
contains "ssh-keygen" "$SB/inst0.out" && ok "mostra o passo da chave de leitura (deploy key)" || bad "faltou instrução da chave" "$(tail -n 5 "$SB/inst0.out")"
[ ! -e "$BIN_DIR/apqr" ] && ok "nada foi instalado nessa recusa" || bad "instalou mesmo recusando"
git clone -q "$SB/origin.git" "$APQR_DIR/repo"
pid_before="$(cat "$FAKE_ROOT/app.pid")"
expect "instalar.sh conclui" bash "$ROOT/deploy/instalar.sh"
[ "$(cat "$FAKE_ROOT/app.pid")" = "$pid_before" ] && ok "o app NÃO foi reiniciado (sem queda)" || bad "o app foi reiniciado"
[ -x "$BIN_DIR/apqr" ] && ok "comando apqr instalado" || bad "apqr não instalado"
ls "$BACKUP_ROOT"/pre-adaptacao-*.tar.gz > /dev/null 2>&1 && ok "cópia completa da configuração antes de mexer" || bad "sem cópia pré-adaptação"
[ "$(backups_count)" -ge 1 ] && ok "cópia do banco feita antes de mexer" || bad "sem cópia do banco"
contains "03:40\|^40 3" "$CRON_DIR/apqr-backup" && contains "backup --agendado" "$CRON_DIR/apqr-backup" && ok "cron da cópia diária (03:40)" || bad "cron de cópia errado" "$(cat "$CRON_DIR/apqr-backup")"
contains "\*/5" "$CRON_DIR/apqr-vigia" && ok "cron do vigia (5 min)" || bad "cron do vigia errado"
expect "rodar o instalador de novo não causa efeito colateral" bash "$ROOT/deploy/instalar.sh"
[ "$(cat "$FAKE_ROOT/app.pid")" = "$pid_before" ] && ok "ainda sem reiniciar o app" || bad "reiniciou na segunda rodada"
# porta de outro sistema
mkdir -p "$SB/etc/nginx/sites-enabled"; printf 'server { server_name outro.exemplo.test; location / { proxy_pass http://127.0.0.1:%s; } }\n' "$PORT" > "$NGINX_DIRS/outro"
if bash "$ROOT/deploy/instalar.sh" > "$SB/inst2.out" 2>&1; then bad "deveria recusar porta usada por outro site"; else ok "recusa se a porta do APQR aparece no Nginx de outro site"; fi
rm -f "$NGINX_DIRS/outro"

# porta usada por outro sistema no PM2
mkdir -p "$SB/pm2"; printf '[{"name":"lavajato","pm2_env":{"PORT": "%s"}}]\n' "$PORT" > "$SB/pm2/dump.pm2"
if PM2_DUMPS="$SB/pm2/dump.pm2" bash "$ROOT/deploy/instalar.sh" > "$SB/inst3.out" 2>&1; then bad "deveria recusar porta usada no PM2"; else ok "recusa se a porta do APQR está no PM2 de outro sistema"; fi
# comando completo é repassado ao sudo
printf '#!/usr/bin/env bash\necho "sudo $*" >> "$FAKE_ROOT/sudo.log"\n' > "$SB/sudo"; chmod +x "$SB/sudo"
APQR_TEST=0 APQR_UID=1000 PATH="$SB:$PATH" apqr atualizar --forcar > /dev/null 2>&1
grep -q "atualizar --forcar" "$FAKE_ROOT/sudo.log" && ok "sem ser root, repassa o comando COMPLETO ao sudo (atualizar --forcar)" || bad "sudo recebeu argumentos errados" "$(cat "$FAKE_ROOT/sudo.log" 2>/dev/null)"

section "B. Status e versão"
expect "apqr status mostra NO AR" bash -c "apqr status | grep -q 'NO AR'"
expect "apqr status avisa que a cópia no Drive não está configurada" bash -c "apqr status | grep -q 'NÃO configurada'"
expect "apqr ajuda lista os comandos" bash -c "apqr ajuda | grep -q 'apqr atualizar'"

section "C. Atualizar com versão boa"
mkdir -p "$SB/b4"; n0="$(backups_count)"
sleep 1.2
expect "apqr atualizar 2.3.0 → 2.3.1" apqr atualizar
[ "$(envget APQR_VERSION)" = 2.3.1 ] && ok ".env passou para 2.3.1" || bad ".env não mudou" "$(envget APQR_VERSION)"
[ "$(health_version)" = 2.3.1 ] && ok "a versão no ar é a baixada (2.3.1)" || bad "versão no ar errada" "$(health_version)"
grep -q APP_VERSION "$APQR_DIR/docker-compose.yml" && ok "compose atualizado (agora informa a versão)" || bad "compose não atualizado"
[ "$(backups_count)" -gt "$n0" ] && ok "cópia de segurança feita antes da troca" || bad "sem cópia antes da troca"
[ ! -f "$APQR_DIR/estado/manutencao" ] && ok "marca de manutenção removida" || bad "manutenção ficou ligada"
[ -f "$APQR_DIR/estado/commit-atual" ] && ok "commit atual registrado" || bad "commit não registrado"
expect "atualizar de novo diz que já está na mais nova" bash -c "apqr atualizar | grep -q 'Já está na versão mais nova'"

section "D. Nova versão boa e voltar manualmente"
publish 2.3.2 ok; sleep 1.2
expect "apqr atualizar 2.3.1 → 2.3.2" apqr atualizar
[ "$(health_version)" = 2.3.2 ] && ok "no ar: 2.3.2" || bad "no ar errado" "$(health_version)"
[ "$(cat "$APQR_DIR/estado/versao-anterior")" = 2.3.1 ] && ok "versão anterior guardada (2.3.1)" || bad "versão anterior não guardada"
expect "apqr voltar" apqr voltar
[ "$(health_version)" = 2.3.1 ] && ok "voltou para 2.3.1 em segundos" || bad "não voltou" "$(health_version)"
sleep 1.2
expect "depois de voltar, apqr atualizar traz a 2.3.2 de novo" apqr atualizar
[ "$(health_version)" = 2.3.2 ] && ok "no ar: 2.3.2" || bad "no ar errado" "$(health_version)"

section "E. Versões QUEBRADAS (têm de voltar sozinhas)"
check_rollback() { # check_rollback VERSÃO MODO DESCRIÇÃO
  local v="$1" m="$2" d="$3" wa0 rc
  publish "$v" "$m"; sleep 1.2; wa0="$(wa_count)"
  apqr atualizar > "$SB/rb.out" 2>&1; rc=$?
  [ "$rc" -eq 1 ] && ok "$d: apqr atualizar terminou com erro (código 1)" || bad "$d: código de saída $rc" "$(tail -n 6 "$SB/rb.out")"
  contains "Voltou: a versão anterior" "$SB/rb.out" && ok "$d: voltou sozinho para a versão anterior" || bad "$d: sem mensagem de volta" "$(tail -n 8 "$SB/rb.out")"
  [ "$(envget APQR_VERSION)" = 2.3.2 ] && ok "$d: .env voltou para 2.3.2" || bad "$d: .env em $(envget APQR_VERSION)"
  [ "$(health_version)" = 2.3.2 ] && ok "$d: 2.3.2 está no ar" || bad "$d: no ar '$(health_version)'"
  [ "$(cat "$FAKE_ROOT/db")" = "alunos: 42" ] && ok "$d: dados preservados" || bad "$d: dados mudaram"
  [ ! -f "$APQR_DIR/estado/manutencao" ] && ok "$d: manutenção desligada" || bad "$d: manutenção ficou ligada"
  [ ! -d "$APQR_DIR/releases/apqr-$v" ] && ok "$d: pasta da versão ruim removida" || bad "$d: pasta da versão ruim ficou"
  [ "$(wa_count)" -gt "$wa0" ] && ok "$d: avisou no WhatsApp" || bad "$d: não avisou no WhatsApp"
}
APQR_ALERT_PHONE=5561999990000 APQR_ALERT_APIKEY=chave123 apqr alertas configurar > /dev/null
check_rollback 2.3.3 crash "versão que não liga"
check_rollback 2.3.4 buildfail "versão que não compila"
grep -c "build versão=2.3.4" "$FAKE_ROOT/docker.log" | grep -q '^3$' && ok "construção tentada 3 vezes antes de desistir" || bad "tentativas de build" "$(grep -c 'build versão=2.3.4' "$FAKE_ROOT/docker.log")"
check_rollback 2.3.5 wrongversion "versão no ar diferente da baixada"
cp "$APQR_DIR/docker-compose.yml" "$SB/compose.antes"
check_rollback 2.3.6 composeruim "configuração do Docker inválida"
cmp -s "$SB/compose.antes" "$APQR_DIR/docker-compose.yml" && ok "compose original restaurado" || bad "compose não foi restaurado"

section "F. Casos em que NÃO deve atualizar"
n0="$(backups_count)"
touch "$FAKE_ROOT/fail-pg_dump"; publish 2.3.7 ok; sleep 1.2
if apqr atualizar > "$SB/nb.out" 2>&1; then bad "atualizou sem conseguir fazer cópia"; else ok "cópia falhou → recusou atualizar"; fi
contains "NÃO atualizei nada" "$SB/nb.out" && ok "mensagem clara: nada foi alterado" || bad "mensagem" "$(tail -n 4 "$SB/nb.out")"
[ "$(envget APQR_VERSION)" = 2.3.2 ] && [ "$(health_version)" = 2.3.2 ] && ok "continua na 2.3.2" || bad "mudou de versão"
rm -f "$FAKE_ROOT/fail-pg_dump"
# versão mais antiga no GitHub
publish 2.3.0 ok
if apqr atualizar > "$SB/old.out" 2>&1; then bad "aceitou versão mais antiga"; else ok "recusa versão mais antiga que a em uso"; fi
contains "MAIS ANTIGA" "$SB/old.out" && ok "mensagem clara sobre versão mais antiga" || bad "mensagem versão antiga"
# mesmo VERSION, código diferente
publish 2.3.2 ok sem-versao
git -C "$W" commit -q --allow-empty -m "muda código sem mudar versão"; git -C "$W" push -q "$SB/origin.git" main
if apqr atualizar > "$SB/same.out" 2>&1; then bad "aceitou código novo sem VERSION nova"; else ok "recusa código novo com a mesma VERSION"; fi

section "G. Falha total (nem a versão anterior liga) → indica qual cópia restaurar"
publish 2.3.8 crash; sleep 1.2
echo crash > "$APQR_DIR/releases/apqr-2.3.2/FAKE"
apqr atualizar > "$SB/tot.out" 2>&1; rc=$?
[ "$rc" -eq 2 ] && ok "código de saída 2" || bad "código $rc" "$(tail -n 5 "$SB/tot.out")"
contains "apqr restaurar apqr-" "$SB/tot.out" && ok "diz qual cópia restaurar" || bad "sem indicação da cópia" "$(tail -n 6 "$SB/tot.out")"
echo ok > "$APQR_DIR/releases/apqr-2.3.2/FAKE"; docker compose up -d app > /dev/null; sleep 1
expect "sistema recuperado para os testes seguintes" health_ok

section "H. Cópia e restauração"
sleep 1.2
expect "apqr backup" apqr backup
b="$(ls -1d "$BACKUP_ROOT"/diario/apqr-* | sort | tail -n1)"; bn="$(basename "$b")"
echo "alunos: 0" > "$FAKE_ROOT/db"; rm -f "$FAKE_ROOT/data/files/material.pdf"
CONFIRM=RESTAURAR FORCE_NO_SAFETY_BACKUP=1 apqr restaurar "$bn" > "$SB/rest.out" 2>&1 && ok "apqr restaurar $bn" || bad "restaurar falhou" "$(tail -n 8 "$SB/rest.out")"
[ "$(cat "$FAKE_ROOT/db")" = "alunos: 42" ] && ok "banco voltou ao conteúdo da cópia" || bad "banco não voltou" "$(cat "$FAKE_ROOT/db")"
[ -f "$FAKE_ROOT/data/files/material.pdf" ] && ok "arquivos enviados voltaram" || bad "arquivos não voltaram"
[ ! -f "$APQR_DIR/estado/manutencao" ] && ok "manutenção desligada após restaurar" || bad "manutenção ficou ligada"

section "I. Cópia cifrada no Drive"
APQR_YES=1 APQR_REMOTE_CHOICE=1 apqr backup-externo configurar > "$SB/ext.out" 2>&1 && ok "backup-externo configurar" || bad "configurar falhou" "$(tail -n 8 "$SB/ext.out")"
contains "FRASE DAS CÓPIAS" "$SB/ext.out" && ok "mostra a frase uma vez (para o gerenciador de senhas)" || bad "não mostrou a frase"
[ "$(stat -c %a "$APQR_DIR/.backup-frase")" = 600 ] && ok "arquivo da frase com permissão 600" || bad "permissão da frase"
expect "apqr backup-externo agora" apqr backup-externo agora
f="$(ls "$FAKE_DRIVE"/gdrive/ONEUP-backups/apqr/diarias/*.tar.gpg 2>/dev/null | head -n1)"
[ -n "$f" ] && ok "arquivo cifrado chegou ao Drive (ONEUP-backups/apqr/diarias)" || bad "nada no Drive"
if [ -n "$f" ] && ! grep -aq "PGDMP\|alunos" "$f" && gpg --list-packets "$f" 2>/dev/null | grep -q "AES256\|cipher 9"; then ok "conteúdo cifrado com AES-256 (nada legível no arquivo)"; else bad "arquivo não parece cifrado AES-256" "$(gpg --list-packets "$f" 2>&1 | head -n 3)"; fi
ls "$FAKE_DRIVE"/gdrive/ONEUP-backups/apqr/mensais/*.tar.gpg > /dev/null 2>&1 && ok "cópia mensal criada" || bad "sem cópia mensal"
expect "apqr backup-externo listar" bash -c "apqr backup-externo listar | grep -q tar.gpg"
# retenção: 35 antigas → ficam 30
for i in $(seq 1 35); do : > "$FAKE_DRIVE/gdrive/ONEUP-backups/apqr/diarias/apqr-2020-01-$(printf '%02d' $((i%28+1)))-$(printf '%04d' "$i").tar.gpg"; done
sleep 1.2; apqr backup-externo agora > /dev/null 2>&1
[ "$(ls "$FAKE_DRIVE"/gdrive/ONEUP-backups/apqr/diarias | wc -l)" -eq 30 ] && ok "retenção: 30 diárias" || bad "retenção diárias" "$(ls "$FAKE_DRIVE"/gdrive/ONEUP-backups/apqr/diarias | wc -l)"
nm="$(ls "$FAKE_DRIVE"/gdrive/ONEUP-backups/apqr/diarias | sort | tail -n1)"
echo "alunos: 0" > "$FAKE_ROOT/db"
CONFIRM=RESTAURAR FORCE_NO_SAFETY_BACKUP=1 apqr restaurar-externo "$nm" > "$SB/rext.out" 2>&1 && ok "apqr restaurar-externo $nm" || bad "restaurar-externo falhou" "$(tail -n 8 "$SB/rext.out")"
[ "$(cat "$FAKE_ROOT/db")" = "alunos: 42" ] && ok "banco restaurado a partir do Drive" || bad "banco não voltou do Drive" "$(cat "$FAKE_ROOT/db")"
# servidor novo: sem o arquivo da frase, pede a frase (a do gerenciador de senhas)
frase="$(cat "$APQR_DIR/.backup-frase")"; mv "$APQR_DIR/.backup-frase" "$SB/frase.guardada"
echo "alunos: 0" > "$FAKE_ROOT/db"
printf 'frase-errada\n' | CONFIRM=RESTAURAR FORCE_NO_SAFETY_BACKUP=1 apqr restaurar-externo "$nm" > "$SB/rext2.out" 2>&1 && bad "frase errada não podia abrir" || ok "frase errada → recusa sem alterar nada"
[ "$(cat "$FAKE_ROOT/db")" = "alunos: 0" ] && ok "banco intacto após a frase errada" || bad "banco mudou com frase errada"
printf '%s\n' "$frase" | CONFIRM=RESTAURAR FORCE_NO_SAFETY_BACKUP=1 apqr restaurar-externo "$nm" > "$SB/rext3.out" 2>&1 && ok "servidor novo: restaura digitando a frase do gerenciador de senhas" || bad "restaurar com frase digitada falhou" "$(tail -n 6 "$SB/rext3.out")"
[ "$(cat "$FAKE_ROOT/db")" = "alunos: 42" ] && ok "banco restaurado com a frase digitada" || bad "banco não voltou" "$(cat "$FAKE_ROOT/db")"
mv "$SB/frase.guardada" "$APQR_DIR/.backup-frase"
# configurar em servidor novo usando a frase que já existe
mv "$APQR_DIR/.backup-frase" "$SB/frase.guardada"; rm -f "$APQR_DIR/.rclone-remoto"
printf '%s\n' "$frase" | APQR_REMOTE_CHOICE=1 APQR_FRASE_EXISTENTE=sim apqr backup-externo configurar > "$SB/ext2.out" 2>&1 && ok "configurar em servidor novo aceita a frase já existente (não gera outra)" || bad "configurar com frase existente falhou" "$(tail -n 6 "$SB/ext2.out")"
[ "$(cat "$APQR_DIR/.backup-frase")" = "$frase" ] && ok "a frase guardada é a mesma de antes" || bad "frase diferente"
rm -f "$SB/frase.guardada"
wa0="$(wa_count)"; sleep 1.2; : > "$SB/drivefail"
if APQR_FAKE_DRIVE_FAIL="$SB/drivefail" apqr backup-externo agora > "$SB/df.out" 2>&1; then bad "devia falhar com o Drive fora"; else ok "Drive indisponível → comando falha com mensagem"; fi
[ "$(wa_count)" -gt "$wa0" ] && tail -n1 "$WA_LOG" | grep -q "Google Drive" && ok "avisou no WhatsApp que a cópia no Drive falhou" || bad "sem aviso da falha no Drive"
apqr backup-externo agora > /dev/null 2>&1; tail -n1 "$WA_LOG" | grep -q "voltou ao normal" && ok "avisou quando voltou ao normal" || bad "sem aviso de volta"

section "J. Avisos no WhatsApp e vigia"
: > "$WA_LOG"
expect "apqr alerta teste" apqr alerta teste
contains "5561999990000|chave123|✅ APQR" "$WA_LOG" && ok "chegou no número e chave configurados" || bad "aviso de teste não chegou" "$(cat "$WA_LOG")"
[ "$(stat -c %a "$APQR_DIR/.alertas")" = 600 ] && ok "arquivo de avisos com permissão 600" || bad "permissão do .alertas"
: > "$WA_LOG"; rm -rf "$APQR_DIR/estado/alertas"; mkdir -p "$APQR_DIR/estado/alertas"; touch "$(ls -1d "$BACKUP_ROOT"/diario/apqr-* | tail -n1)"
apqr vigia; [ "$(wa_count)" -eq 0 ] && ok "tudo certo → nenhum aviso" || bad "avisou à toa" "$(cat "$WA_LOG")"
kill "$(cat "$FAKE_ROOT/app.pid")"; rm -f "$FAKE_ROOT/app.pid"; sleep 1
apqr vigia; grep -q "FORA DO AR" "$WA_LOG" && ok "sistema caiu → avisou FORA DO AR" || bad "não avisou a queda" "$(cat "$WA_LOG")"
n="$(wa_count)"; apqr vigia; [ "$(wa_count)" -eq "$n" ] && ok "não repete o aviso (6 h)" || bad "repetiu o aviso"
echo $(( $(date +%s) - 25000 )) > "$APQR_DIR/estado/alertas/fora_do_ar"; apqr vigia
grep -q "lembrete" "$WA_LOG" && ok "depois de 6 h manda lembrete" || bad "sem lembrete"
docker compose up -d app > /dev/null; sleep 1; apqr vigia
grep -q "voltou ao normal — sistema no ar" "$WA_LOG" && ok "sistema voltou → avisou que voltou" || bad "sem aviso de volta" "$(tail -n 3 "$WA_LOG")"
: > "$WA_LOG"; rm -rf "$APQR_DIR/estado/alertas"; mkdir -p "$APQR_DIR/estado/alertas"
kill "$(cat "$FAKE_ROOT/app.pid")"; rm -f "$FAKE_ROOT/app.pid"; date +%s > "$APQR_DIR/estado/manutencao"; sleep 1
apqr vigia; [ "$(wa_count)" -eq 0 ] && ok "em manutenção (atualizando) não avisa 'fora do ar'" || bad "avisou durante manutenção" "$(cat "$WA_LOG")"
echo $(( $(date +%s) - 2400 )) > "$APQR_DIR/estado/manutencao"; apqr vigia
grep -q "manutenção há mais de 30" "$WA_LOG" && ok "manutenção parada há 30+ min → avisa" || bad "sem aviso de manutenção travada" "$(cat "$WA_LOG")"
rm -f "$APQR_DIR/estado/manutencao"; docker compose up -d app > /dev/null; sleep 1
: > "$WA_LOG"; rm -rf "$APQR_DIR/estado/alertas"; mkdir -p "$APQR_DIR/estado/alertas"
APQR_DISK_PERCENT=91 apqr vigia; grep -q "disco" "$WA_LOG" && ok "disco acima de 85% → avisa" || bad "sem aviso de disco" "$(cat "$WA_LOG")"
: > "$WA_LOG"; APQR_CERT_DAYS=5 apqr vigia; grep -q "certificado HTTPS vence em 5 dias" "$WA_LOG" && ok "certificado vencendo → avisa" || bad "sem aviso de certificado" "$(cat "$WA_LOG")"
: > "$WA_LOG"; for d in "$BACKUP_ROOT"/diario/apqr-*; do touch -d '30 hours ago' "$d"; done; apqr vigia
grep -q "mais de 26 horas" "$WA_LOG" && ok "última cópia com mais de 26 h → avisa" || bad "sem aviso de cópia velha" "$(cat "$WA_LOG")"
: > "$WA_LOG"; touch "$APQR_DIR/estado/backup-falhou"; apqr vigia; grep -q "FALHOU" "$WA_LOG" && ok "cópia falhou → avisa" || bad "sem aviso de cópia que falhou"
rm -f "$APQR_DIR/estado/backup-falhou"

section "K. Outros comandos"
expect "apqr logs" bash -c "apqr logs | grep -q login"
expect "apqr acessos" bash -c "apqr acessos | grep -q 'tentativas de login'"
expect "apqr certificado" bash -c "apqr certificado | grep -q 'vence em 60 dias'"
expect "apqr versao" bash -c "apqr versao | grep -q 'Em execução'"
expect "apqr reiniciar" apqr reiniciar
expect "apqr com comando desconhecido recusa" bash -c "! apqr foobar"

printf '\n══════════════════════════════════════\nResultado: %s ok, %s com problema\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
