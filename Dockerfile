# ONE UP · Método APQR — imagem única (API + site). Sem compilação nativa: todas as dependências são JavaScript puro.
#
# O site (web/dist) já vem COMPILADO no repositório: o servidor nunca compila o site nem instala
# ferramentas de desenvolvimento (o VPS é compartilhado e uma compilação pode estourar a memória).
# Quem compila é quem desenvolve: `npm run build:web` (e `npm run release:check` confere antes de publicar).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 FILES_DIR=/data/files PGLITE_DIR=/data/pglite
COPY server/package*.json server/
RUN npm --prefix server ci --omit=dev && npm cache clean --force
COPY server server
COPY docs docs
COPY web/dist web/dist
# Em produção use DATABASE_URL (PostgreSQL). Sem ela, o PGlite grava em /data/pglite.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/src/index.js"]
