# Backlog congelado — V2.2 / V2.3

**Status:** CONGELADO em 01/10/2026 por decisão do Lucas. Nada aqui é implementado até ele liberar, depois de reunir todas as informações. Itens novos entram neste arquivo; nada sai sem decisão dele.

Todas as propostas respeitam as regras permanentes do APQR (`DECISOES.md`): etapas manuais e só para frente; consolidação > percentual vigente com mínimo de questões; limite por ciclo + rodízio; Plano Global não é cronograma; sem revisão espaçada automática ou agenda por datas; sem simulador de nota de corte; aluno não vê ranking nem outros alunos; sem WhatsApp; IA não cria números.

## Aprovado pelo Lucas

### V2.2 — núcleo de desempenho
1. **Caderno de Erros — Método 3-30** (3 campos, 30 segundos)
   - Campos: **Por quê?** (Não sabia · Confundi · Vacilei) + **Frase que salva** (até 140 caracteres) + opcionais: print/link da questão e "Eu tinha certeza".
   - Ação fixa por causa: Não sabia → voltar ao material; Confundi → quadro comparativo; Vacilei → vai para "Minhas regras de prova".
   - Nível 1: no registro da revisão, linha opcional "seus N erros foram: Não sabia / Confundi / Vacilei" (diagnóstico sem cartões).
   - Nível 2: cartões em cadernos (um por matéria criado em um clique + cadernos livres).
   - Contra reincidência, por eventos do método (nunca datas): cartões do conteúdo aparecem antes de cada revisão (com print = tentar lembrar e revelar; sem print = leitura ativa; "já sei" / "ainda confundo"); novo erro no mesmo conteúdo pergunta "é o mesmo?" → reincidente; 2 "já sei" em revisões diferentes → resolvido.
   - Erros com "tinha certeza" ficam no topo (efeito de hipercorreção, Butterfield & Metcalfe).
   - Leitura de véspera em PDF (frases + regras de prova).
   - Diagnóstico com ≥ 10 erros classificados (ex.: Vacilei > 40% → "problema é procedimento de prova").
   - Conta como material atualizado na fase Q+R; não muda etapa nem consolidação.
   - Professora lê os cadernos (aviso ao aluno na tela do caderno); aba no Raio-X; alerta na Central; causas como números no Relatório IA.
2. **Meus 5 gargalos por matéria** (regras fixas sobre dados existentes + causas dos erros).
3. **"Não precisa agora"**: consolidados, aguardando rodízio, matérias dominadas de baixa relevância.
4. **Hoje em 5 blocos** (Hoje, Desempenho, Gargalos, Evolução, Próximo passo) + poucos alertas (queda de acerto por matéria, revisões acumulando, erro reincidente).
5. **"Onde parei"** ao finalizar o cronômetro → "Continuar: conteúdo, material, página" na tela Hoje.
6. **Matriz de prioridade para o aluno** (progresso APQR × acerto × relevância do Plano Global).
7. **Revisões ordenadas por prioridade** (só ordem das revisões já liberadas, nunca agenda).
8. **Foco do dia com 3 itens**, sem minutagem.

### V2.3 — acompanhamento
9. **Meta da semana** (horas e questões; aluno define, professora ajusta).
10. **Check-in semanal de 1 minuto** (nota 1–5, o que travou, foco da próxima) → Central.
11. **Combinados da mentoria** (1–3 por conversa, fixos na tela Hoje do aluno).
12. **Simulados com análise pós-prova** (acertos por matéria + 3 causas; evolução; sem previsão de nota).
13. **Modo Reta Final** (≤ 30 dias da prova: erros de certeza, reincidentes, regras de prova, matérias de alta relevância).
14. **Mapa anual de constância** + indicador **% do tempo em questões/revisão**.
15. **App instalável no celular** (PWA).

### Fora de vez
XP e níveis; ranking para o aluno; plano automático com minutagem; revisão pela curva do esquecimento; banco gigante de questões; IA coach diária para o aluno; comunidade/chat/notificações.

### Depende do banco de questões (filtros do Lucas)
Radar por tema; "próxima questão"; desempenho por banca; simulados adaptativos.

