# Revisão da auditoria por três painéis (05/10/2026)

> **Leia primeiro.** Os 100 alunos, os 10 especialistas e os 100 mentores/aprovados são **papéis simulados** pelo Claude, ancorados em dados reais quando existiam (totais da Tutory da ONE UP, avaliações públicas em lojas de app e Reclame Aqui, 19 páginas de relatos de aprovados e mentoria). Cada nota é **opinião simulada**; só o painel de desenvolvedores se apoia em fatos conferidos no código. Os painéis saem do mesmo modelo, então se parecem entre si.
>
> **Duas ressalvas de método que mudam como ler os números:**
> 1. Pedi que cada painel deixasse várias propostas abaixo de 5,5 (para evitar nota inflada). Por isso a queda geral em relação à rodada anterior é **parcialmente forçada**. Compare a **ordem** das propostas, não a diferença de décimos.
> 2. O painel de alunos avalia funções que o aluno nunca vê (fila, registro de contato, IA, delegação) só pela reação a "saber que existe". Para essas, a coluna "sem alunos" é mais justa.

## 1. Resumo (o que mudou)
- **P01 Recado da professora continua sendo a única proposta pronta** (7,66). Nos três painéis ficou entre 7,0 e 8,1.
- **Quase tudo o mais caiu.** Mensagens prontas, registro de contato, NPS, fila de risco, IA, delegação, plano "se-então", projeção, grupos e limite de aparelhos ficaram em "ajustar" ou "não agora".
- **O painel descobriu o que faltava antes de qualquer função nova: uma linha de base do APQR.** A ideia "Linha de base e funil de ativação" (Q4) foi a melhor das novas (7,25), custa 3 dias, é só leitura e permite medir o que as outras fariam.
- **Erros da auditoria anterior (confirmados no código):** a Central inclui ex-alunos; o registro retroativo já aceita até 1 ano (a janela de 24 h do P16 seria mais restritiva); o `/me/export` não inclui as anotações da professora; o "500 de 500" é da Tutory, não do APQR.
- **Três propostas viraram uma só:** mensagens prontas + registro de contato + feedback do alerta ficam como "falar com o aluno em 1 toque, com registro automático ao clicar".
- **O teste real mudou.** Em vez de perguntar "de 0 a 10, quanto isso ajudaria?" (mede intenção declarada), testar com **um recado real de WhatsApp por 2 semanas** e medir leitura e resposta (ver seção 6).

## 2. Tabela por proposta
Média = (alunos + especialistas + mentores + desenvolvedores) ÷ 4, mesma escala 0–10 da rodada anterior. Desenvolvedores: nota da rodada anterior (viabilidade no código real). "Sem alunos" = média dos outros três, para funções invisíveis ao aluno.

| # | Proposta | Alunos | Espec. | Mentores | Devs | **Média** | Antes | Sem alunos | Decisão revisada |
|---|---|---|---|---|---|---|---|---|---|
| P01 | Recado da professora | 6,98 | 7,75 | 7,80 | 8,10 | **7,66** | 7,71 | — | ✅ **Implementar** |
| P16 | Higiene do sinal | 7,09 | 5,90 | 6,80 | 5,70 | **6,37** | 6,50 | — | 🟡 Só "semana atípica" |
| P06 | Trilha dos 7 dias | 5,97 | 6,30 | 5,60 | 6,70 | **6,14** | 6,54 | — | 🟡 Reduzir a 3 passos |
| P03 | Mensagens prontas | 5,53 | 6,55 | 5,00 | 7,30 | **6,09** | 6,77 | — | 🟡 Fundir com P04 |
| P10 | Anotação por conteúdo | 6,32 | 4,45 | 7,00 | 6,00 | **5,94** | 5,68 | — | 🟡 Piloto, junto do Caderno de Erros |
| P04 | Registro de contato | 4,04 | 5,80 | 4,70 | 6,80 | **5,33** | 6,40 | 5,77 | 🟡 Fundir com P03 (registro automático) |
| P02 | Fila "quem chamar hoje" | 3,39 | 6,20 | 5,20 | 6,00 | **5,20** | 6,09 | 5,80 | 🟡 Só em modo sombra, depois da linha de base |
| P05 | NPS mensal | 4,73 | 5,20 | 3,30 | 7,00 | **5,06** | 6,32 | — | ❌ Adiar; 1 pergunta dentro do check-in futuro |
| P08 | Pauta de check-in por IA | 4,39 | 4,60 | 4,10 | 6,50 | **4,90** | 5,75 | 5,07 | ❌ Adiar; começar com pauta fixa por regra |
| P13 | Feedback do alerta | 3,71 | 5,70 | 3,60 | 6,30 | **4,83** | 5,96 | 5,20 | ❌ Vira 1 toque dentro do P03/P04 |
| P14 | Delegação aos monitores | 3,37 | 5,45 | 3,90 | 6,10 | **4,71** | 5,68 | 5,15 | ❌ Só para turma grande |
| P07 | Plano "se-então" | 3,89 | 4,35 | 3,10 | 6,60 | **4,48** | 5,30 | — | ❌ Cortar |
| P12 | Projeção de chegada | 4,03 | 4,65 | 4,40 | 4,30 | **4,34** | 5,01 | — | ❌ Só lista da professora; backtest antes |
| P15 | Grupo-controle embutido | 2,77 | 5,20 | 2,20 | 6,50 | **4,17** | 5,80 | 4,63 | ❌ Usar entrada em ondas, sem "cobaia" |
| P11 | Grupos de constância | 3,07 | 3,95 | 3,30 | 5,60 | **3,98** | 4,82 | — | ❌ Cortar do app |
| P09 | Aparelhos e sessões | 2,61 | 3,00 | 1,40 | 5,90 | **3,23** | 4,93 | — | ❌ Cortar |

