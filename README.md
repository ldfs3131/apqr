# Pollyana Lyra · Método APQR — V2.3.0 (plataforma ONE UP)

Plataforma de acompanhamento de estudos para concursos pelo **Método APQR** (Assimilação → Produção de material → Questões → Revisão). É da **ONE UP**, e o primeiro ambiente é o da **Professora Pollyana Lyra**.

- **Aluno:** o que fiz, onde estou, o que falta e o que fazer agora; registro de estudo, materiais, revisões e questões; evolução; Estudar com IA.
- **Professora:** Central da mentoria (quem estuda, quem parou, quem precisa de atenção), Raio-X do aluno, editais, alunos e convites, equipe, ranking por edital, relatórios (com IA), **base de alunos** (planos, vencimentos, engajamento, listas para baixar), regras do método versionadas.
- **Aplicativo instalável (PWA):** o aluno instala na tela inicial (botão "Instalar aplicativo"; no iPhone, guia de 3 passos). Marca da Prof. Pollyana Lyra, assinatura "Desenvolvido por ONE UP" e divulgação do canal Revise Farmácia (veja `docs/DECISOES.md` §10).
- **Financeiro (professora):** vendas de qualquer checkout por webhook, importação de planilha, lançamento manual, produtos, painel (receita bruta/líquida, ticket, reembolsos) e liberação opcional de acesso. **Agenda:** aulas, reuniões, plantões e datas, por público, com arquivo .ics para o calendário do aluno. **Materiais:** vídeos (YouTube não listado), PDFs com marca d'água do aluno, links do Drive, textos e "já vi".
- **Temas:** Tradicional, Claro e Escuro (e Automático).
- **ONE UP:** console com ambientes, usuários, auditoria e acesso a qualquer ambiente (registrado).

| Parte | Tecnologia |
|---|---|
| Servidor | Node.js 22 · Express 5 · Zod |
| Banco | PostgreSQL ≥ 15 (produção) ou PGlite (Postgres embutido, sem instalar nada — uso local) |
| Site | React 19 · Vite · Recharts |
| Isolamento entre ambientes | Row-Level Security no banco |
| Testes | testes de API + ponta a ponta no navegador + teste de carga, rodando automaticamente no GitHub a cada alteração |

Documentação: [Arquitetura e segurança](docs/ARQUITETURA.md) · [Métricas e ranking](docs/METRICAS.md) · [Relatório com IA](docs/IA.md) · [Migração V1 → V2](docs/MIGRACAO.md) · [Decisões](docs/DECISOES.md) · [Publicar no ar (passo a passo)](docs/PUBLICAR.md) · **[VPS próprio (Docker + backup)](deploy/LEIA-ME.md)** · **[Atualizar, copiar e ser avisado (comando `apqr`)](docs/INSTALACAO-ONLINE.md)**

---

## Rodar no seu computador (Windows)

Você precisa só do **Node.js 22 LTS** (ou mais novo). O banco vem embutido.

1. Instale o Node.js 22 LTS em <https://nodejs.org> (botão "LTS") e reinicie o computador.
2. Descompacte a pasta do projeto, por exemplo em `C:\Users\SEU_USUARIO\Downloads\metodo-apqr`.
3. Abra o **Prompt de Comando** (tecla Windows → digite `cmd` → Enter). Use o Prompt de Comando, não o PowerShell: ele evita o erro de "execução de scripts desabilitada".
4. Entre na pasta e instale (só na primeira vez; leva alguns minutos):

   ```
   cd C:\Users\SEU_USUARIO\Downloads\metodo-apqr
   npm run setup
   ```

5. Crie o seu usuário de administrador ONE UP (troque e-mail, senha e nome; a senha precisa de 10+ caracteres com letras e números):

   ```
   npm run create-admin -- seu@email.com "SuaSenhaForte123" "Lucas Davi"
   ```

6. Inicie:

   ```
   npm start
   ```

   Abra <http://localhost:3000> e entre com o e-mail e a senha do passo 5. Para parar, pressione `Ctrl + C` no Prompt de Comando. Para abrir de novo depois, repita só os passos 3 (entrar na pasta) e 6.

**Dados de demonstração (opcional):** antes do `npm start`, rode `npm run demo`. Ele cria um ambiente "Mentoria Demo" com 10 alunos de perfis diferentes:

- admin: `admin@demo.oneup` / `demo12345`
- professora: `professora@demo.oneup` / `demo12345`
- alunos: `aluno1@demo.oneup` … `aluno10@demo.oneup` / `demo12345`

Não rode o demo num banco com alunos reais.

**Onde ficam os dados locais:** `server\data\pglite` (banco) e `server\data\files` (arquivos).

