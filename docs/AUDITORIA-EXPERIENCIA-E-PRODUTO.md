# Auditoria de produto e experiência (07/10/2026)

**Como foi feita (fato):** subi a v2.3.1 com os dados de demonstração (10 alunos) e fotografei as telas do aluno (Hoje, Meu edital, Revisões, Registrar, Evolução, Rotina) e da professora (Central, Alunos, Raio-X, Relatórios), em computador (1280 px) e celular (390 px). Medi o tamanho do pacote do site e consultei o código. Não vi Agenda, Materiais, Financeiro e Equipe com dados, nem testei com leitor de tela, nem em aparelho real.
**Comitê (simulado, 10 funções):** pesquisador de UX educacional, designer visual e de interface, especialista em gamificação e retenção, mentora sênior de concursos, gestor de operação de mentoria (experiência do mentor), arquiteto de front-end e desempenho, engenheiro de acessibilidade, engenheiro de dados e escala, engenheiro de segurança, engenheiro de QA.
**Aviso:** notas e severidades são opinião do modelo, não medição. Onde há número medido, está marcado como **fato**.

## 1. Resumo
- **Pontos fortes (reais):** visual consistente e limpo, marca presente, linguagem clara e honesta ("Sugestões são orientações", "Horas medem esforço, não domínio"), estados vazios bem escritos, explicação das regras do método na tela, diagnóstico do mentor com os números que o justificam, listas de renovação e recuperação de vendas prontas.
- **Maior problema do aluno:** **repetição e excesso de informação.** A mesma mensagem aparece em 3 lugares (Hoje, Evolução, Raio-X) e, na Hoje, até se contradiz.
- **Maior problema do mentor:** **escala.** A tela foi pensada para dezenas de alunos; com cerca de 785 a lista, a Central e os relatórios vão ficar pesados e longos.
- **Risco para o plano novo:** acrescentar Pacto, Chama, Mês colorido, Ajuste de Rota e Consultoria em telas que já estão cheias piora a experiência se nada for reorganizado. Proposta de Hoje reorganizada no §5.
- **Nota geral do app (opinião):** hoje **7,1**; com os ajustes rápidos e a versão única planejada, **8,1** (§6).

## 2. Achados: experiência do aluno