Regra de decisão (igual à anterior): ≥ 7,0 implementar · 5,5 a 6,9 ajustar/piloto · < 5,5 não agora; qualquer painel < 4 ou rejeição alta impede "implementar".

## 3. Divergências entre os painéis (sem média: conflito e recomendação)

| Tema | Quem diz o quê | Recomendação |
|---|---|---|
| **P01: botão "Li"** | Alunos (parte): incomoda quem está devendo estudo e quem não abre o app nunca vê. Mentores: recado sem virar chat. | Registrar leitura **em silêncio ao abrir** (sem botão obrigatório). Oferecer "copiar para WhatsApp" na primeira versão. |
| **P04 registro de contato** | Desenvolvedores 6,8 e especialistas 5,8 a favor; mentores 4,7 ("vira botão dentro de P02/P03"); alunos 4,0 (invisível). Especialistas temem que a professora pare de registrar na 3ª semana. | **Registrar automaticamente o clique no WhatsApp**, sem campo livre e sem depender de disciplina. |
| **P05 NPS** | Desenvolvedores 7,0; mentores 3,3 ("1 pergunta no check-in"). | Adiar até existir check-in (congelado). Não enviar pesquisa avulsa. |
| **P10 anotação** | Mentores 7,0 (aprovados citam resumo próprio feito cedo); especialistas 4,45 (risco de uso abaixo de 15%). | Piloto pequeno **junto do Caderno de Erros**, medindo uso em 8 semanas. |
| **P02 fila** | Alunos 3,4 (medo de ser cobrado por "risco"); especialistas 6,2, desenvolvedores 6,0. | Só em **modo sombra**, só a professora vê, e **depois** da linha de base (Q4). Comparar com a regra simples "7 dias sem estudar". |
| **P15 grupo-controle** | Especialistas (ciência): detectar +10 pontos de retenção pede ~355 alunos por braço, inviável; alunos: "não quero ser cobaia". | Para "primeiro estudo em até 72 h" bastam ~100 por braço, e a **entrada em ondas** evita o dilema ético. |
| **Método de decisão** | Especialistas (dados): média de painéis do mesmo modelo dá falsa precisão; deveria pesar custo do erro e reversibilidade. | Concordo. Por isso a recomendação final prioriza o que é barato, reversível e mede (Q4, P01). |
| **P09 aparelhos** | Mentores 1,4 e alunos 2,6 contra; especialistas (monetização) querem um alerta interno em vez de descartar o problema de conta compartilhada. | Cortar o bloqueio. Se virar problema, medir por IP/dispositivo em relatório interno, sem derrubar aluno. |

## 4. Pontos cegos novos (ideias que ninguém havia proposto)
Notas 0–10 (opinião simulada, exceto devs = código real).

