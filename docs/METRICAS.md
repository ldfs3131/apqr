# Métricas, diagnósticos e ranking — ONE UP · Método APQR

Tudo o que aparece na Central da professora, no Raio-X do aluno e no Ranking é **calculado a partir dos registros** (sessões de estudo, revisões com questões, questões avulsas, materiais produzidos e mudanças de etapa). Nada é estimado, nada é inventado e nada vem de IA. O código está em `server/src/domain/indicators.js` e os testes em `server/test/indicators.test.js`.

Datas usam o fuso do Brasil (America/Sao_Paulo). "Hoje" é o dia do acesso; os números são recalculados a cada acesso (não há cache).

## 1. Dia ativo

Um dia é **ativo** para o aluno quando existe pelo menos um destes registros naquele dia:

- sessão de estudo (cronômetro ou manual);
- revisão ou questões avulsas;
- material produzido;
- mudança de etapa APQR feita pelo próprio aluno.

Registros desfeitos/excluídos (anulados) não contam.

## 2. Indicadores do ranking (três colunas, sem nota composta)

| Indicador | Fórmula | Faixa |
|---|---|---|
| **Consolidação** | conteúdos consolidados ÷ conteúdos ativos do edital × 100 | 0–100% |
| **Constância** | Σ (4 semanas) min(dias ativos na semana, 5) ÷ (5 × semanas avaliadas) × 100 | 0–100 |
| **Evolução** | consolidação de hoje − consolidação de 28 dias atrás | pontos percentuais (p.p.) |

Detalhes:

- **Consolidação** usa a etapa atual de cada conteúdo. Conteúdos e matérias arquivados não entram no total.
- **Consolidação de 28 dias atrás** conta os conteúdos com revisão consolidadora válida (não desfeita) registrada até aquela data.
- **Constância — semanas:** quatro janelas móveis de 7 dias terminando hoje (hoje−27…hoje−21, …, hoje−6…hoje).
- **Constância — teto de 5 dias por semana:** estudar 7 dias não vale mais que estudar 5. O indicador mede regularidade, não volume.
- **Constância — aluno com menos de 4 semanas:** só as semanas em que ele já estava matriculado entram no cálculo (ex.: 2 semanas → divide por 10).
- **Horas não entram no ranking.** Mais horas não significa mais domínio. As horas aparecem como informação, nunca como critério.
- **Dados autodeclarados:** a consolidação só acontece por revisão com questões (mínimo de questões e percentual definidos na configuração versionada). A constância usa a existência de registros, não a quantidade de horas informada.

## 3. Regras do ranking

- Sempre **por edital**, visível só para a professora, a equipe e a ONE UP. **Aluno nunca vê ranking nem comparação com colegas** (a API recusa com 403).
- Ordenado pelo indicador escolhido, do maior para o menor.
- **Desempate:** Consolidação → evolução, constância; Constância → consolidação, evolução; Evolução → conteúdos revisados a mais no período, consolidação. Por fim, ordem alfabética do nome (a mesma entrada sempre gera a mesma ordem).
- **Empate exato** nos critérios numéricos recebe a **mesma posição** (1º, 2º, 2º, 4º).
- **Alunos novos** (menos de 7 dias de matrícula no edital) aparecem como "Novo", sem posição, sem constância e sem evolução.
- **Pouco dado:** um aluno com poucos registros fica naturalmente com consolidação e constância baixas; não há extrapolação.
- **Inatividade:** o aluno parado continua no ranking; a constância dele cai sozinha à medida que as semanas sem atividade entram na janela.
- **Alunos desativados** e matrículas arquivadas não aparecem.
- **Atualização:** a cada acesso. Não existe fechamento semanal.

## 4. Diagnósticos (Central e Raio-X)

Regras fixas; cada diagnóstico mostra os números que o justificam e uma sugestão de ação para a professora.

| Código | Severidade | Regra |
|---|---|---|
| `never_started` | Crítico | matriculado há 7+ dias e nenhum registro |
| `new_student` | Info | matriculado há menos de 7 dias e nenhum registro |
| `inactive` | Atenção / Crítico | sem registro há N+ dias (N = "Dias para considerar parado" da configuração; padrão 7). Crítico a partir de 2N |
| `frequency_drop` | Atenção | ≥ 8 dias ativos nas 4 semanas anteriores e, nas últimas 4, no máximo metade disso |
| `accuracy_drop` | Atenção | ≥ 40 questões em cada janela de 4 semanas e queda de 10+ p.p. no acerto |
| `effort_without_practice` | Observar | 10h+ de estudo em 4 semanas e nenhuma questão |
| `stalled` | Observar | 4+ dias ativos em 2 semanas e nenhuma mudança de etapa ou revisão em 21 dias |
| `review_backlog` | Observar | 3+ conteúdos em revisão sem revisar há 14+ dias |
| `material_idle` | Observar | 3+ conteúdos com material pronto há 14+ dias sem iniciar revisão |
| `cycle_locked` | Info / Observar | conteúdos que atingiram o limite de revisões do ciclo sem consolidar |
| `concentration` | Observar | 75%+ das horas de 4 semanas em uma matéria (com 5h+ e 3+ matérias no edital) |
| `improving` | Positivo | +10 p.p. de consolidação ou +3 conteúdos consolidados em 4 semanas |
| `consistent` | Positivo | constância ≥ 80 |

Um aluno **parado** não recebe rótulos positivos. Os diagnósticos de **rotina** (`never_started`, `new_student`, `inactive`, `frequency_drop`, `consistent`) são do aluno; os demais são do edital (ver §6).

## 5. Desempenho e escala

Cada tela faz um conjunto fixo de consultas **agregadas por matrícula** (sem uma consulta por aluno), apoiadas nos índices por matrícula e data. O custo cresce de forma linear com o tamanho da turma. Sem Redis, filas ou pré-cálculo: só serão considerados se a medição com volume real mostrar necessidade (ver teste de carga da Fase 7).

## 6. Central: visão por aluno × visão por edital

A Central tem dois escopos. A tela informa qual está em uso.

| | "Todos os editais" (visão por **aluno**) | Um edital selecionado (visão por **edital**) |
|---|---|---|
| Linhas | uma por aluno | uma por matrícula naquele edital |
| Última atividade, dias ativos, constância, horas, questões, acerto | **somam todos os editais** do aluno | só registros daquele edital |
| Consolidação, evolução | **por edital** (uma linha para cada edital do aluno) | daquele edital |
| Diagnósticos de rotina (parado, nunca começou, queda de frequência, constante) | calculados com a atividade de **todos** os editais | calculados só com aquele edital |
| Diagnósticos de edital (revisões atrasadas, material parado, rodízio, concentração, acerto em queda, evoluindo, estuda mas não avança) | por edital; com mais de um edital, o texto começa com o nome dele | daquele edital |

Por que assim: quem estuda o edital A todos os dias **não** deve aparecer como "parado" só porque não mexeu no edital B. Mas consolidação não se soma entre editais diferentes (são conteúdos diferentes), por isso aparece separada.

O **Raio-X** e o **Ranking** são sempre por edital.
