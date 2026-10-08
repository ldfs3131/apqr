# Decisões de produto e técnicas — V2.2

Registro das regras implementadas e das decisões tomadas onde o briefing não especificava. Cada item confere com o código atual. Quando o código muda, este arquivo muda junto.

## 1. Regras do método APQR (servidor: `server/src/domain/apqr.js`)

| Regra | Implementação |
|---|---|
| Etapas | Não iniciado → Assimilação (A) → Material pronto (P) → Em revisão (Q + R) → Consolidado. Pesos do progresso APQR: 0, 25, 50, 75 e 100. |
| Mudança de etapa | Manual e **somente para frente**. O aluno nunca volta etapa. |
| Pular etapas | Permitido para frente (ex.: migração de planilha), com data retroativa; as etapas intermediárias recebem a mesma data. Data futura é recusada. |
| Correção de engano | Só a professora ou o monitor, com motivo, e só se o conteúdo **não tiver revisões válidas**. Fica no histórico e na auditoria. |
| Consolidação | Automática quando `acertos × 100 > percentual × questões` (aritmética inteira, sem arredondamento). Exatamente o percentual **não** consolida. Nunca é manual. |
| Revisões | Só na etapa Em revisão, cada uma com o mínimo de questões vigente (máximo operacional de 500 questões por revisão). |
| Limite por ciclo | Ao atingir o número máximo de revisões do ciclo sem consolidar, o conteúdo fica **aguardando rodízio**. |
| Revisões extras | A professora pode liberar, por aluno. Com isso, depois do limite o aluno continua revisando (R5, R6… marcadas como extras) sem esperar o rodízio. O critério de consolidação não muda. |
| Rodízio | **Manual** (padrão): a professora libera um novo ciclo. **Automático**: libera quando todos os outros conteúdos em revisão (e não travados) receberam ao menos uma revisão depois do bloqueio, e existem pelo menos *N* deles (padrão 3). O histórico do ciclo anterior é mantido. |
| Material | Produção de material (resumo, mapa mental, esquema, flashcards, anotações, outro) é registrada sem mudar a etapa. Na fase de revisão, conta como "material atualizado". |
| Desfazer revisão | Aluno: só a última, em até **30 minutos** (correção de digitação). Professora: a qualquer momento, com motivo. A revisão é **anulada** (fica no histórico, riscada), nunca apagada. Desfazer a revisão que consolidou volta o conteúdo para Em revisão. |

## 2. Configuração do APQR parametrizada e versionada (`server/src/domain/settings.js`)

- **Onde:** tabela `methodology_configs`, com uma linha por versão e por ambiente.
- **Parâmetros e faixas aceitas:**

  | Parâmetro | Padrão inicial | Faixa |
  |---|---|---|
  | `min_questions_per_review` | **20** | 1–500 |
  | `consolidation_threshold` (consolida quando o resultado é **maior** que o valor) | **70** | 50–95 |
  | `max_reviews_per_cycle` | 4 | 2–6 |
  | `rotation_mode` | manual | manual ou auto |
  | `rotation_min_other_topics` | 3 | 1–200 |
  | `inactivity_days` (dias para "parado") | 7 | 2–60 |

- **Nenhum valor de regra fixo no código:** o código conhece só o padrão usado para criar a versão 1 de um ambiente e a faixa segura de cada parâmetro.
- **Alteração:** tela Configurações da professora (ou `PUT /api/teacher/settings`), com motivo obrigatório e confirmação. Cria a versão N+1 e registra na auditoria. Monitores não alteram.
- **Histórico preservado:** cada revisão grava `config_version`, `min_questions_used` e `threshold_used`. A regra é lida na mesma transação que registra a revisão. O banco recusa `UPDATE` e `DELETE` em `methodology_configs`. Consolidações passadas nunca são recalculadas.

## 3. Editais

- **Um edital único por concurso**, no ambiente da professora. Todos os alunos vinculados usam as mesmas matérias e conteúdos; o progresso é individual (`topic_progress`). Não há cópia de edital por aluno.
- Só a professora cria e altera editais. Renomear, mover ou arquivar um conteúdo vale para todos os alunos, sem perder progresso. Nada com histórico é apagado: remover significa arquivar.
- **Plano Global:** prioridade e relevância por matéria. Orienta a sugestão "o que fazer agora"; não é cronograma.