**Backup:** com o sistema parado (`Ctrl + C`), rode `npm run backup`. Ele cria uma pasta em `server\backups\` com o banco, os arquivos e um manifesto de conferência. Guarde essa pasta fora do computador (Google Drive, por exemplo). Para restaurar num banco novo: `npm run restore -- caminho\da\pasta`. A restauração confere tudo e só grava se estiver íntegro.

### Primeiros passos

1. **ONE UP → Ambientes → Novo ambiente.** Informe o nome (ex.: "Mentoria Pollyana Lyra") e o e-mail da professora. Copie o link de convite e envie a ela.
2. **Professora:** abre o link, cria a senha → **Editais → Novo edital** → cola as matérias e os conteúdos → **Plano Global**.
3. **Professora → Alunos → Convidar aluno:** nome, e-mail e edital → envia o link. O aluno completa CPF, telefone e endereço, aceita os termos e cria a senha.
4. **Professora → Configurações:** confere as regras do APQR (padrão: mínimo de 20 questões por revisão e consolidação acima de 70%). Cada mudança gera uma nova versão e não altera o histórico. Aqui também ficam o logotipo e a cor do ambiente.

---

## Colocar no ar (produção)

Precisa de um **PostgreSQL 15+** e de um servidor Node 22 com HTTPS. Opções simples: Render, Railway ou Fly.io com Postgres gerenciado (Neon, Supabase, o próprio Render). Também dá com Docker numa VPS.

Variáveis de ambiente (modelo completo em `.env.example`):

| Variável | Obrigatória | Para quê |
|---|---|---|
| `DATABASE_URL` | sim | conexão do PostgreSQL |
| `NODE_ENV=production` | sim | cookies seguros e HSTS |
| `APP_URL` | sim | endereço público (links de convite e de senha) |
| `TRUST_PROXY=1` | atrás de proxy | IP real do usuário (limite de tentativas) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | 1ª vez | cria o primeiro admin ONE UP (se não existir nenhum) |
| `FILES_DIR` | recomendada | pasta persistente dos arquivos enviados |
| `SMTP_URL`, `MAIL_FROM` | não | e-mail de "esqueci minha senha" |
| `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`) | não | relatório com IA (sem chave: relatório por regras) |

- **Build e start:** `npm run setup` e depois `npm start`. As migrações do banco rodam sozinhas ao iniciar.
- **Monitoramento:** configure o serviço para checar `GET /api/health` (200 = aplicação, banco e migrações ok; 503 = problema). Os logs saem em JSON, uma linha por requisição, com `X-Request-Id`.
- **Backup:** além do backup automático do Postgres gerenciado, rode `npm run backup` periodicamente (ele também copia os arquivos enviados). Veja `docs/ARQUITETURA.md` → Operação.
- **Docker:** `docker compose up -d` sobe o PostgreSQL e a aplicação (copie `.env.example` para `.env` antes). A imagem não compila nada nativo.
- **Banco:** a aplicação deve conectar com um usuário comum, dono das tabelas. Se conectar com superusuário, ela passa a operar sozinha com o papel `apqr_owner` para que o isolamento (RLS) continue valendo.
- **Arquivos:** em serviços com disco temporário (Render grátis, por exemplo), monte um disco persistente em `FILES_DIR`.

### Migrar os dados da V1

Veja [docs/MIGRACAO.md](docs/MIGRACAO.md): backup → simulação → migração → validação automática → como voltar.

### Importar a base de alunos da plataforma anterior

Pela tela: **Relatórios → Base de alunos → Importar ou atualizar base** (envia o CSV, mostra uma prévia e só grava quando você confirma).
Pela linha de comando:

```
cd server
npm run import-base -- --arquivo base-alunos-mentoria.csv --tenant pollyana-lyra --simular   # prévia, não grava
npm run import-base -- --arquivo base-alunos-mentoria.csv --tenant pollyana-lyra             # grava
```

Colunas aceitas: `nome` e `email` (obrigatórias), `celular`, `cpf`, `turma`, `turma_original`, `ultimo_login`, `fim_do_plano`, `situacao` (ativo/encerrado). Reimportar o mesmo arquivo atualiza, não duplica. Detalhes em [docs/DECISOES.md §9](docs/DECISOES.md).

---

## Testes

```
npm test            # testes de API (usa o banco embutido em memória)
npm run e2e         # jornada completa no navegador (compile o site antes com npm run setup); sem o navegador padrão do Playwright: CHROMIUM_PATH=/caminho/do/chromium npm run e2e
npm run load-test -- --students 1000   # teste de carga — SOMENTE num banco de teste (DATABASE_URL)
```

Para rodar os testes contra um PostgreSQL real: defina `DATABASE_URL` apontando para um banco **de teste**. Os testes apagam os dados.

## Estrutura

```
server/
  src/db/            conexão (Postgres/PGlite), migrações, RLS
  src/security/      autenticação, sessões, permissões, auditoria
  src/domain/        regras: apqr (etapas/revisões), settings (versões), indicators (central/ranking),
                     stats, guidance (sugestões), ai/ (relatório), contents, editais, people
  src/routes/        API: auth, me (aluno), enrollments, teacher, platform, files, public
  src/ops/           backup e restauração
  src/lib/log.js     logs estruturados e X-Request-Id
  scripts/           create-admin, seed-demo, import-v1, load-test, backup, restore
  test/              suítes de teste
web/src/
  pages/             aluno (raiz), teacher/ (professora), platform/ (ONE UP)
  components/        Layout, TopicDrawer, StructureEditor, AiReport, gráficos, ui
e2e/                 teste de ponta a ponta (Playwright)
.github/workflows/   verificação automática (CI)
docs/                arquitetura, métricas, IA, migração, decisões
```