| # | Ideia | Alunos | Espec. | Mentores | Devs | **Média** | Esforço | Leitura |
|---|---|---|---|---|---|---|---|---|
| Q4 | **Linha de base e funil de ativação** (dias até o 1º estudo, % ativos em 7/14/30 dias, retenção por coorte; só leitura) | 4,5 | 9,0 | 7,0 | 8,5 | **7,25** | 3 d | ✅ Implementar primeiro |
| Q1 | Continuar de onde parei (1 toque) | 7,5 | 6,5 | 5,0 | 8,5 | **6,88** | 2 d | 🟡 O Hoje já sugere "continuar"; ganho pequeno |
| Q7 | Mapa de peso do edital (ordena sugestões, nunca vira plano) | 5,0 | 6,5 | 8,5 | 6,5 | **6,63** | 4 d | 🟡 `priority`/`relevance` já existem por matéria |
| Q6 | Barreira em 1 toque (6 opções fixas) | 6,5 | 6,0 | 7,5 | 4,5 | **6,13** | 4 d | 🟡 Precisa gravar no servidor; confirmar regra do backlog sobre WhatsApp |
| Q5 | Desfecho da prova + autópsia pós-prova | 4,0 | 7,0 | 8,0 | 5,0 | **6,00** | 6 d | 🟡 Invade Simulados/Caderno de Erros (congelados); limitar a categorias |
| Q8 | Fases além da objetiva (discursiva, títulos, TAF) | 6,0 | 4,5 | 8,0 | 5,0 | **5,88** | 6 d | 🟡 Dá para começar sem código com Agenda e notas |
| Q2 | Recomeçar do zero sem apagar histórico | 4,5 | 5,0 | 6,0 | 3,5 | **4,75** | 7 d | ❌ Mexe em todos os indicadores |
| Q3 | Registro offline com sincronização | 6,0 | 5,5 | 4,0 | 3,0 | **4,63** | 8 d | ❌ Reverte uma decisão de privacidade (o PWA não guarda dados do aluno); precisa da sua aprovação |

## 5. Pré-autópsias e critérios de corte
"Daqui a 6 meses falhou; por quê?" (inferência simulada) e o limite que mataria a função (limiares são hipóteses a calibrar).

| Proposta | Pré-autópsia | Corte |
|---|---|---|
| P01 Recado | A professora escreve recados bons por 2–3 semanas, depois usa lote com variável de nome, o texto fica genérico, a leitura cai e vira "cegueira de banner". | Em 6 semanas: cobertura abaixo de 60% dos ativos, **ou** leitura em 48 h abaixo de 40%, **ou** mais de 90 min/semana da professora. Nesse caso, manter só o recado individual. |
| P03/P04 Contato | Os textos se repetem, o aluno reconhece o padrão e a resposta cai; ou "parado há 12 dias" sai errado por falha de registro e constrange. A professora passa a clicar sem ler. | Em 4 semanas: resposta abaixo de 25%, **ou** 2 ou mais incidentes de dado errado. |
| P06 Trilha | Veteranos pulam e ficam marcados como "travados"; novatos completam por obediência e o 1º estudo regular não muda. | Em 2 coortes: ganho abaixo de 10 pontos em "primeiro estudo em até 72 h". Cortar a trilha e manter só o alerta do dia 3. |
| P16 Semana atípica | Vira desculpa: 30% dos ativos usam todo mês e o alerta fica mudo. | Mais de 25% dos ativos usando no mês, **ou** nenhuma melhora na precisão da fila. |
| P02 Fila | 4 em cada 10 nomes são alunos que estão bem; a professora para de confiar; quem sempre estudou pouco continua invisível. | 6 semanas em sombra: precisão dos 12 nomes abaixo de 40%, **ou** nenhum ganho sobre a regra "7 dias sem estudo". |
| P10 Anotação | Ninguém usa por falta de ligação com a revisão. | Menos de 15% de uso em 8 semanas. |

## 6. Kit de validação real (fazer antes de construir)
**Por quê:** o painel de especialistas lembrou que perguntar "de 0 a 10" mede intenção declarada, que costuma superestimar o uso real.

**Teste do recado (2 semanas, sem código):** a Pollyana escolhe 20 alunos ativos e manda **um recado individual por WhatsApp**, uma vez por semana, durante 2 semanas. Anote em uma planilha: leu em 48 h? respondeu? estudou nos 7 dias seguintes (compare com o histórico do próprio aluno)? e quantos minutos gastou escrevendo.

**5 perguntas para 15–20 alunos reais (mensagem curta, responder em 1 minuto):**
1. Quando você abre o app cansado, o que mais atrapalha você a começar a estudar?
2. Qual foi a última vez que você parou de estudar por mais de uma semana, e o que aconteceu?
3. Que tipo de mensagem da professora ajuda de verdade e que tipo incomoda?
4. Você deixaria a professora ver quando você deixou de estudar? Em que condição sim, em que condição não?
5. O que falta no app hoje que você usa em outro lugar (planilha, caderno, outro app)?