## 4. Registro de estudo

- O estado do cronômetro fica **no servidor**: sobrevive a recarregar a página, fechar o navegador e trocar de aparelho.
- Um estudo por vez. Sessões com menos de 1 minuto não são salvas. Há aviso a partir de 4 h; a duração pode ser **reduzida** ao finalizar, nunca aumentada; o teto é de 16 h por sessão.
- Cada sessão guarda a atividade (estudo, assimilação, produção, questões, revisão).
- Registro manual: data até 1 ano atrás, sem data futura, de 1 minuto a 16 h, total do dia ≤ 24 h.
- Iniciar estudo num conteúdo não iniciado **sugere** marcar como Em assimilação, mas só muda se o aluno confirmar.

## 5. Indicadores do aluno

- **Percentual de acertos** = total de acertos ÷ total de questões (ponderado), nunca média de percentuais.
- **Questões avulsas** (treino e simulado) entram no total de questões, mas não contam como revisão nem mudam a etapa.
- **Dias e sequência** são contados no fuso do aluno (padrão America/Sao_Paulo).
- Central, Raio-X, Ranking e diagnósticos estão em `METRICAS.md`.

## 6. Perfis, acesso e dados pessoais

- **Perfis:** admin ONE UP (global), professora (o próprio ambiente), monitor (só alunos atribuídos), aluno (só os próprios dados). Detalhes em `ARQUITETURA.md`.
- **Cadastro só por convite** (link com token de uso único e validade). O aluno informa CPF, telefone e endereço e aceita os termos.
- Recurso de outro aluno ou de outro ambiente responde **404** (não revela que existe).
- CPF fica mascarado nas listas; a ficha completa é aberta sob demanda e auditada. O aluno exporta os próprios dados (LGPD) pelo perfil.
- **Sem busca de CEP em serviço externo**, para não enviar dado do aluno a terceiros.

## 7. Decisões da V2 (Fases 3 a 8)

- **Diagnósticos por regras fixas** (tabela em `METRICAS.md`). Os limites que são regra do método ficam na configuração versionada; os limites de alerta (ex.: 14 dias sem revisar) ficam no código, documentados.
- **Ranking com três indicadores independentes** (Consolidação, Constância, Evolução), sem nota composta. Horas não entram. Alunos com menos de 7 dias aparecem como "Novo", sem posição. Visível só para a mentoria.
- **Relatório com IA só para a mentoria.** O aluno não vê; a professora copia a mensagem sugerida. A IA não recebe dados pessoais (ver `IA.md`).
- **Arquivos fora de pasta pública**, com tipo identificado pelos bytes; SVG não é aceito.
- **Sem Redis, filas ou cache** (medição com 1.000 alunos em `ARQUITETURA.md`).
- **Superusuário no banco:** a aplicação troca sozinha para o papel `apqr_owner`, para a RLS nunca ser ignorada.

## 8. Decisões da V2.1 (endurecimento, depois da auditoria externa)

- **IA sem números próprios:** a IA escreve marcadores `{chave}` e a plataforma preenche os valores. Qualquer dígito ou mês escrito pela IA reprova o texto. Substitui a V2, que conferia se os números existiam nos fatos.
- **Central com dois escopos explícitos:** "Todos os editais" = uma linha por aluno, com a atividade somando todos os editais e a consolidação separada por edital. Com um edital selecionado = uma linha por matrícula, só com dados daquele edital. O Raio-X é sempre por edital.
- **Saúde real:** `/api/health` responde 200 só se o banco responde e todas as migrações do código estão aplicadas; caso contrário, 503. `/api/health/live` verifica só o processo.
- **Rastreabilidade:** cada requisição ganha um `X-Request-Id` e uma linha de log JSON (rota como padrão, status, duração, usuário, papel, ambiente), sem dados pessoais nem tokens. Erros 500 devolvem o `request_id` para localizar o log.
- **Backup e restauração lógicos** (`npm run backup` e `npm run restore`), iguais no PostgreSQL e no PGlite, com checksum por tabela e por arquivo. A restauração só roda em banco vazio, numa transação, e é testada automaticamente (backup → destruição → restauração → plataforma igual).
- **Verificação automática (GitHub Actions):** testes no banco embutido e no PostgreSQL 16, compilação do site, teste de ponta a ponta e verificação de vulnerabilidades a cada alteração.
- **Não entram agora (documentado):** limitador de tentativas compartilhado entre servidores e arquivos em S3/R2. Só são necessários com mais de uma instância.

