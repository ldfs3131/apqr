#!/bin/bash
# Roda UMA vez, na primeira criação do banco (volume vazio), pela imagem oficial do PostgreSQL.
# Cria o usuário do APQR SEM superpoderes (a Row-Level Security vale sempre) e passa o banco para ele.
set -euo pipefail
if [[ ! "${APQR_DB_PASSWORD:-}" =~ ^[A-Za-z0-9]{16,}$ ]]; then
  echo "ERRO: APQR_DB_PASSWORD precisa ter 16+ caracteres, só letras e números." >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v pw="$APQR_DB_PASSWORD" <<'SQL'
CREATE ROLE apqr_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'pw';
ALTER DATABASE apqr OWNER TO apqr_app;
ALTER SCHEMA public OWNER TO apqr_app;
SQL
echo "Usuário limitado apqr_app criado."