**Modelo de mensagem (WhatsApp):** "Oi, [nome]! Estou melhorando o app da mentoria e queria a sua opinião real. São 5 perguntas rápidas, sem certo ou errado, as respostas só servem para decidir o que fazer. Posso te mandar?"

**3 mentores reais:** pergunte o que fazem hoje que nenhum app substitui, o que desistiram de usar e por quê, e quanto tempo por semana gastam acompanhando cada aluno.

**Como ler:** respostas que repetem o mesmo problema em 5 ou mais alunos valem como sinal; ideias isoladas, só como hipótese. Se o recado manual não for lido por mais da metade em 48 h, o P01 precisa de outro canal antes de virar função.

## 7. Decisões que só o Lucas pode tomar (com recomendação)
1. **Linha de base (Q4) primeiro?** *Recomendo sim: 3 dias, só leitura, sem risco, e tudo o mais depende dela.*
2. **Recado sem botão "Li" obrigatório, com leitura registrada em silêncio?** *Recomendo sim.*
3. **Regra antiga do backlog contra WhatsApp no app:** `wa.me` só abre a conversa e não envia nada; vale como exceção? *Recomendo sim, com registro automático do clique e sem campo livre.*
4. **Registro offline (Q3)** reverte a decisão de não guardar dados do aluno no aparelho. *Recomendo não agora.*
5. **Chave de IA (P08):** *Recomendo adiar; começar com pauta fixa por regra e decidir depois.*
6. **Ordem:** v2.4.0 → linha de base (Q4) → v2.5.0 com P01 + contato em 1 toque + Continuar de onde parei (Q1). *Recomendo aprovar.*

## 8. O que continua incerto
- Todas as notas de alunos, especialistas e mentores são simuladas; só os testes reais da seção 6 confirmam.
- Tamanho real da base de alunos e custo da chave de IA: sem base.
- Não houve relato real sobre: Reddit, Notion, usuário independente da Tutory, mentor que desistiu de app e reprovado que persistiu. Tudo isso é simulado.
- As notas de lojas de app (Estratégia 1,8 estrela; Tec Concursos 2,3; Aprovado 4,9) vieram de ferramenta de resumo; confira antes de citar publicamente.
- Gollwitzer & Sheeran (d ≈ 0,65) não foi conferido no artigo.
- Limiares dos critérios de corte e estimativas de esforço são hipóteses.
- Muitos sites de mentoria usados como fonte têm viés comercial.
- O Tutory da ONE UP foi lido só como totais e médias; nenhum nome de aluno foi usado.

## Fontes principais
Relatos e mentoria: [CEISC](https://ceisc.com.br/blog/post/mentoria-para-concurso-vale-a-pena), [Dr. Concursos](https://drconcursos.com.br/mentoria-para-concurso-vale-a-pena/), [Alfacon](https://blog.alfaconcursos.com.br/mentoria-para-concurso/), [Diário Farma](https://diariofarma.com.br/quer-saber-como-ser-aprovada-o-em-concurso-na-area-farmaceutica-confira-algumas-importantes-dicas/), [Estratégia: farmácia](https://concursos.estrategia.com/portal/farmacia-para-concursos-publicos/), [entrevista de aprovado](https://concursos.estrategia.com/portal/depoimento/entrevista-marcelo-jose-santos-da-silva-aprovado-em-9-lugar-para-perito-criminal-de-ciencia-da-computacao-no-concurso-politec-pe/), [Yohann](https://yohannbtc.substack.com/p/os-meus-segredos-para-ter-sucesso), [Davi Belo](https://davibelo.substack.com/p/estude-enquanto-eles-dormem), [Anki para concursos](https://blog.provasbrasil.com.br/metodos-de-estudo/como-usar-anki-flashcards-concursos/), [Gran: cronograma](https://blog.grancursosonline.com.br/como-fazer-um-cronograma-de-estudos/).
Reclamações: [Gran (cancelamento)](https://www.reclameaqui.com.br/gran-concursos/cuidado-pois-e-impossivel-cancelar-gran-cursos__4Y1CYGFR7aSkJ-e/), [Gran (renovação)](https://www.reclameaqui.com.br/gran-concursos/renovacao-automatica_uRtEprnD5dn1oCKj/), [Estratégia](https://www.reclameaqui.com.br/empresa/estrategia-concursos/lista-reclamacoes/?problema=0000000000001227).
Evidência: [Bettinger & Baker](https://edpolicyinca.org/sites/default/files/2023-11/bettinger-effectsstudentcoaching-2014.pdf), [Baker, Evans & Dee](https://journals.sagepub.com/doi/10.1177/2332858416674007).
