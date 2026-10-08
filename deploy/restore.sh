#!/usr/bin/env bash
# Restauração do APQR a partir de um backup feito pelo backup.sh.
#
#   /opt/oneup/apqr/restore.sh /opt/oneup/backups/apqr/diario/apqr-2026-10-01-0315
#
# O que faz, nesta ordem:
#   1. confere a integridade do backup (SHA256SUMS);
#   2. pede confirmação digitando RESTAURAR;
#   3. faz um backup de segurança do estado atual (se o banco responder);
#   4. para o app, recria o banco e carrega a cópia; substitui os arquivos enviados;
#   5. sobe o app e espera ele responder "ok".
# ATENÇÃO: tudo que foi registrado depois do backup escolhido é substituído.
set -Eeuo pipefail

APQR_DIR="${APQR_DIR:-/opt/oneup/apqr}"
SRC="${1:-}"
cd "$APQR_DIR"

[ -n "$SRC" ] || { echo "Uso: $0 <pasta do backup>"; echo "Backups disponíveis:"; ls -1d /opt/oneup/backups/apqr/*/apqr-* 2>/dev/null | sort | tail -n 20; exit 1; }
SRC="$(cd "$SRC" && pwd)"
for f in banco.dump arquivos.tar.gz SHA256SUMS; do [ -f "$SRC/$f" ] || { echo "ERRO: falta $f em $SRC"; exit 1; }; done

echo "Conferindo integridade..."
(cd "$SRC" && sha256sum -c SHA256SUMS) || { echo "ERRO: backup corrompido. Escolha outro."; exit 1; }
[ -f "$SRC/INFO.txt" ] && cat "$SRC/INFO.txt"

echo
echo "Isto SUBSTITUI o banco e os arquivos atuais pelo conteúdo deste backup."
if [ "${CONFIRM:-}" != "RESTAURAR" ]; then
  read -r -p "Digite RESTAURAR para continuar: " CONFIRM
fi
[ "$CONFIRM" = "RESTAURAR" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }

echo "Backup de segurança do estado atual..."
if ! "$APQR_DIR/backup.sh"; then
  if [ "${FORCE_NO_SAFETY_BACKUP:-}" != "1" ]; then
    read -r -p "O backup de segurança falhou (banco fora do ar?). Continuar mesmo assim? (sim/não) " ok
    [ "$ok" = "sim" ] || { echo "Cancelado. Nada foi alterado."; exit 1; }
  fi
fi

echo "Parando o app..."
docker compose stop app

echo "Recriando o banco..."
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "DROP DATABASE IF EXISTS apqr WITH (FORCE);" \
  -c "CREATE DATABASE apqr OWNER apqr_app;"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U postgres -d apqr -c "ALTER SCHEMA public OWNER TO apqr_app;"

echo "Carregando a cópia do banco..."
docker compose exec -T db pg_restore -U postgres -d apqr --no-owner --role=apqr_app --exit-on-error < "$SRC/banco.dump"

echo "Substituindo os arquivos enviados..."
docker compose run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /data/files && mkdir -p /data && tar -xzf - -C /data' < "$SRC/arquivos.tar.gz"

echo "Subindo o app..."
docker compose up -d app
port="$(grep -E '^APQR_PORT=' .env 2>/dev/null | tail -n1 | cut -d= -f2 | tr -d '\r' || true)"
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${port:-3000}/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "Restauração concluída: o APQR está no ar com o conteúdo de $(basename "$SRC")."
    exit 0
  fi
  sleep 2
done
echo "ATENÇÃO: o app não respondeu em 2 minutos. Veja os registros com:  docker compose logs --tail 100 app"
exit 1
