# Arquitetura — ONE UP · Método APQR (V2)

## Visão geral

```
Navegador (React 19 + Vite)  ──HTTPS──>  Node 22 + Express 5  ──>  PostgreSQL ≥ 15 (produção)
                                                             └─>  PGlite (Postgres embutido, uso local no Windows)
```

- **Um único servidor** entrega a API (`/api`) e o site compilado (`web/dist`). Sem Redis, filas ou microserviços.
- **Banco:** PostgreSQL. Em produção, `DATABASE_URL`. Localmente, sem instalar nada, o PGlite (o mesmo Postgres rodando dentro do Node) grava em `./data/pglite`. Os dois executam o **mesmo SQL e as mesmas migrações** e passam na mesma suíte de testes.
- **Arquivos enviados** (materiais e logotipos) ficam em `FILES_DIR` (padrão `./data/files`), fora de qualquer pasta pública. Só saem pela API, depois da checagem de permissão.

## Multiambiente (ONE UP → professoras → alunos)

- Cada professora tem um **ambiente** (`tenants`). Todas as tabelas de dados têm `tenant_id`.
- **Row-Level Security (RLS)** com `FORCE`: toda consulta roda numa transação que define `app.tenant_id`. O próprio banco recusa leitura ou gravação de outro ambiente, **mesmo se o código errar**. Isso é coberto por testes.
- A aplicação conecta com um papel **sem privilégio de superusuário**, então a RLS vale para ela.
- **Admin ONE UP:** acesso global no console; para operar um ambiente, "entra" nele (cabeçalho `X-Tenant-Id`, auditado) e passa a enxergar só aquele ambiente. O cabeçalho é ignorado para qualquer outro perfil.

## Perfis e escopo

| Perfil | Enxerga | Não pode |
|---|---|---|
| Admin ONE UP | Tudo (console) ou um ambiente por vez | Desativar a própria conta |
| Professora | Tudo do próprio ambiente | Ver outro ambiente, criar professoras, usar o console |
| Monitor | Só os alunos atribuídos | Alterar editais, regras, equipe, conteúdos |
| Aluno | Só os próprios dados | Ver outros alunos, ranking, anotações, relatórios de IA, áreas administrativas |

## Regras do APQR versionadas

`methodology_configs` guarda cada versão das regras (mínimo de questões, percentual de consolidação, revisões por ciclo, rodízio, dias de inatividade). **Versões nunca são alteradas:** há um gatilho no banco que impede `UPDATE` e `DELETE`. Cada revisão grava `config_version`, `threshold_used` e `min_questions_used`, e uma mudança futura **não recalcula** o histórico. Detalhes em `DECISOES.md`.

## Histórico auditável

- Nada de histórico é apagado: revisões, sessões, questões e materiais são **anulados** (`voided_at`), não excluídos.
- `learning_events` guarda a linha do tempo de cada conteúdo (somente inclusão).
- `audit_log` registra as ações sensíveis: acesso a ficha e Raio-X, mudanças de regra, correções de etapa, entradas da ONE UP, IA, arquivos e identidade visual.

## Desempenho e escala

### Medição (teste de carga, `server/scripts/load-test.js`)

Ambiente com **1.000 alunos** e 60 dias de histórico: 60 mil progressos, 81 mil sessões, 45 mil revisões, 45 mil eventos. PostgreSQL 16 local.

| Tela / operação | Tempo (mediana) |
|---|---|
| Central da professora (1.000 alunos, com diagnósticos) | ~0,85 s |
| Ranking do edital | ~0,8 s |
| Lista de alunos | ~0,1 s |
| Raio-X de um aluno | ~25 ms |
| Painel do aluno | ~45 ms |
| Relatório (por regras) | ~40 ms |
| 50 alunos abrindo o painel ao mesmo tempo | ~1,3 s no total (~26 ms cada) |

### Decisões

