# Pacote de ajustes (reunião com a Marcela, 06/10) — análise antes de executar

Data: 07/10/2026. Nada foi construído. Base: código da v2.3.1.
O "comitê" abaixo é simulado por mim (produto/mentoria, desenvolvimento, LGPD/jurídico, operação de atendimento). Os pareceres são opinião, não pesquisa de mercado.

## 1. Resumo em uma tabela

| # | Item | Já existe? | Parecer | Mexe no banco? | Quando |
|---|---|---|---|---|---|
| 1 | Rótulo R-Q1, R-Q2… | Só o rótulo "R1…R4"; o número da revisão já é guardado | **Fazer** (substitui o V-01) | Não | Fase 1 |
| 2 | Calendário mensal | Existe mapa de calor de 182 dias; dados diários existem | **Fazer, com ajuste** (horas na célula só em tela larga) | Não | Fase 1 |
| 3 | Botão WhatsApp | Não existe; telefone é guardado só com dígitos | **Fazer** | Não | Fase 1 |
| 4 | Duração do plano | Existe só `access_until` (data); falta início e duração no cadastro | **Fazer junto com a v2.4.0 (planos)** | Sim (início/duração) | Fase 2 |
| 5 | Aba "Questões" | Não existe | **Fazer**, com 2 cuidados (selo e links) | Sim (tabela nova) | Fase 1B |
| 6 | Foto de perfil | Não existe (só iniciais); arquivos aceitam só "content" e "logo" | **Fazer depois do termo novo** | Sim (propósito de arquivo + coluna) | Fase 3 |
| 7 | Materiais organizados | Existe (texto, vídeo, link, arquivo, categoria); falta segmentar por turma/edital | **Fazer**, enxuto | Sim (colunas de público) | Fase 1B |
| 8 | Admin edita nome, login, e-mail, telefone, nascimento, CPF | Só nome, validade, objetivo e plano; CPF e e-mail travam | **Fazer, prioridade alta** | Quase não (ver §4) | Fase 2 |
| 9 | Pausar plano | Não existe | **Fazer** (já era da v2.4.0) | Sim | Fase 2 |
| 10 | Conferir anotações internas | Funcionam (criar, listar, apagar com autor e data) | **Já está pronto**; falta auditar | Não | Fase 1 |
| F3 | Meta de horas | Não existe; "Rotina" já guarda dias e horas disponíveis | **Fazer depois**, na Rotina (não na Agenda) | Sim (1 tabela) | Fase 4 |
| — | Parâmetros por turma/edital | Regra é por ambiente, versionada | **Não fazer agora** | Sim, delicado | Depois da rodada de testes |
| — | Padronizar nomes de editais | Sem trava de duplicidade | **Fazer com ensaio** | Índice novo | Fase 2 |

## 2. O que já existe e o que falta, item por item

**1. R-Q1…** O número da revisão é um inteiro guardado na revisão (e extras passam de 4 sem problema). Só muda o texto exibido em `ui.jsx`, `TopicDrawer.jsx`, `Edital.jsx`, `Reviews.jsx`, `Analytics.jsx` e nos relatórios. Nenhuma revisão antiga é afetada.

**2. Calendário.** `StudyCalendar` (em `Charts.jsx`) é um mapa de 182 dias. O mesmo componente alimenta a tela do aluno e o Raio-X da professora (`AnalyticsView`), então uma mudança vale para os dois. `daily_activity` já tem segundos de estudo, questões e produções por dia.

**3. WhatsApp.** O telefone do aluno é validado com 10 ou 11 dígitos. Falta o botão, a limpeza do número, o prefixo 55 e o aviso quando vazio. Monitores já só enxergam os alunos atribuídos a eles.

**4. Duração.** `createStudent` recebe só nome, e-mail, editais e objetivo. `access_until` existe e a lista de vencimentos (7/15/30 dias) já existe nos Relatórios. Falta data de início, duração (1/3/6/12 meses ou dias) e o cálculo do término no cadastro.

**5. Questões.** Nada existe. Precisa de tabela, tela do admin (cadastro, ordem, ativo) e aba do aluno.