## Também pendente (perguntas abertas)
- Integração de pagamento por webhook: qual checkout, recorrente ou à vista, migração dos alunos do Tutory com validade.
- Repositório no GitHub para CI; chave da Anthropic; logo e cor da Pollyana; hospedagem.

## Acrescentado em 01/10/2026 (simulação de 100 alunos + comitê + ideia do Lucas)

### Registro de Simulados e Provas (ideia do Lucas)
- Lançar **simulado** (do curso ou da banca) e **prova de concurso real**: nome, data, banca, edital vinculado (opcional), tempo de prova.
- Por matéria: questões e acertos (matérias do edital já listadas; pode incluir outras). Total e % calculados.
- Opcional: erros de cada matéria nas 3 causas (Não sabia / Confundi / Vacilei).
- Prova real: % de acerto, nota oficial, classificação e situação (aprovado, classificado, cadastro reserva, eliminado).
- Questões de simulado entram no total de questões, mas não contam como revisão nem mudam etapa (mesma regra das avulsas). Sem previsão de nota de corte.
- Evolução entre simulados por matéria; matéria fraca alimenta os Gargalos.
- Alerta "consolidou mas não reteve": matéria com conteúdos consolidados e acerto baixo nos simulados.
- Professora: simulados no Raio-X e painel "Resultados da turma" (aprovações = prova do método; divulgação só com autorização do aluno).

### Da simulação dos 100 alunos e do comitê
- **Botão "+ Registrar" global** (estudo, revisão, questões, simulado, prova, erro).
- **Registro em lote** de questões de vários conteúdos numa sessão.
- **Escala de trabalho no perfil** (12x36, 24x72, comercial); constância medida contra os dias disponíveis.
- **Conteúdos equivalentes entre editais** (a professora liga; o aluno importa o progresso).
- **Microprogresso** na tela Hoje ("6 etapas avançadas esta semana").
- **Fila de liberações** de rodízio na Central, com aprovação em lote.
- **Link de questões por conteúdo** (caderno filtrado do QConcursos) → botão "Fazer questões".
- **Material ligado ao conteúdo** (PDF, aula, link no tópico do edital).
- **Resumo semanal** opcional por e-mail (aluno) e resumo da turma + relatórios IA em lote (professora).
- **Medição de uso** dentro do produto, sem dado pessoal.

### Redesenho de layout (todas as páginas, aluno e professora)
Princípios: uma ação principal por página; cabeçalho padrão (título, 1 linha, botão principal); números-chave grandes; menos texto cinza miúdo; estados vazios que ensinam; celular primeiro nas telas de registro. Detalhe por página no plano consolidado da conversa de 01/10/2026; resumo:
- Hoje: 5 blocos com hierarquia clara; "Continuar de onde parei" no topo.
- Meu edital: barra de progresso por matéria, matérias recolhíveis, colunas R1–R4 só quando houver revisões, legenda única (hoje duplicada com os filtros).
- Revisões: lista priorizada com os cartões do caderno; estados vazios explicando o próximo passo.
- Registrar: separar registro (cronômetro/lote) da análise de carga horária (vai para Evolução).
- Evolução: menos gráficos, cada um respondendo uma pergunta; mapa de constância; simulados.
- Rotina: grade compacta + escala de trabalho.
- Raio-X: cabeçalho compacto e abas fixas no topo (hoje as abas ficam abaixo da dobra).
- Central: fila "fazer agora" (liberações, alertas, check-ins) acima dos números.
- Editais/Configurações: formulários em seções recolhíveis.

### Decisões do dono (perguntas abertas)
- Mínimo de questões por conteúdo (versionado), para conteúdos pequenos.
- Na Reta Final, permitir que a professora reabra ciclo de conteúdo consolidado.

## Feito fora do congelamento (pedido direto do Lucas)
- 01/10/2026 — **Base de alunos** em Relatórios: importação da base da plataforma anterior (785 cadastros), plano ativo/encerrado com fim do plano e renovação, engajamento por último acesso (7/30 dias), gráficos por turma, vencimentos e histórico, listas para baixar (ativos, sem acesso há +7/+15/+30 dias, vencendo em 7/15/30 dias, encerrados recentes, ex-alunos). Cobre a parte de **validade do acesso** do item "cobrança e validade"; a cobrança integrada continua pendente.

