#!/usr/bin/env bash
# Backup do APQR: banco (pg_dump) + arquivos enviados (PDFs, logotipos), com verificação e retenção.
#
#   /opt/oneup/apqr/backup.sh            (o agendamento diário roda este mesmo comando)
#
# Resultado: /opt/oneup/backups/apqr/diario/apqr-AAAA-MM-DD-HHMM/
#   banco.dump        cópia do banco (formato do pg_restore)
#   arquivos.tar.gz   arquivos enviados
#   SHA256SUMS        conferência de integridade
#   INFO.txt          versão, data e tamanhos
# Retenção: últimos 14 diários + o primeiro backup de cada mês por 12 meses (pasta mensal/).
# Fora do VPS: se OFFSITE_REMOTE estiver no .env e o rclone configurado, envia uma cópia.
set -Eeuo pipefail

APQR_DIR="${APQR_DIR:-/opt/oneup/apqr}"
DEST="${BACKUP_DIR:-/opt/oneup/backups/apqr}"
KEEP_DAILY="${KEEP_DAILY:-14}"
KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

cd "$APQR_DIR"
envval() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '\r' || true; }

stamp="$(date +%F-%H%M%S)"
tmp="$DEST/.parcial-$stamp"
final="$DEST/diario/apqr-$stamp"
fail() { echo "$(date '+%F %T') BACKUP FALHOU: $1" >&2; rm -rf "$tmp"; exit 1; }
trap 'fail "erro na linha $LINENO"' ERR

umask 077
mkdir -p "$DEST/diario" "$DEST/mensal" "$tmp"
chmod 700 "$DEST"

# 1) Banco: cópia consistente com o sistema no ar.
docker compose exec -T db pg_dump -U postgres -d apqr -Fc > "$tmp/banco.dump"
[ -s "$tmp/banco.dump" ] || fail "cópia do banco vazia"
docker compose exec -T db pg_restore -l < "$tmp/banco.dump" > "$tmp/.conteudo" || fail "cópia do banco ilegível"
grep -q "TABLE DATA public sales" "$tmp/.conteudo" || fail "cópia do banco incompleta (tabelas ausentes)"
rm -f "$tmp/.conteudo"

# 2) Arquivos enviados (volume /data/files do app).
docker compose exec -T app sh -c 'mkdir -p /data/files && tar -czf - -C /data files' > "$tmp/arquivos.tar.gz"
tar -tzf "$tmp/arquivos.tar.gz" > /dev/null || fail "pacote de arquivos ilegível"

# 3) Conferência e informações.
(cd "$tmp" && sha256sum banco.dump arquivos.tar.gz > SHA256SUMS)
nfiles="$(tar -tzf "$tmp/arquivos.tar.gz" | grep -vc '/$' || true)"
{
  echo "APQR backup"
  echo "data: $(date '+%F %T %z')"
  echo "versao: $(envval APQR_VERSION)"
  echo "banco: $(du -h "$tmp/banco.dump" | cut -f1)"
  echo "arquivos: $(du -h "$tmp/arquivos.tar.gz" | cut -f1) (${nfiles:-0} arquivo(s))"
} > "$tmp/INFO.txt"
mv "$tmp" "$final"

# 4) Mensal: o primeiro backup de cada mês fica guardado por mais tempo.
month="$(date +%Y-%m)"
if ! ls -d "$DEST/mensal/apqr-$month-"* > /dev/null 2>&1; then cp -a "$final" "$DEST/mensal/"; fi

# 5) Retenção.
prune() { ls -1d "$1"/apqr-* 2>/dev/null | sort | head -n "-$2" | xargs -r rm -rf; }
prune "$DEST/diario" "$KEEP_DAILY"
prune "$DEST/mensal" "$KEEP_MONTHLY"

# 6) Cópia fora do VPS (opcional).
remote="$(envval OFFSITE_REMOTE)"
offsite="não configurada"
if [ -n "$remote" ]; then
  if command -v rclone > /dev/null; then
    rclone copy "$final" "$remote/diario/$(basename "$final")" && offsite="enviada para $remote" || offsite="FALHOU (o backup local está ok)"
  else
    offsite="FALHOU: rclone não instalado (o backup local está ok)"
  fi
fi

trap - ERR
echo "$(date '+%F %T') backup ok: $final · $(sed -n 's/^banco: //p' "$final/INFO.txt") de banco · $(sed -n 's/^arquivos: //p' "$final/INFO.txt") · cópia externa: $offsite"
