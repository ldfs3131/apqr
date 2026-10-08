# APQR VPS Production (v3.0.1)

Pacote para hospedar o APQR no VPS da ONE UP (Hostinger, Ubuntu 24.04, 1 vCPU, 4 GB, Docker). O sistema é o mesmo da V2.3.0: aqui só entra o que é preciso para rodar em produção com segurança.

> **Atualização (04/10/2026).** Na instalação real, o HTTPS ficou com **Nginx + certbot** (bloco `mentoria`), e não com o Caddy descrito neste pacote; o Caddy continua sendo uma opção para quando entrar o segundo sistema. As atualizações agora são feitas pelo comando `apqr` a partir do GitHub: veja `docs/INSTALACAO-ONLINE.md`. O `ATUALIZAR-E-VOLTAR-VERSAO.md` (por ZIP) continua válido como plano B.

## Como fica no servidor

```
Internet ──HTTPS──► Caddy (proxy único da ONE UP)  ──► 127.0.0.1:3000 ──► APQR ──► PostgreSQL
                    /opt/oneup/proxy                    (só o servidor      (rede interna do Docker,
                    certificado automático              enxerga)             sem porta pública)

/opt/oneup/
├── proxy/                    Caddy: um bloco por sistema (APQR hoje; Comanda e Lava Jato depois)
├── apqr/
│   ├── docker-compose.yml    produção do APQR
│   ├── .env                  segredos e versão em uso (nunca sai do servidor)
│   ├── postgres-init/        cria o usuário limitado do banco na primeira subida
│   ├── backup.sh             backup diário (agendado)
│   ├── restore.sh            restauração com conferência
│   └── releases/
│       └── apqr-2.3.0/       código desta versão (cada atualização ganha uma pasta)
└── backups/apqr/             diario/ (14 dias) e mensal/ (12 meses)
```

Cada sistema da ONE UP terá a própria pasta, o próprio banco e uma porta interna diferente (APQR 3000, Comanda 3001…).

## Documentos

| Arquivo | Para quê |
|---|---|
| `GUIA-INSTALACAO-VPS.md` | Instalação do zero, um comando por vez |
| `ATUALIZAR-E-VOLTAR-VERSAO.md` | Como instalar uma versão nova e como voltar para a anterior |
| `BACKUP-E-RESTAURACAO.md` | Backup diário, cópia fora do VPS, restauração e troca de senhas |

## Análise do pacote anterior (o que encontrei)

| # | Problema | Risco | Situação |
|---|---|---|---|
| 1 | O `docker-compose.yml` mandava o app conectar ao banco com SSL; o PostgreSQL do Docker não usa SSL | **O app não subiria** ("The server does not support SSL connections") | Corrigido (`DATABASE_SSL=0` na rede interna). Reproduzido e testado |
| 2 | Porta `3000:3000` aberta para todos | **Exposição**: o Docker passa por cima do UFW; o app ficaria acessível sem HTTPS | Corrigido: `127.0.0.1:3000:3000` |
| 3 | O app usava o usuário criado pela imagem do PostgreSQL, que é superusuário | Isolamento entre ambientes dependia de um ajuste interno do app | Corrigido: usuário próprio **sem superpoderes** (`apqr_app`); o administrador do banco fica só para backup |
| 4 | Nomes dos volumes dependiam do nome da pasta | **Perda aparente de dados**: renomear a pasta subiria um sistema vazio | Corrigido: nomes fixos (`apqr_pgdata`, `apqr_files`) |
| 5 | Logs do Docker sem limite | Disco cheio em alguns meses | Corrigido: 10 MB × 5 por serviço |
| 6 | Backup só manual e no mesmo disco | **Perda de dados** se o VPS falhar | Corrigido: backup diário verificado, retenção, restauração com conferência e envio para fora do VPS |
| 7 | O backup próprio do app (`npm run backup`) não incluía as tabelas novas da V2.3 (vendas, agenda, "visto") | Restauração por esse caminho perderia o financeiro | Corrigido, com teste que falha se alguma tabela nova ficar de fora |
| 8 | Sem limite de memória | Um pico no APQR poderia derrubar a Comanda no mesmo servidor | Corrigido: app 768 MB, banco 512 MB |
| 9 | Senha com símbolos quebra o endereço do banco | Erro de conexão difícil de entender | O guia gera senhas só com letras e números; o script recusa senha fraca |
| 10 | Nginx instalado ocupa as portas 80/443 | O Caddy não sobe junto | O guia verifica antes se o Nginx atende algo e decide com você |

## O que foi alterado em relação ao pacote atual

- **Novo:** pasta `deploy/` inteira (compose de produção, `.env.example` de produção, criação do usuário limitado do banco, Caddy, alternativa com Nginx, `backup.sh`, `restore.sh`, agendamento do backup e estes documentos).
- **`docker-compose.yml` da raiz** (uso simples): mesmas correções 1, 2 e 5.
- **`.dockerignore`**: passa a ignorar `node_modules` em qualquer pasta, `.env`, planilhas `.csv` e backups (nada disso entra na imagem).
- **`server/src/ops/backup.js`**: inclui as tabelas da V2.3 no backup do app (item 7), com teste novo.

## O que NÃO foi alterado

Telas, regras do método, autenticação, APIs, banco de dados (estrutura e migrações), integrações (webhook, IA, e-mail), `Dockerfile` (revisado e mantido igual) e o `render.yaml`.

## Como foi testado (sem o VPS)

- Suíte completa da API (122 testes) num PostgreSQL 16 com o **usuário limitado**, pelo nome de host `db` e sem SSL, exatamente como no Docker.
- Simulação de produção: o app compilado como na imagem, primeiro administrador criado pelo `.env`, ambiente da professora, vendas por webhook, PDF enviado, importação da base.
- `backup.sh` e `restore.sh` reais: backup → apagar vendas e arquivos → restaurar → mesmas contagens, arquivo idêntico (SHA-256), Row-Level Security e dono das tabelas preservados, app no ar.
- Retenção (diário e mensal), backup com zero arquivos enviados (falhava antes; corrigido), senha fraca recusada.
- Caddy 2.10: configuração validada e testada como proxy (site, API e envio de 15 MB).
- `docker compose config` dos dois compose e `shellcheck` dos scripts.
- **Não foi possível testar aqui:** a construção da imagem Docker em si (este ambiente não acessa o Docker Hub). Os mesmos passos da imagem foram executados fora do Docker com sucesso; a primeira construção real acontece no VPS (passo 4.1 do guia).