- 01/10/2026 — **Marca da Pollyana Lyra, assinatura ONE UP, cartão do Revise Farmácia e aplicativo instalável (PWA)** com botão "Instalar aplicativo" (V2.2.1). Ver `DECISOES.md` §10.

## Acrescentado em 01/10/2026 (conversa sobre app, marca e materiais)

### Agenda (menu novo) — a fazer
- A professora cria eventos: aula ao vivo, reunião de mentoria, plantão, data de edital/prova, lembrete. Cada evento: data e hora (Brasília), link (Meet/Zoom), descrição e público (todos, turma, edital ou um aluno).
- Aluno vê lista dos próximos eventos, visão de mês, o próximo compromisso na tela Hoje e botão "Adicionar ao meu calendário" (arquivo .ics). Eventos individuais são privados.
- Depois da aula, anexar gravação e material ao evento. Fase 2: recorrência semanal e lembrete por notificação.
- Regra do método: a Agenda é só da professora; não vira agenda automática de revisão.

### Materiais ligados ao conteúdo — a fazer (aplicar o que dá)
- PDF enviado ao sistema (acesso segue o plano; nome do aluno marcado no arquivo); aulas em vídeo do **YouTube "não listado"** embutidas, com "assisti"; link do Drive aceito como material simples; HTML em área isolada (sandbox); Word convertido para PDF no envio ou baixado. Cada material ligado ao conteúdo do edital. Vídeo não é hospedado no servidor; se for preciso mais proteção, trocar por serviço pago de vídeo depois.

### Aplicativo (evolução do PWA)
- Fase 2: notificações push (lembretes, aviso de vencimento) e registro offline com sincronização (cronômetro e registro simples).
- Loja: decidir só se virar argumento de venda. Android primeiro (TWA); iPhone depois (Capacitor), com risco de recusa; cada marca precisa de conta própria.

### Integrações
- "Exportar para o Clint" nas listas da Base de alunos (aguardando confirmação do Lucas; verificar formato de importação/API do Clint antes de prometer sincronização).

## Novas informações a captar
_(adicionar aqui o que chegar antes da liberação)_