| # | Tela | Achado | Gravidade | Sugestão |
|---|---|---|---|---|
| A1 | Hoje | **Orientação contraditória.** O "Próximo estudo" sugere PNAB (Legislação do SUS), enquanto o alerta ao lado diz que Língua Portuguesa está há 14 dias sem estudo. | Alta | Uma só recomendação, com a razão; o alerta vira o motivo dela ou some. |
| A2 | Hoje / Evolução / Raio-X | **O mesmo insight aparece 3 vezes** (alerta amarelo, "3 matérias sem horas", "Língua Portuguesa 5 de 5 não iniciados"). Mesmos insights nas três telas. | Alta | Mostrar no máximo 3 insights por tela, sem repetir o alerta. Evolução guarda o detalhe; Hoje, o resumo. |
| A3 | Hoje | "43,5%" aparece duas vezes lado a lado (consolidados e "ponderado"), com o mesmo valor. | Média | Mostrar um número; o segundo só quando diferir, com explicação curta. |
| A4 | Hoje | Página longa: **cerca de 3.200 px no celular.** O essencial ("O que fazer agora") está bem no topo, mas o resto vira rolagem. | Média | Pacto e Chama no topo; "Ver mais" para o resto (§5). |
| A5 | Hoje | Barra de progresso com **vermelho dominante** para quem está começando; transmite fracasso. As cores por tópico são regra do método, mas a barra agregada pode ser neutra. | Média | Barra agregada em tom neutro para "não iniciado" (decisão da Pollyana). |
| A6 | Hoje | Cartão "O que falta" com muito espaço vazio (altura esticada pelo vizinho). Gráfico com eixos quebrados (0,9 h, 1,4 h, 1,8 h). | Baixa | Alinhar alturas; eixos em números redondos. |
| A7 | Hoje | "SES-GO 2026 — Farmacêutico" aparece duas vezes (barra do topo e título). | Baixa | Remover um. |
| A8 | Meu edital | **Tabela de 12 colunas com muitas células vazias** ("—") e "Aguardando início" repetido 13 vezes. No celular fica como lista, melhor, mas com 3.300 px. | Alta | Matérias recolhidas por padrão, abertas só as que têm atividade; esconder R2 a R4 enquanto vazias; trocar "Aguardando início" por vazio. |
| A9 | Meu edital / Evolução | Rótulos **R1…R4** (já decidido: Q/R-1…). Aparecem também em gráficos e relatórios. | Média | Função única de rótulo (planejado). |
| A10 | Registrar | **Histórico de sessões sem paginação.** Com 1 ano de uso vira lista enorme. | Média | Agrupar por semana e paginar. |
| A11 | Registrar | O cronômetro, ação principal de um app de estudo, fica numa barra pequena com botão "Iniciar" desabilitado até escolher o conteúdo. | Média | Botão grande na Hoje ("Começar", já existe) deve abrir direto o cronômetro com o conteúdo sugerido. |
| A12 | Evolução | **10 painéis numerados** em 3.300 px. É completo, mas pesado para um aluno. Mistura de relatório e histórico, e será duplicado pelo Ajuste de Rota. | Alta | Topo com 3 mensagens; gráficos em abas ("Horas", "Questões", "Edital"). O Ajuste de Rota vira a leitura quinzenal; Evolução, a consulta. |
| A13 | Evolução | "Dias de estudo" é um mapa de quadradinhos minúsculo, com muito espaço vazio ao lado (já será trocado pelo calendário mensal). "Equilíbrio do edital" usa jargão ("diferença de 100%, progresso concentrado"). | Média | Calendário mensal; texto em linguagem simples. |
| A14 | Menu | "Materiais" usa ícone de faíscas (sugere IA); "Registrar" não diz que é o tempo de estudo. 8 itens no menu, e vão para 10 ou 11 com Pacto, Ajuste de Rota e Consultoria. | Média | Agrupar: Hoje · Meu edital · Estudar (Registrar + Revisões) · Evolução (com Ajuste de Rota e Mês colorido) · Materiais · Mais. |
| A15 | Revisões, Rotina | Bem resolvidas: estado vazio instrutivo, regra explicada, comparação "disponível × estudado" na Rotina. | Ponto forte | Manter. |

## 3. Achados: experiência do mentor

| # | Tela | Achado | Gravidade | Sugestão |
|---|---|---|---|---|
| M1 | Central, Alunos, Relatórios | **Escala.** *(Correção posterior: a lista de Alunos já mostra 200 por vez; não havia ordenação.)* Teste de carga com 800 alunos e 60 dias de histórico (fato, banco embutido PGlite): Central 1,2 s, Ranking 1,2 s, lista de alunos 0,13 s, Raio-X 0,04 s, painel do aluno 0,05 s, 50 painéis em paralelo 2,6 s no total. Aceitável; reavaliar se a Central passar de 2 s. | Média | Repetir o teste na KVM 2 com PostgreSQL de verdade; paginar a Central se necessário. |
| M2 | Central, Alunos, Relatórios | **Três listas de alunos** com colunas diferentes (Central, Alunos, Relatórios). A professora não sabe qual usar. | Média | Uma lista só, com filtros salvos (situação, turma, vencimento); a Central mostra só o que exige ação. Casa com a Fila da Coordenação. |
| M3 | Central | Seis cartões de números quebram em 5 + 1 (o último fica sozinho). O cartão "Precisam de você agora" tem grande vazio. | Baixa | 3 × 2 ou 6 colunas; altura alinhada. |
| M4 | Raio-X | **Repete a tela do aluno quase por inteiro** (mesmos cartões). O que é do mentor (Diagnóstico) está no topo, o que é bom, mas faltam **ações rápidas**: botão de WhatsApp, anotação rápida, último contato, próxima ação. | Alta | Cabeçalho com WhatsApp, anotação e "último contato"; abas fixas no topo (já está no backlog). |
| M5 | Raio-X | Mensagens do diagnóstico são corretas, mas genéricas ("Lembrar do equilíbrio entre as matérias"). | Baixa | Sugestão concreta com a matéria e o número. |
| M6 | Relatórios | Cartão "Planos ativos por turma" ocupa uma coluna quase vazia; "Histórico da base" mostra "Sem dados". Já tem listas de renovação e recuperação de venda em um clique (ponto forte). | Média | Compactar; esconder blocos sem dados. |
| M7 | Alunos | Tabela sem ordenação por validade e sem destaque de vencimento próximo (existe em Relatórios). | Média | Coluna "vence em X dias" com cor; ordenar por ela. |