## 9. Base de alunos (V2.2)

- **Para que serve:** ver quem está estudando, quem está para vencer e todos os que já passaram pela mentoria; baixar listas para monitoramento, renovação e recuperação de vendas. Fica em **Relatórios → Base de alunos**.
- **Plano:** cada aluno tem situação (`ativo`/`encerrado`) e data de fim (`access_until`). Com plano ativo, passada a data, ele conta como encerrado automaticamente. Plano encerrado não entra (mesma mensagem de acesso expirado); encerrar derruba as sessões. **Renovar** = informar uma nova data de fim no futuro (no Raio-X → Cadastro → Plano na mentoria): o plano volta a ativo. Só a professora encerra ou reabre plano.
- **Engajamento** pelo último acesso, que é o mais recente entre: login nesta plataforma, último registro de estudo e último login na plataforma anterior. Faixas fixas (as mesmas do relatório da plataforma anterior): até 7 dias = Ativo · 8 a 30 = Atenção · mais de 30 = Inativo · sem registro = Nunca acessou. Os filtros de download usam "mais de 7 / 15 / 30 dias sem acesso".
- **Cores** de engajamento são estados (verde, âmbar, vermelho, cinza), conferidas para daltonismo nos temas claro e escuro, e sempre acompanhadas de ícone e rótulo.
- **Turma:** `turma` é o concurso foco (agrupamento); `turma_original` guarda o nome da turma na plataforma anterior.
- **Importação (CSV):** o e-mail identifica o aluno. Reimportar atualiza turma, plano e último acesso, sem duplicar, e nunca altera senha, nome ou dados de estudo de quem já existe; o último login nunca volta no tempo. Alunos novos entram com **cadastro pendente** (sem senha e sem convite enviado): a professora gera o convite quando quiser. CPF inválido ou já usado por outro aluno é ignorado com aviso. E-mail de alguém da equipe ou de outro ambiente é recusado. Sempre há prévia antes de gravar. Só a professora importa.
- **Listas para baixar:** CSV para Excel em português (separador `;`, acentos corretos, datas dd/mm/aaaa) com nome, e-mail, celular, turma, plano, fim do plano, dias para vencer, último acesso, dias sem acesso e engajamento. **Sem CPF** (minimização de dados). Conteúdo que começa com `=`, `+`, `-` ou `@` é neutralizado para o Excel não executar fórmula. Cada download fica na auditoria (filtros e quantidade). Monitores baixam só os alunos atribuídos a eles.
- **Base inicial:** a relação de 01/10/2026 da plataforma anterior (785 cadastros: 84 planos ativos e 701 encerrados, 25 turmas) foi convertida do PDF para `base-alunos-mentoria.csv` e conferida turma por turma com o resumo do próprio PDF. Duas contas internas que o PDF já excluía continuam fora. Dois CPFs do PDF são inválidos e ficam em branco (o aluno informa ao concluir o cadastro). Um cadastro tem só o apelido "Lu" como nome, mantido como está.

## 10. Marca da Pollyana Lyra, assinatura ONE UP e aplicativo instalável (V2.2.1)