## Feito fora do congelamento (V2.3, a pedido do Lucas)
- Temas Tradicional/Claro/Escuro e novo layout de entrada.
- Financeiro (webhook genérico, vendas, produtos, painel, importação, acesso automático opcional).
- Agenda da professora (com .ics).
- Materiais (marca d'água em PDF, "visto", Drive, embeds).

## Pendências ligadas à V2.3 (aguardam decisão/dados do Lucas)
- **Adaptador do checkout escolhido**: precisa de um exemplo real de webhook (botão "Ver conteúdo" na Caixa de entrada). O leitor genérico já cobre os nomes comuns.
- Agenda: recorrência, lembretes (push/e-mail), sino de notificações.
- Materiais: Word→PDF automático, vínculo com conteúdo do edital, restrição por plano ativo.
- Financeiro: recuperação de boletos/Pix pendentes, afiliados/comissões, NF-e.

## Congelado: aba "Ritmo do mês" no Financeiro (sugestão aprovada pelo Lucas em 01/10/2026)
- **Gráfico:** receita acumulada dia a dia (curva), mês atual × comparativos, com rótulos de valor na ponta direita e visual mais refinado que o do painel atual.
- **Linhas (cada uma liga/desliga):** mês atual (forte, para em "hoje") · mês passado (cinza) · média dos últimos 3 meses (referência principal) · média dos últimos 6 meses (tracejada, com faixa sombreada pior–melhor mês) · mesmo mês do ano anterior (tracejada; só com histórico). **Sem média de 12 meses** (sazonalidade de concursos distorce); se o Lucas quiser, entra como opção.
- **Cálculo:** média dia a dia das curvas acumuladas, alinhando dia 1 com dia 1; meses curtos repetem o último valor até o dia 31; mês atual nunca entra na média.
- **Resumo acima do gráfico:** "Dia X: R$ Y · ±% vs mês passado · ±% vs média 3m" e **projeção de fechamento pelo formato histórico da curva** (não linear).
- **Bruto × líquido** ligável; líquido (descontando reembolso e chargeback) como padrão.
- **Pré-requisito:** importar do checkout ao menos 13 meses de vendas (Financeiro → Vendas → Importar planilha); webhook só vale daqui para frente.

## Congelado: operação do servidor (anotado em 04/10/2026, para a próxima atualização)
Nada aqui entra sem o "vai" do Lucas.

### Cópia de segurança automática no Google Drive da ONE UP, protegida por senha
- Mesmo padrão do sistema do restaurante (reaproveitar o que já foi definido lá, em vez de criar outro).
- Hoje o `backup.sh` já envia para fora do VPS via rclone (`OFFSITE_REMOTE` no `.env`), mas **sem senha**. O item é: criptografar o pacote (banco + arquivos) antes de enviar e guardar a senha fora do servidor (gerenciador de senhas do Lucas).
- Entra junto: `restore.sh` aceitar um backup baixado do Drive (descriptografa e confere o SHA-256), teste de restauração a partir do Drive, e aviso quando o envio falhar.
- Pré-requisitos: conta do Drive da ONE UP autorizada no rclone; senha definida e guardada.

### Vigia com aviso no WhatsApp se o sistema cair
- Checagem de fora do servidor a cada poucos minutos em `https://mentoria.pollylyra.com.br/api/health`; aviso quando cair e quando voltar.
- Candidatos a entrar no mesmo vigia: certificado perto de vencer, disco acima de 80%, backup que não rodou ou falhou.
- Em aberto: qual canal de WhatsApp envia o aviso (precisa de decisão do Lucas). Alternativa enquanto isso: aviso por e-mail.
- Vale um vigia único da ONE UP, que também cuide da Comanda e do Lava Jato quando entrarem no servidor.

### Ajuste de documentação do deploy (achado na instalação de 02/10/2026)
- A instalação real ficou com **Nginx + certbot** (bloco `mentoria`, `client_max_body_size 25m`), e não com o Caddy do guia. Atualizar o `GUIA-INSTALACAO-VPS.md` com esse caminho ou migrar para o Caddy na entrada do segundo sistema.
- O endereço `pollylyra.com.br` (sem "mentoria") ainda aponta para o APQR no Nginx antigo; decidir se sai de lá.

### Atualização automática de madrugada (congelado, 04/10/2026)
- O servidor conferir o GitHub sozinho dentro de uma janela de horário e rodar `apqr atualizar` (já tem cópia obrigatória, volta automática e aviso no WhatsApp). Só ligar depois de algumas semanas de uso estável do `apqr atualizar` manual, com alunos reais. Decisão do Lucas: "quando fecharmos a atualização, nós fazemos".

### Ideia a avaliar (sem decisão): relatório mensal do aluno por e-mail (05/10/2026)
- Lucas quer avaliar depois. Nada a fazer agora. Se voltar: precisa de serviço de e-mail (SMTP) com domínio autenticado (SPF/DKIM/DMARC), e decisões de formato, destinatários, dia/hora, IA ou regras, aprovação da professora e descadastro. O relatório por aluno e o envio de e-mail (`SMTP_URL`) já existem; falta o agendamento.

## Congelado: auditoria de funções (05/10/2026)
Detalhes, notas e fontes em `docs/ROADMAP-FUNCOES.md`. Nada abaixo é construído sem o "vai" do Lucas.
- **Sequência sugerida:** 2.5.0 acompanhamento da professora (F1 recado ao aluno, F3 mensagens prontas, F4 registro de contato, F7 NPS) · 2.6.0 risco e pauta (F2, F15) · 2.7.0 primeiros dias (F5, F8) · 2.8.0 planejamento (F6, F11).
- **Piloto manual sem código:** F10 grupos de constância (3 grupos de 6 alunos por 4 semanas).
- **Decisão pendente:** F9 faixa anônima da turma (conflita com "ranking para o aluno fora de vez").
- **Pagamento/checkout/assinatura/afiliados:** seguem congelados; nenhuma ideia nova foi proposta nessa área.

## Congelado: revisão da auditoria (05/10/2026)
Detalhes em `docs/REVISAO-AUDITORIA.md` (painéis simulados de alunos, especialistas e mentores).
- **Ordem recomendada:** v2.4.0 → Linha de base e funil de ativação (Q4, 3 dias, só leitura) → v2.5.0 (P01 Recado, contato em 1 toque com registro automático do clique no WhatsApp, Continuar de onde parei).
- **Em espera (depois da linha de base):** fila "quem chamar hoje" em modo sombra (P02), semana atípica (P16), trilha reduzida a 3 passos (P06), anotação por conteúdo junto do Caderno de Erros (P10), mapa de peso do edital (Q7), fases além da objetiva (Q8), desfecho/autópsia pós-prova (Q5), barreira em 1 toque (Q6).
- **Adiado/cortado:** NPS avulso, pauta por IA, delegação aos monitores, plano "se-então", projeção para o aluno, grupo-controle (usar entrada em ondas), grupos no app, limite de aparelhos, recomeçar do zero (Q2).
- **Decisão pendente do Lucas:** registro offline (Q3) reverte a decisão de não guardar dados do aluno no aparelho.
- **Correções conhecidas:** a Central inclui ex-alunos; `/me/export` não inclui `teacher_notes`; sessões e auditoria guardam o IP inteiro sem retenção definida.

## Congelado: dados do aluno, termo, MCP e mural de aprovados (06/10/2026)
Nada abaixo é construído sem o "vai" do Lucas.
- **Junto da v2.4.0:** (1) termo atualizado (versão `2026-10-v2`) com cláusula de análise por IA e aviso de transferência internacional, e página pública de termos/privacidade; texto a ser revisado por advogado, que também decide a base legal (consentimento separado só se ele mandar); (2) **número de matrícula** sequencial por professora (coluna nova, os 785 importados recebem na ordem de importação; nunca CPF/telefone; só rótulo interno); (3) **"aprovado" como motivo de encerramento do plano**.
- **Aprovado pelo Lucas (06/10):** Mural de aprovados, com autorização separada e específica de imagem/nome/depoimento (revogável, fora do termo de uso do app).
- **Perfil do aluno (depois da linha de base):** perfil de estudo (cargo-alvo, banca, data da prova, horas por semana, escala de trabalho; opcional, sem dado sensível); foto opcional (só professora/monitor veem; corte quadrado e redução de tamanho); **Minha jornada** com provas e resultados (informado pelo aluno ou confirmado pela professora; funde o antigo "Registro de Simulados e Provas"); o aluno recebe de volta horas/questões antes de cada prova e um cartão de aprovação opcional.
- **Mural de aprovados:** decidir onde vive (kit de divulgação para a professora primeiro; página pública depois).
- **MCP para o dono (só leitura):** 3 ferramentas (`alunos_em_risco`, `desempenho_turma`, `resumo_semana`), só primeiro nome + número de matrícula, sem CPF/e-mail/telefone/endereço/anotações/texto livre/vendas; chave fixa primeiro, OAuth só com o segundo professor; domínio `mcp.pollylyra.com.br`; só depois do termo e do advogado. Sem SQL livre e sem ferramentas que escrevam.
- **Substituição:** "% do cronograma" vira "% do edital consolidado" (o APQR não tem cronograma).

## Lista de validação: achados do teste local da v2.3.1 (06/10/2026)
Lista aberta: o Lucas testa a demonstração offline, vamos discutindo, e só depois de decidir tudo fechamos o que entra. Nada abaixo é construído sem o "vai" do Lucas.
- **V-01 · Textos do R1 (decisão dele pendente de "vai").** O botão "Registrar R1" não diz que a revisão é feita com questões (o Lucas leu como "exercício"). Proposta: botão "Registrar R1 · questões"; linha de apoio "Resolva pelo menos 20 questões deste tópico e registre o acerto."; no quadro "R1 · 1ª rodada de questões". Só texto, em `TopicDrawer.jsx` e `Reviews.jsx`.
- **V-02 · "Dias de estudo" em formato de calendário (decidido: mês a mês).** Troca o mapa de calor de 182 dias (`StudyCalendar` em `web/src/components/Charts.jsx`, usado em `Analytics.jsx:75`) por calendário de um mês com setas para voltar/avançar, cabeçalho seg–dom, número do dia, cor de fundo na mesma escala azul, hoje com contorno, dias futuros apagados, toque no dia mostra tempo estudado e questões, rodapé mantém "X dias estudados no período · sequência atual N dias". Decidido (06/10): só o número do dia na célula; tempo e questões só ao tocar.

## Congelado: pacote de ajustes da reunião com a Marcela (07/10/2026)
Análise completa em `docs/PACOTE-MARCELA-ANALISE.md`. Nada é construído sem o "vai" do Lucas.
- **Fase 1 (v2.3.2, sem banco):** R-Q1…R-Q4 (substitui o V-01); calendário mensal (V-02 muda: horas na célula só em tela larga, a confirmar); botão WhatsApp na lista e no perfil; auditar anotações internas (já funcionam).
- **Fase 1B (v2.3.3):** aba "Questões" com links cadastrados pelo admin (tabela `question_sites`); materiais por turma/edital (colunas de público em `content_items`).
- **Fase 2 (v2.4.0):** duração do plano no cadastro; admin edita nome/e-mail/telefone/nascimento/CPF (CPF só professora; auditoria com valor anterior e novo); pausa de plano; padronização de nomes de editais com relatório de duplicados e ensaio em cópia do backup; correção da sessão vencida; termo `2026-10-v2`; matrícula; mural.
- **Fase 3 (v2.5):** foto de perfil (depois do termo novo).
- **Fase 4:** meta de horas na Rotina (`student_goals`), junto de "Meta da semana" (V2.3).
- **Não fazer agora:** parâmetros de revisão por turma/edital (usar o Modo Reta Final); juntar editais duplicados automaticamente.
- **Decisões do Lucas pendentes:** 10 perguntas em `PACOTE-MARCELA-ANALISE.md` §3.

## Congelado: Consultoria Individual + Evolução da Plataforma (07/10/2026)
Escopo completo do prompt do Lucas (5 perfis, uma conta com vários acessos, catálogo e preços, Pagar.me, módulo Consultoria, Bônus de Execução, Pacto de Estudo, Ajuste de Rota, Central da Equipe, painéis por papel, Centro de Comando, termo em 11 blocos). Análise, notas e plano em `docs/AVALIACAO-CONSULTORIA-EVOLUCAO.md`. Nada é construído sem a liberação de cada fase.
- **Recomendado:** vender a consultoria em processo manual enquanto se constrói; Fase 1 em três blocos (1A acessos e receita, 1B jornada da consultoria, 1C plano/relatório/bônus); subir para KVM 2 antes da Fase 2.
- **Adiar:** Simulador "E se?", "Pergunte ao seu negócio" com perguntas livres. **Reduzir:** Central da Equipe, Bônus (começar manual).
- **Fundido:** Meta da semana → Pacto; planos/pausa/cancelamento (v2.4.0) → modelo de acessos; Gargalos → Ajuste de Rota; termo `2026-10-v2` → termo de 11 blocos.
- **Pendentes do Lucas:** 10 decisões em `AVALIACAO-CONSULTORIA-EVOLUCAO.md` §9.

## Decisões do Lucas sobre a Consultoria (07/10/2026, tarde)
Versão decidida em `docs/ESCOPO-CONSULTORIA-DECIDIDO.md` (substitui o §8 e as recomendações do `AVALIACAO-CONSULTORIA-EVOLUCAO.md` onde divergirem). Continua congelado.
- Consultoria = 30 dias de plataforma depois do encontro; agenda manual pela Marcela (sem Google Agenda/Meet integrado).
- 4 perfis: Aluno, Monitor (só editais e arquivos), Coordenadora, Professora/Administrador unificados (mesmo perfil, logins separados).
- Bônus: medição automática; aplicação do valor manual. Pacto substitui a Meta da semana.
- Central da Equipe sai (Clint); entra a Fila da Coordenação. Termo em PDF no Drive com aceite versionado; caixa de consentimento só no diagnóstico.
- Acesso vencido: entra e vê aviso de renovação (servidor bloqueia o resto). Pausa só em acessos longos.
- Regra de credibilidade (mínimos de dados) para toda a IA e todos os insights.
- Congelados: MCP e "Pergunte ao seu negócio", Simulador, integração Google Agenda/Meet.

## Auditoria antes de construir (07/10/2026)
Detalhes em `docs/AUDITORIA-PRE-IMPLEMENTACAO.md`. Decisões novas: Google Agenda/Meet integrado removido; dois logins para o perfil Professora/Administrador (e-mail diferente do login ONE UP); caixa de consentimento no diagnóstico aprovada; KVM 2 será assinada. Achados de gravidade alta: aluno vencido logado continua entrando; e-mail único na plataforma; migrações exigem backup e ensaio; falta definir como as versões chegam ao servidor (repositório GitHub). Primeiro pacote: v2.3.2 (R-Q, calendário mensal, botão WhatsApp, edição de cadastro); depois v2.4.0 / Fase 1A.

## Lista final fechada (07/10/2026, tarde) — ver AVALIACAO-FINAL-PRE-CONSTRUCAO.md
Decisões novas: sem "melhor horário"; rótulo **Q/R-1, Q/R-2**; pausa 1 por plano, extra só com a Professora, sem limite de prazo; CPF editável por Professora/Administrador e Coordenadora; selo "Faço Questão de Farmácia"; aviso de vencimento em 7 dias; link dos 2 grupos de WhatsApp por turma (avisos e alunos; aprovação de entrada no próprio WhatsApp); alteração de dado pessoal sempre com caixa de confirmação (anterior → novo) e auditoria; foto só enviada pelo aluno, uso interno, depois da v2.4.0; aluno nunca importa edital; importador de editais por **colar texto** com prévia editável (testado no edital Anvisa 2024); PDF direto, biblioteca da casa e IA ficam congelados; trava de nome de edital repetido; e-mail transacional pronto e desligado; IA só com base sólida e teto de custo.
Pendências do Lucas: confirmar GitHub; e-mails (Administrador, Coordenadora); segundo edital de exemplo; confirmar que a plataforma de questões é da casa; revisar o termo.

## Ajuste (07/10/2026, 14:57): importador de editais RETIRADO
Decisão do Lucas: **não mexer em como o edital é cadastrado hoje** (matéria por matéria, tópicos colados um por linha). Ficam fora do escopo: importador por colar texto, leitura de PDF, biblioteca da casa e a trava de nome de edital repetido (itens 9 e 12 da avaliação final). O teste no edital da Anvisa fica registrado em AVALIACAO-FINAL-PRE-CONSTRUCAO.md §3 só como referência, caso ele peça de novo. Ordem passa a ser: v2.3.2 → v2.4.0 → Fase 1B → 1C.

## Decisões (07/10/2026, 15:06)
- **Pacto para todos os alunos**; **medalha e desconto do bônus só para quem veio da consultoria**.
- Bônus = **desconto na compra** de turma trimestral/semestral (se houver) ou do plano Só Plataforma (trimestral, semestral, anual; mensal não vale). Não é dinheiro nem reembolso; validade 15 dias; não acumula.
- Entram na versão única: Pacto, Chama, Escudos, Mês colorido, Ajuste de Rota (sem IA, catálogo fechado, com chave de liga/desliga no admin; blocos Caderno de Erros e Melhor horário fora). Fora: Modo Foco, Caderno de Erros, Pagar.me, e-mail ligado, IA.
- Lembretes só dentro do app até o e-mail ser ligado; o Lucas ligará o e-mail e entra como destinatário.
- Pendente: confirmar os 7 pontos do Pacto (definir até quarta 23h59; semana seg–dom 23h59; 1ª semana parcial não conta; tempo manual conta marcado; pausa não conta nem quebra; sem escudo a Chama zera; "Aceitar ajuste" aplica no Pacto seguinte e na Rotina) e reenviar a imagem do Mês colorido.