**6. Foto.** `Avatar` mostra só iniciais. A tabela `files` tem uma regra que aceita só `content` e `logo`, então precisa de nova migração. Recorte e compressão podem ser feitos no navegador (mais leve para o servidor de 1 CPU).

**7. Materiais.** `content_items` já tem tipo, categoria, publicado e posição. Não tem público (turma/edital). A Agenda já separa público (todos, turma, edital, aluno) e tem tipo "reunião", então a reunião mensal por turma já pode ser marcada lá.

**8. Edição cadastral.** `PATCH /teacher/students/:id` aceita nome, ativo, revisões extras, validade, objetivo e plano. Não aceita e-mail, telefone, nascimento nem CPF. O histórico (horas, questões, revisões) já está ligado ao ID interno do aluno, nunca ao CPF ou e-mail, então editar esses campos não perde nada. O que trava hoje é o índice único de CPF por ambiente e o índice único de e-mail. A auditoria existe, mas grava só o valor novo, não o anterior. Não existe campo de data de nascimento no cadastro.

**9. Pausa.** Não existe. O plano só tem "ativo" ou "encerrado". Falta estado "pausado", dias restantes, histórico de pausas e tela do aluno.

**10. Anotações.** Funcionam: só a equipe vê, com autor e data, exclusão lógica. Falta registrar criação e exclusão na auditoria.

## 3. Decisões que são suas

1. **Calendário:** mostrar as horas dentro do dia só em tela larga (reunião) e, no celular, só número e cor? (Recomendo sim. Isso muda o que combinamos ontem, "só o número do dia", porque a Marcela precisa ler horas na reunião.)
2. **Pausa, acesso:** durante a pausa o aluno entra só para ver o próprio histórico (sem registrar nem abrir materiais) ou fica bloqueado? (Recomendo ver só o histórico: é dado dele, e o material pago continua fechado.)
3. **Pausa, limites:** prazo máximo e quantas pausas por plano? (Sugestão: 90 dias e uma pausa por plano, ajustável.)
4. **CPF:** só a professora (dona) edita, nunca o monitor? (Recomendo sim.)
5. **Selo "Parceiro":** a plataforma de questões é da própria casa? Se for, chamar de "Plataforma da Pollyana Lyra" em vez de "Parceiro", para não parecer terceiro. Se houver comissão com terceiros, informar na tela.
6. **Mensagem pronta do WhatsApp:** só texto de atendimento (sem oferta), editável antes de enviar? (Recomendo sim.)
7. **Grupo do WhatsApp "com aprovação de moderador":** o que significa? O link só aparece depois de a equipe liberar para cada aluno?
8. **Alerta de vencimento:** 5 dias, como no pacote, ou usar os 7 que já existem?
9. **Foto:** a equipe pode enviar a foto de um aluno? (Recomendo só com o consentimento dele, previsto no termo novo.)
10. **Nomes de editais:** posso rodar um relatório de duplicados antes? (Preciso do banco real; o ensaio roda numa cópia do backup.)

## 4. Pontos sensíveis, com a minha leitura honesta

