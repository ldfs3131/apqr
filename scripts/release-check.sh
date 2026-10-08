#!/usr/bin/env bash
# Confere, ANTES de publicar, que o site compilado (web/dist) corresponde ao código-fonte e que a versão está coerente.
# Uso: npm run release:check        (falha com mensagem clara se algo estiver fora de sincronia)
set -Eeuo pipefail
cd "$(dirname "$0")/.."

ver="$(tr -d '[:space:]' < VERSION)"
[[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "ERRO: VERSION inválida ($ver)"; exit 1; }
[ -d web/dist ] && [ -f web/dist/index.html ] || { echo "ERRO: web/dist não existe. Rode: npm run build:web"; exit 1; }

if git rev-parse --git-dir > /dev/null 2>&1 && git check-ignore -q web/dist/index.html; then
  echo "ERRO: web/dist está sendo ignorado pelo Git (.gitignore). O servidor precisa dele no repositório."; exit 1
fi

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
npm --prefix web run build -- --outDir "$tmp/dist" --emptyOutDir > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; echo "ERRO: o site não compila."; exit 1; }
if ! diff -rq web/dist "$tmp/dist" > "$tmp/diff.txt"; then
  cat "$tmp/diff.txt"
  echo "ERRO: web/dist está desatualizado em relação ao código. Rode: npm run build:web  e envie o resultado."
  exit 1
fi

# Segredos: nenhum arquivo versionado pode conter chave/senha reais.
if git ls-files -z 2>/dev/null | xargs -0 grep -InE '(sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----)' 2>/dev/null; then
  echo "ERRO: possível segredo no código (linhas acima)."; exit 1
fi
if git ls-files | grep -Ei '(^|/)\.env$|\.csv$|\.pem$|\.dump$|\.sqlite'; then
  echo "ERRO: arquivo sensível versionado (lista acima)."; exit 1
fi
echo "ok: versão $ver · site compilado confere com o código · sem segredos"