- **Central e Ranking** usam um conjunto fixo de consultas agregadas por turma, com a lista de matrículas passada como array, apoiadas nos índices (matrícula, data). Não há uma consulta por aluno (N+1).
- **Sem cache, Redis ou fila:** com 1.000 alunos numa única turma a Central responde em menos de 1 segundo, e as telas do aluno em dezenas de milissegundos.
- **Até 10.000 alunos no total** (vários ambientes), o custo por ambiente continua o mesmo, porque cada professora só carrega a própria turma.
- **Quando revisar:** se um único ambiente passar de ~3.000 alunos ativos, o próximo passo é uma **tabela de resumo diário por matrícula** atualizada a cada registro (sem infraestrutura nova). Redis ou fila só entram se a medição com uso real indicar.
- O **limitador de tentativas** de login fica em memória: basta com um servidor. Com mais de uma instância, mover para o banco.

## Operação (V2.1)

- **Saúde:** `GET /api/health` confere a conexão com o banco e se todas as migrações do código estão aplicadas. Responde 200 (`ok: true`) ou 503, com o detalhe. `GET /api/health/live` verifica só o processo. A imagem Docker usa a verificação completa.
- **Logs:** uma linha JSON por requisição da API: `rid` (X-Request-Id, aceito de um proxy ou gerado), método, **rota como padrão** (ex.: `/api/auth/invite/:token`, nunca o token), status, duração, usuário, papel e ambiente. Requisições acima de 1 s saem como `request.slow` (`LOG_SLOW_MS`); erros 500, como `error`, com o `request_id` também na resposta ao usuário. Sem corpo de requisição, senha, token, CPF ou e-mail. Nível por `LOG_LEVEL`.
- **Desligamento limpo:** em `SIGTERM`/`SIGINT` para de aceitar conexões, termina as em andamento e fecha o banco (deploys sem requisição cortada).
- **Backup e restauração:** `npm run backup` gera uma pasta com o banco (uma linha JSON por registro, por tabela, compactado), os arquivos enviados e um manifesto com contagens e SHA-256. `npm run restore -- <pasta>` restaura **só num banco vazio**, na mesma versão, numa única transação, e confere o checksum de cada tabela e de cada arquivo antes de confirmar. Funciona igual no PostgreSQL e no PGlite. O ciclo backup → destruição → restauração → plataforma igual roda nos testes automáticos. Em produção com PostgreSQL gerenciado, mantenha também o backup automático do provedor (restauração para um ponto no tempo).
- **Verificação automática:** `.github/workflows/ci.yml` roda, a cada alteração, os testes no banco embutido e no PostgreSQL 16 (conectando como superusuário, para provar que a RLS continua valendo), compila o site, executa o teste de ponta a ponta no navegador e verifica vulnerabilidades.

## Segurança (revisão da Fase 7)

- **Senhas:** bcrypt (custo 11), comparação em tempo constante mesmo para e-mail inexistente; bloqueio após 10 erros (15 min); limite de tentativas por IP.
- **Sessão:** cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; token guardado apenas como hash; troca e redefinição de senha derrubam as outras sessões.
- **CSRF:** toda mutação exige o cabeçalho `X-Requested-With: apqr`, e o CORS não é habilitado.
- **Cabeçalhos:** CSP restritiva (sem scripts externos ou inline), `X-Frame-Options: DENY`, `nosniff`, HSTS em produção, `no-store` na API.
- **Convites e links de senha:** tokens aleatórios, guardados só como hash, de uso único e com validade; nunca vão para os logs.
- **Dados pessoais:** CPF mascarado nas listas; ficha completa sob demanda e auditada; a IA não recebe dados pessoais; exportação dos próprios dados pelo aluno (LGPD).
- **Arquivos:** o tipo é identificado pelos bytes (SVG, HTML e executáveis são recusados); download com `Content-Disposition` e CSP `sandbox`; aluno só baixa material publicado do próprio ambiente.
- **SQL:** sempre parametrizado; nomes de colunas dinâmicos vêm apenas de listas fixas no código.
- **Dependências:** `npm audit` sem vulnerabilidades (servidor e site).
- **Testes de isolamento:** aluno A × aluno B, professora A × ambiente B, monitor × alunos não atribuídos, aluno × áreas administrativas, professora × console, `X-Tenant-Id` forjado, gravação cruzada barrada pela RLS, ambiente suspenso.