- **"Não pode perder o histórico dos ~700 alunos".** A base importada traz cadastro, plano, turma e último acesso. **O histórico de questões e horas da plataforma antiga não foi importado** (só estava no plano piloto de 20 alunos). Hoje a "turma" é um texto livre (ex.: ANVISA), não uma ligação a um edital. Renomear um edital nunca perde histórico, porque as matrículas apontam para o ID. O risco real é **juntar dois editais duplicados**: isso só se faz com ferramenta própria e conferência manual. Proponho: relatório de duplicados, renomeação em lote com prévia, trava de nome repetido (ignorando acento e caixa) e ensaio numa cópia restaurada do backup.
- **Parâmetros por turma/edital.** Hoje a regra é versionada por ambiente e cada revisão guarda a versão usada. Uma regra por edital exige mudar a tabela de versões (que é imutável) e cria dois alunos do mesmo edital com regras diferentes. "Mais exigente perto da prova" já está previsto no **Modo Reta Final** congelado. **Não fazer agora.** Se um dia for feito, por edital, nunca por turma.
- **Admin editando CPF e e-mail.** Alterar o e-mail muda o login: encerrar as sessões do aluno e avisar. Gravar valor anterior e novo na auditoria (hoje só grava o novo). Validar dígito do CPF e duplicidade antes de salvar, com mensagem clara.
- **Pausa.** Ao pausar: guardar a data e os dias restantes. Ao retomar: novo término = data da retomada + dias restantes. Aluno pausado sai dos alertas de atenção. Precisa de uma correção que já estava na lista: hoje quem está logado continua entrando depois que o plano vence.
- **Aba Questões.** Aceitar só links `https`, abrir em nova aba com `noopener`. Só texto, sem logos de terceiros.
- **Foto.** É dado pessoal. Só o próprio aluno e a equipe veem, nunca outros alunos. Entra no termo novo. Primeiro lista, perfil e Raio-X; nos relatórios em PDF só depois.
- **Primeira rodada de testes (bolsistas, monitores, ex-alunos).** Mesmo com bolsistas, são dados reais. Antes da rodada precisa estar pronto: termo atualizado e revisado, backup automático com restauração testada, aviso no WhatsApp se cair, correção da sessão vencida, edição de cadastro (item 8), um canal de feedback combinado e uma cópia só para ensaio das mudanças.

## 5. Fases propostas e impacto no banco

**Fase 1 — rápidos, sem risco (v2.3.2):** itens 1, 2, 3, 10 (auditar anotações). Banco: nada.

**Fase 1B (v2.3.3):** itens 5 e 7.
- Tabela `question_sites` (ambiente, nome, url, descrição, selo, ordem, ativo) com RLS.
- `content_items`: colunas de público (`audience` todos/turma/edital, `cohort`, `edital_id`) e categorias fixas Reuniões, Vídeos complementares, Grupo do WhatsApp.

**Fase 2 — cadastro e plano (v2.4.0, junto do que já estava combinado):** itens 4, 8, 9, padronização de editais, correção da sessão vencida, termo `2026-10-v2`, matrícula, mural.
- `students`: `plan_start`, `plan_months`/`plan_days`; `plan_status` ganha "paused"; `paused_days_left`.
- Tabela `plan_pauses` (aluno, início, fim, dias restantes, motivo, quem).
- Auditoria com valor anterior e novo; índice único de nome de edital normalizado (depois do relatório de duplicados).
- Migração de ensaio rodada primeiro numa cópia do backup.

**Fase 3 — foto (v2.5):** `files.purpose` ganha "avatar"; `students.photo_file_id`. Recorte e compressão no navegador; validação do tipo real do arquivo e do tamanho no servidor.

**Fase 4 — meta de horas (junto do V2.3).** Proposta curta:
- **Onde fica:** na tela **Rotina**, não na Agenda. A Agenda é só da professora por regra do método; os dias de estudo do aluno já estão na Rotina (blocos de disponibilidade).
- **Tela:** card no topo da Rotina: "Meta da semana: 10 h · feito 6 h 20 · faltam 3 h 40", barra de progresso, média diária sugerida (meta ÷ dias marcados) e aviso de viabilidade ("sua rotina comporta 8 h, faltam 2 h"). Histórico das últimas 8 semanas (bateu / não bateu) e média das 4 últimas.
- **Dados:** tabela `student_goals` (aluno, período semana/quinzena, meta em minutos, vigência desde, quem definiu), só inclusão de versões novas. O progresso é calculado a partir de `daily_activity`, sem guardar totais. Professora e admin leem a meta e o cumprimento no Raio-X e na Central.

## 6. Conflitos com o que já estava congelado
- **V-01** (textos do R1) fica **substituída** pelo item 1 (R-Q1).
- **V-02** (calendário só com o número) muda: horas na célula em tela larga.
- **Foto**: estava cortada, passa a entrar (motivo: identificar o aluno nas reuniões).
- **Contato em 1 toque** (que estava na v2.5) é antecipado pelo item 3.
- **Meta da semana** (V2.3, item 9) e a Fase 3 do pacote são a mesma coisa.