- **Esta instalação é exclusiva da Prof. Pollyana Lyra (por enquanto).** A marca padrão (logo, nome do app "Pollyana Lyra · Método APQR", cores azul `#0a4296` e dourado `#fcb132`) vem do próprio site (`web/src/lib/brand.js`, `web/public/brand/`). A plataforma continua multiambiente: se um ambiente enviar o próprio logo/cor em Configurações, o dele vence a marca padrão. O rosa do símbolo é só decorativo (não tem contraste para texto).
- **Logos:** recortados e com fundo transparente. Em fundos escuros o logo da Pollyana aparece sobre uma base branca; a ONE UP usa a versão branca/dourada. O símbolo da cruz é o ícone do app.
- **Assinatura da ONE UP** ("Desenvolvido por ONE UP · © ano · Todos os direitos reservados"): fixa, discreta, na camada da plataforma (não muda com a marca do ambiente). Aparece na tela de entrada, no rodapé do menu, no menu "Mais" do celular e no rodapé do relatório em PDF; cinza e translúcida, ganha cor ao passar o mouse e mostra a versão. Não aparece no console ONE UP (que já é da ONE UP).
- **Revise Farmácia:** cartão com o logo e o link do canal (https://www.youtube.com/@revisefarmacia) no fim da tela Hoje (o aluno pode dispensar por 30 dias), no Perfil (sempre) e um link discreto na tela de entrada. Nunca dentro do fluxo de estudo.
- **Aplicativo instalável (PWA):** manifesto, ícones (incluindo versão para máscara do Android), atalhos "Registrar estudo" e "Revisões de hoje", service worker e página "sem conexão". **Botão "Instalar aplicativo"**: instala com um toque no Android e no computador (Chrome/Edge); no iPhone abre um guia de 3 passos (a Apple não permite instalar por botão). Aparece num aviso na tela Hoje (dispensável por 14 dias), no menu lateral, no menu "Mais" e no Perfil; some quando o app já está instalado.
- **O que o app faz offline:** abre mais rápido e, sem internet, mostra a casca do app e um aviso de falta de conexão. **Não guarda dados do aluno no aparelho**: respostas de `/api` nunca entram no cache, e novos registros exigem internet. Registro offline com sincronização e notificações push ficam para uma etapa posterior (backlog).
- **Lojas (Play Store / App Store):** fora do escopo agora. Android seria um empacotamento simples (conta ~US$ 25 uma vez); iPhone tem aprovação mais rigorosa (conta ~US$ 99/ano) e cada marca precisaria da própria conta.


## 11. Layout, Financeiro, Agenda e Materiais (V2.3)

- **Temas:** Tradicional, Claro e Escuro (mais Automático, que segue o aparelho). A escolha fica no aparelho do usuário. A tela de entrada tem painel de marca e formulário separados; relatório impresso é sempre claro.
- **Financeiro (só a professora; monitor não vê):**
  - **Checkout não definido:** cada *endereço de recebimento* (webhook) aceita qualquer plataforma. O leitor genérico entende nomes de campo comuns (inglês/português, com ou sem grupos: `pedido.valor`, `cliente.email`…), status em palavras ("aprovado", "paid", "reembolsado", "chargeback", "aguardando", "cancelado"…) e valores como `197`, `"1.997,00"` ou `R$ 197,00` (campos terminados em `cents`/`centavos` são centavos). Se não entender, a carga fica guardada **na caixa de entrada** e pode ser **reprocessada** depois de ajustado o leitor; o checkout sempre recebe 200 (não reenvia sem parar). Endereço inválido ou desativado = 404.
  - **Segurança do recebimento:** o segredo é o próprio endereço (código aleatório de 192 bits), sem login e sem cabeçalho anti-CSRF (quem chama é o servidor do checkout), com limite de requisições e de tamanho (200 KB; guarda até 100 KB). Desativar um endereço o invalida na hora.
  - **Venda:** identificada por (origem, id externo): reenvio não duplica. **Status só avança**: aguardando → aprovada | cancelada | reembolsada | chargeback; aprovada → reembolsada | chargeback. Evento atrasado ou fora de ordem é ignorado. Valores em centavos.
  - **Painel:** receita bruta = vendas que chegaram a ser pagas (aprovada, reembolsada, chargeback); líquida = bruta − reembolsos − chargebacks; ticket médio; taxa de reembolso; taxa de aprovação; por produto e por forma de pagamento; série por dia. Cálculo por data de criação da venda, em horário de Brasília.
  - **Acesso automático (desligado por padrão):** com a opção ligada e o produto marcado "libera acesso" (+ validade em dias), compra aprovada cria o aluno (cadastro pendente) ou renova o plano a partir do fim atual (ou de hoje, se vencido), define a turma e matricula no edital escolhido. **Reembolso/chargeback encerra o plano concedido** (opção; se outra venda aprovada ainda sustenta o plano, ele continua). **Importação de histórico nunca libera nem encerra acesso e nunca envia aviso.** E-mail que pertence à equipe ou a outro ambiente não é tocado.
  - **Produtos** podem nascer sozinhos de uma venda (marcados "revisar"). **Aviso por e-mail** a cada compra/reembolso (opcional; exige SMTP). Exportar vendas gera auditoria.
  - **Pendências:** adaptador específico do checkout escolhido (precisa de um exemplo real de carga), recuperação de carrinho/boletos, comissões de afiliados, NF-e e impostos.
- **Agenda (conteúdo da professora, não agenda automática de revisões):** tipos aula, reunião, plantão, prova/edital, lembrete, outro; data e hora em Brasília (guardadas em UTC); dia todo; link (só https); público: todos, uma turma, alunos de um edital ou um aluno (privado). Aluno vê só o que é para ele, em **Agenda** e no cartão "próximo compromisso" da tela Hoje, e baixa um arquivo `.ics` (Google Agenda, Apple, Outlook). Só a professora cria/edita/exclui; monitor só vê. Pendências: recorrência, lembretes por push/e-mail, sino de notificações.
- **Materiais:** a área "Estudar com IA" virou **Materiais** (IA é só uma categoria). Vídeos do YouTube (inclusive **não listados**) abrem dentro da plataforma; links do Google Drive abrem com botão próprio; PDFs e arquivos do Office (até 20 MB); textos. O aluno marca **"visto"** (por aluno, sem ranking). **PDF aberto por aluno recebe marca d'água** (nome e e-mail, diagonal discreta + rodapé); a professora recebe o original; PDF protegido por senha segue sem marca. Não entra agora: Word convertido em PDF automaticamente e HTML interativo hospedado (risco de segurança; vira download), vínculo de material a conteúdo do edital, restrição de material por plano ativo.

## 12. Fluxo de atualização por GitHub (V2.3.1, 04/10/2026)

- **Docker mantido** no servidor (já instalado e testado), com o comando `apqr` por cima. A alternativa sugerida (systemd + Node + PM2, como o restaurante) foi descartada: o banco com usuário limitado, os volumes fixos, o backup/restauração testados e o isolamento de memória já estão no Docker, e trocar de modelo agora aumentaria o risco sem ganho.
- **Site compilado dentro do repositório** (`web/dist`): o servidor nunca roda `vite build`. A imagem só instala dependências de produção. `npm run release:check` falha se o `web/dist` estiver desatualizado, ignorado pelo Git ou se houver segredo no código.
- **Versão = arquivo `VERSION`** (coincide com `APQR_VERSION` do `.env` e com a pasta `releases/apqr-<versão>`). O `/api/health` informa a versão em execução; o `apqr atualizar` só dá por concluído quando a versão no ar é a baixada.
- **Atualizar** = busca no GitHub (chave só de leitura) → cópia obrigatória → troca → espera até 90 s → volta sozinho se falhar. Recusa versão mais antiga e código novo com a mesma `VERSION`.
- **Cópia externa cifrada** com AES-256 (gpg, frase só no servidor e com o Lucas), Google Drive por rclone (`ONEUP-backups/apqr/`, 30 diárias + 12 mensais); a frase pode ser reaproveitada em servidor novo.
- **Avisos** pelo CallMeBot (WhatsApp) com vigia a cada 5 min, sem repetição por 6 h e aviso de volta; pausa durante a manutenção.
- **Convivência:** o instalador não reinicia o APQR, não toca no Nginx, no firewall, no fuso nem em outros sistemas, e recusa se a porta do APQR aparecer no Nginx de outro site ou no PM2.
- O ensaio `deploy/teste/ensaio.sh` roda os scripts reais com Docker/rclone/WhatsApp de mentira (122 verificações). A construção real da imagem Docker continua sendo testada pela primeira vez no VPS.