## 4. Achados técnicos que afetam a experiência

| # | Achado | Gravidade |
|---|---|---|
| T1 | **Pacote do site: um arquivo de JavaScript de cerca de 1,0 MB (1.018.504 bytes, fato)**, sem divisão por área. Em 4G, o primeiro carregamento é lento para o aluno, que não precisa do código da professora. Sugestão: dividir por área (aluno, professora, plataforma). Compressão não medida. | Média |
| T2 | Acessibilidade: o código tem 239 atributos `aria` e respeita "reduzir animações" (fato). Não testei leitor de tela. O cinza de texto secundário tende a ficar perto do limite de contraste; verificar. | Média |
| T3 | O teste de carga existe no projeto (`npm run load-test`). Rodar com ~800 alunos na KVM 2. | Alta (antes de vender) |
| T4 | Telas novas (Pacto, Ajuste de Rota, calendário) devem entrar com estados de carregamento, vazio e erro, e teste de ponta a ponta. | Média |

## 5. Como encaixar o que vem (Hoje reorganizada)
Ordem proposta para a tela **Hoje** do aluno:
1. **O que fazer agora**: uma recomendação só, botão "Começar".
2. **Pacto da semana:** barra de horas, 🔥 Chama e 🛡️ Escudos.
3. **Onde estou no edital:** versão compacta, um só percentual.
4. **Últimos 7 dias:** os 4 cartões.
5. **Ver mais** (recolhido): insights, progresso por matéria, gráfico de horas.

O **Mês colorido** fica em Evolução (aba), o **Ajuste de Rota** abre uma vez a cada 15 dias com aviso na Hoje, e a **aba Consultoria** aparece só para quem tem esse acesso. Tudo isso reduz o que o aluno vê, em vez de aumentar.

## 6. Notas (opinião do comitê, 0 a 10)

| Dimensão | Hoje | Depois (ajustes rápidos + versão única) |
|---|---|---|
| Qualidade visual | 8,0 | 8,3 |
| Clareza e hierarquia da informação | 6,5 | 8,0 |
| Praticidade, especialmente no celular | 7,0 | 8,0 |
| Experiência do aluno | 7,0 | 8,3 |
| Experiência do mentor | 6,5 | 7,8 |
| Cobertura do método e das funções | 8,5 | 9,0 |
| Acessibilidade (não testada) | 7,0 | 7,5 |
| Desempenho | 6,5 | 7,5 |
| **Média** | **7,1** | **8,1** |

Contas: hoje 57,0 ÷ 8 = 7,1; depois 64,4 ÷ 8 = 8,05, arredondado para 8,1.

## 7. O que entra já na versão única (ajustes rápidos, sem mudar o método)
1. Uma recomendação só na Hoje; sem insights repetidos (A1, A2).
2. Um só percentual; alinhamento dos cartões; eixos redondos; título duplicado fora (A3, A6, A7).
3. Meu edital com matérias recolhidas e colunas vazias escondidas (A8).
4. Histórico de sessões agrupado por semana e paginado (A10).
5. Evolução em abas, com Ajuste de Rota como leitura quinzenal (A12).
6. Menu agrupado (A14).
7. Raio-X com WhatsApp, anotação rápida e último contato (M4).
8. Coluna "vence em X dias" na lista de alunos (M7).
9. Divisão do pacote do site por área (T1).
10. Teste de carga com ~800 alunos (M1, T3).

**Fica para decidir com a Pollyana:** barra agregada neutra em vez de vermelha (A5). **Fica para depois:** lista única de alunos com filtros salvos (M2), junto da Fila da Coordenação.

## 8. O que não consegui verificar
Agenda, Materiais, Financeiro e Equipe com dados; funcionamento em aparelho real e leitor de tela; contraste exato do texto cinza; desempenho com 800 alunos; compressão do pacote; fluxo de convite e de primeiro acesso.
