# Auditoria de funções do Método APQR — roadmap de ideias (05/10/2026)

> **Só pesquisa e documentação.** Nada aqui foi construído. Cada ideia espera o "vai" do Lucas.
> Pagamento, checkout, assinatura e afiliados ficam **congelados**. As ideias já congeladas antes e as da v2.4.0 (planos, pausa, cancelamento, vencimentos) não são repetidas.

## 1. Resumo executivo

**Onde o APQR já é melhor que o mercado**
- **Consolidação medida por regra** (acertos × 100 > percentual × questões), com histórico e explicação de cada revisão. Os concurseiros reclamam justamente de "entender não é aprender" e de falta de medição (Estratégia). Nenhuma plataforma pesquisada mostra essa regra de forma explícita.
- **Relatório de concurso de ponta a ponta**: horas líquidas, questões, edital, evolução, relatório imprimível e relatório com IA que nunca inventa número. Hotmart, Kiwify, Eduzz, Ticto, Memberkit e Curseduca têm relatórios de curso (conclusão de aula), não de concurso.
- **Dados do aluno e da professora com dono**: exportar os próprios dados (LGPD), lista de ex-alunos e de vencimentos em CSV, backup cifrado, isolamento por ambiente. Há reclamações públicas sobre exportação limitada (Curseduca) e limite de importação (Hotmart).
- **Sem armadilha de cancelamento e renovação**, a maior queixa de Gran, Estratégia e TEC no Reclame Aqui. A v2.4.0 reforça isso.

**Os maiores buracos**
1. **A professora não tem um canal de orientação para o aluno.** Hoje as anotações dela são privadas. O Tutory tem "Orientação do Coach" no cronograma. É o que o aluno de mentoria mais espera.
2. **Triagem de risco ainda é reativa.** No próprio Tutory da ONE UP, 500 de 500 alunos aparecem "em atraso", com média de 15,9% do plano cumprido. Um alerta que marca todo mundo não ajuda a decidir quem chamar hoje.
3. **Nada guia os primeiros 7 dias do aluno**, a janela em que mais se perde gente (Lenny's/Duolingo; evidência de MOOC).
4. **Falta de rotina de contato**: quando falei com este aluno, qual é o próximo contato.
5. **Sem medida de satisfação** (NPS), que Tutory, Memberkit e Hotmart têm.

**As 5 apostas principais**
1. Recado da professora para o aluno (F1)
2. Mensagens prontas por situação, com 1 clique no WhatsApp (F3) + registro de contato (F4)
3. Risco de evasão explicável com fila "quem chamar hoje" (F2)
4. Primeiros 7 dias com plano "se-então" (F5)
5. Projeção de chegada à prova (F6)

## 2. Inventário do APQR hoje (resumo)

| Área | O que existe |
|---|---|
| Aluno | Hoje, Meu edital, Revisões, Registrar estudo (cronômetro no servidor), Evolução (10 gráficos), Relatório imprimível, Materiais, Agenda, Rotina, Perfil/LGPD, PWA |
| Método | Etapas APQR, revisão com mínimo de questões, consolidação por regra, rodízio, revisões extras, desfazer em 30 min, produção de material |
| Professora | Central (KPIs, "Precisam de você agora"), Alunos, Raio-X (10 abas), ranking por edital, Editais, Materiais, Agenda, Equipe/monitores, Configurações versionadas, Auditoria |
| Relatórios | Por aluno (PDF), com IA (sem dados pessoais), Base de alunos (CSV, engajamento, vencimentos), listas CSV |
| Operação | Console ONE UP, RLS, backup cifrado, vigia WhatsApp, `apqr atualizar` |
| Financeiro | Webhook genérico, vendas, produtos, painel, acesso automático (congelado o adaptador do checkout) |

Congelado desde antes (não repetido): Caderno de Erros, gargalos, Hoje em 5 blocos, Meta da semana, Check-in semanal, Combinados, Simulados com análise, Reta Final, Mapa de constância, resumo semanal por e-mail, medição de uso, Agenda recorrente/push, Materiais extras, relatório mensal por e-mail, atualização automática.
Fora de vez: XP/níveis, ranking para o aluno, plano automático com minutagem, curva do esquecimento, banco gigante de questões, IA coach diária, comunidade/chat.

## 3. Quadro comparativo (função × plataforma × APQR)

Legenda: ✅ tem · ➖ parcial · ❌ não tem · ? sem fonte. Fontes na seção 8.

| Função | Tutory | Hotmart Club | Memberkit | Curseduca | Kiwify | Estratégia/Gran | **APQR** |
|---|---|---|---|---|---|---|---|
| Horas líquidas / cronômetro | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ (Gran) | ✅ |
| Análise de questões por assunto | ✅ | ❌ | ➖ quiz | ❌ | ❌ | ✅ | ➖ (consolidação por conteúdo) |
| Consolidação por regra explícita | ❌? | ❌ | ❌ | ❌ | ❌ | ❌? | ✅ |
| Relatório para o mentor | ✅ | ➖ | ✅ | ➖ | ➖ | ➖ | ✅ + IA |
| Orientação do mentor visível ao aluno | ✅ (Orientação do Coach) | ❌ | ❌ | ❌ | ❌ | ➖ (coaching) | ❌ **buraco** |
| Triagem de quem está parado | ✅ reativa (Dedo Duro, Atrasados) | ➖ filtros | ✅ Mscore | ➖ | ❌ | ❌? | ➖ regras fixas |
| Pausa de plano | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | v2.4.0 |
| NPS / satisfação | ✅ | ➖ | ✅ | ➖ | ❌ | ❌ | ❌ |
| Gamificação | ✅ placas/XP | ✅ | ✅ pontos | ✅ | ❌ | ➖ | fora de vez |
| Certificado | ➖ | ✅ | ✅ | ✅ | ✅ | ❌ | ⚪ descartado |
| Comunidade | ➖ | ✅ | ✅ | ✅ | ❌ (usa WhatsApp) | ➖ salas | fora de vez |
| Revisão espaçada / caderno de erros | ❌? | ❌ | ❌ | ❌ | ❌ | ✅ (Gran, Gabaritei) | congelado |
| Exportar dados do aluno e validade | ➖ | ➖ limite de 10 | ➖ | ❌ reclamação | ➖ | ? | ✅ |

## 4. Ideias priorizadas

**Como as notas funcionam:** Impacto 1–5 (o maior entre aluno e professora), Facilidade 1–5 (5 = fácil), Evidência 1–5 (5 = comprovada em estudos ou em várias plataformas), Risco técnico 1–5 (5 = seguro). **Prioridade = Impacto × Evidência × Facilidade** (máx. 125). Esforço em dias de trabalho do Claude, estimativa.

| ID | Ideia | Imp | Evid | Fac | Risco | Prioridade | Esforço | Classe |
|---|---|---|---|---|---|---|---|---|
| F1 | Recado da professora para o aluno | 5 | 4 | 5 | 5 | **100** | 3–4 d | 🟢 |
| F3 | Mensagens prontas por situação (WhatsApp 1 clique) | 4 | 4 | 5 | 5 | **80** | 3 d | 🟢 |
| F4 | Registro de contato e próximo contato | 4 | 3 | 5 | 5 | **60** | 3 d | 🟢 |
| F7 | NPS curto mensal | 3 | 4 | 5 | 5 | **60** | 2 d | 🟢 |
| F2 | Risco de evasão explicável + fila "quem chamar hoje" | 5 | 4 | 3 | 4 | **60** | 8–10 d | 🟢 |
| F15 | Pauta do check-in sugerida pela IA (apoio ao mentor) | 4 | 3 | 4 | 4 | **48** | 4 d | 🟢 (precisa da chave de IA) |
| F5 | Primeiros 7 dias + plano "se-então" | 4 | 3 | 4 | 5 | **48** | 5 d | 🟢 |
| F8 | Limite de sessões simultâneas e "aparelhos conectados" | 3 | 3 | 4 | 4 | **36** | 2 d | 🟢 pequeno |
| F11 | Anotação livre do aluno por conteúdo | 3 | 3 | 4 | 5 | **36** | 3 d | 🟡 junto do Caderno de Erros |
| F10 | Duplas/grupos de constância (piloto manual) | 3 | 2 | 5 | 5 | **30** | 0 d de código | 🔵 |
| F6 | Projeção de chegada à prova | 4 | 3 | 2 | 3 | **24** | 8–10 d | 🟡 |
| F9 | Faixa anônima da turma (percentil, opcional) | 3 | 2 | 3 | 4 | **18** | 5 d | 🔵 |

### F1 — Recado da professora para o aluno 🟢
- **Problema:** a mentoria entrega orientação, mas hoje o aluno só vê isso fora do app (WhatsApp). As anotações do app são privadas. Tutory tem "Orientação do Coach" no cronograma; a evidência de coaching proativo é a mais forte da pesquisa (Bettinger & Baker: +5,2 pontos percentuais de permanência aos 6 meses).
- **Aluno:** na tela Hoje, um cartão "Recado da Prof. Pollyana" com texto curto, data e botão "Li". Pode ser fixado ou ter validade.
- **Professora:** na ficha do aluno (ou em lote para uma turma/edital), escreve o recado, escolhe a validade e vê quem leu e quem não leu.
- **Exemplo de tela:** `📌 Recado da Pollyana · 05/10 — "Semana de revisão: foque em Farmacologia R2. Pare Legislação até quinta." [Li]`
- **Dados:** tabela de recados (autor, destino, texto, validade, lido_em). Sem chat nem resposta (resposta cria comunidade/chat, que está fora de vez).
- **Risco:** baixo. **Custo:** zero.

### F3 — Mensagens prontas por situação 🟢
- **Problema:** a professora escreve a mesma mensagem dezenas de vezes. Nudges funcionam quando vêm de alguém conhecido, personalizados com dado real (Castleman & Page: +8–9 pontos); genéricos de estranhos não funcionam e podem piorar (Baker, Evans & Dee: −10% de certificados).
- **Como funciona:** modelos por situação (parado há 7/15/30 dias, nunca acessou, acerto caiu, consolidou conteúdo, vence em X dias), preenchidos com o nome e o dado real do aluno, abrindo o WhatsApp da própria professora com `wa.me`. **Sem envio automático.**
- **Dados:** modelos editáveis por ambiente. **Custo:** zero.

### F4 — Registro de contato e próximo contato 🟢
- **Problema:** hoje não se sabe quando se falou com cada aluno; o mesmo aluno pode ser chamado duas vezes e outro esquecido.
- **Como funciona:** botão "Falei com o aluno" (canal + resumo em 1 linha + próximo contato em X dias). Quem foi contatado recentemente sai da fila de atenção. Visão por monitor: tempo desde o último contato.
- **Dados:** tabela de contatos. Complementa a nota privada. **Custo:** zero.

### F7 — NPS curto mensal 🟢
- **Problema:** Tutory (NPS do plano e da conta), Memberkit e Hotmart medem satisfação; o APQR não.
- **Aluno:** uma pergunta (0–10) e um campo opcional, uma vez por mês, dispensável.
- **Professora:** nota média, detratores com botão "chamar", evolução por mês e por edital. O aluno nunca vê as respostas dos outros.
- **LGPD:** identificado só para a professora; aviso claro na pergunta.

### F2 — Risco de evasão explicável + fila "quem chamar hoje" 🟢
- **Problema:** o alerta atual marca muita gente (no Tutory da ONE UP, 500 de 500 estão "em atraso"). Revisões de predição de evasão em MOOCs mostram que a atividade das primeiras semanas já prediz o abandono.
- **Como funciona:** uma pontuação simples de 0–100 por aluno, **sempre com os motivos visíveis** (nada de caixa-preta): queda de horas em 14 dias, lacuna de 3+ dias, primeira semana incompleta, acerto caindo, sem revisar há X dias, plano vencendo em 30 dias, sem contato há Y dias (usa F4). Ordena a "Central" como: Quem chamar hoje, com a pauta e a mensagem pronta (F3).
- **Calibração:** os limiares são **hipótese** e precisam ser ajustados com os dados reais depois de 4–6 semanas; começar só mostrando a pontuação sem automatizar nada.
- **Risco:** médio (falso alarme). **Custo:** zero.

### F15 — Pauta do check-in sugerida pela IA 🟢 (depende da chave)
- **Problema:** a professora gasta tempo preparando cada conversa. Tutor CoPilot (RCT, 900 tutores) mostrou ganho quando a IA apoia o tutor, não quando substitui.
- **Como funciona:** com base no Raio-X (que já existe), gerar "3 perguntas e 1 sugestão" para a conversa de 10 minutos. A IA recebe só números e marcadores, como no Relatório com IA atual, e a professora decide.
- **Custo:** estimado em centavos por aluno ao mês (a confirmar com a chave real). **Pré-requisito:** a chave da Anthropic, que está nas perguntas abertas.

### F5 — Primeiros 7 dias + plano "se-então" 🟢
- **Problema:** a primeira semana é a mais frágil. Nenhuma função do APQR guia o aluno novo além do onboarding de boas-vindas.
- **Aluno:** uma trilha de 5 passos (completar cadastro, ver o edital, registrar o primeiro estudo, fazer a primeira revisão, ver o primeiro relatório) e um plano "se-então": "Em dias úteis, às 6h, vou estudar 1h. Se faltar, faço 20 minutos à noite."
- **Professora:** vê o novo aluno "travado no passo X".
- **Cautela:** a evidência de intenção de implementação é boa em geral (Gollwitzer, da memória, não conferi o paper), mas **Baker et al. mostram que pedir para agendar pode piorar**; por isso medir com grupo-controle.

### F8 — Sessões simultâneas e "aparelhos conectados" 🟢 pequeno
- **Problema:** conteúdo e mentoria compartilhados entre pessoas. Memberkit bloqueia acesso simultâneo; o APQR já tem marca d'água em PDF.
- **Como funciona:** máximo de 2–3 sessões ativas; o aluno vê e encerra os aparelhos. A professora vê alertas só em caso de excesso.

### F11 — Anotação livre do aluno por conteúdo 🟡
Anotação curta na gaveta do conteúdo (Gran "PDF turbinado", Notion). Vale mais quando for feita junto com o Caderno de Erros (congelado): as duas dividem a mesma estrutura.

### F6 — Projeção de chegada à prova 🟡
- **Como funciona:** com o ritmo de consolidação das últimas semanas e a data da prova (evento do edital), mostrar "no ritmo atual, você consolida cerca de X% do edital até a prova". É uma projeção, **não um plano automático** (que está fora de vez).
- **Para a professora:** lista de quem não chega a tempo. Alimenta a conversa e o modo Reta Final (congelado).
- **Risco:** a projeção precisa de dado confiável da data da prova e de pelo menos 3 semanas de histórico; mostrar faixa, não número exato.

### F10 — Duplas/grupos de constância (piloto manual) 🔵
- **Problema:** accountability em grupo pequeno (5–8) é plausível, mas não achei evidência forte; comunidade em app está fora de vez.
- **Piloto sem código:** a Pollyana forma 3 grupos de 6 alunos no WhatsApp por 4 semanas, com uma regra simples (cada um posta o "feito do dia"). Medir horas e constância contra um grupo de controle. Só se der resultado entra no app.

### F9 — Faixa anônima da turma 🔵
- Um percentil opcional ("você está na faixa 40–60% de horas da turma"), sem nomes nem ranking. Conflita com a decisão de que ranking para o aluno está fora de vez. **Precisa de decisão do Lucas** (pergunta 2). Evidência de efeito é fraca para adulto sob pressão de prova.

## 5. Ideias descartadas (com o motivo)

| Ideia | Onde existe | Por que descartar |
|---|---|---|
| Pontos, níveis e ranking de alunos | Memberkit, Curseduca, Tutory (XP) | Já está fora de vez; público adulto e sob pressão; a evidência é fraca (Habitica/Forest sem RCT; críticas de manipulação em Duolingo) |
| Certificado de conclusão | Hotmart, Kiwify, Memberkit, Curseduca, Greenn | O aluno quer aprovação, não certificado de mentoria; sem valor de estudo |
| Comunidade, fórum e chat | Hotmart, Memberkit, Circle | Fora de vez; o Kiwify mesmo entrega isso por WhatsApp. Teste só pelo piloto F10 |
| IA que responde dúvidas do aluno (24 h) | Greenn Mentor.ai, Tutory | IA coach diária fora de vez; o ganho comprovado é com IA apoiando o mentor (F15) |
| Liberação gradual (drip) | Hotmart, Kiwify, Mighty | O rodízio do APQR já controla o ritmo por regra; "materiais só para plano ativo" já está nas pendências |
| Mapa de domínio do edital | Khan, Tutory ("cobertura do edital") | O APQR já mostra etapa por conteúdo, equilíbrio do edital e progresso por matéria |
| Banco de questões, simulados adaptativos | Tutory, Estratégia, Gran, QConcursos | Fora de vez (banco gigante) e custo enorme; depende de decisão de negócio |
| Revisão espaçada por FSRS | Anki, Gabaritei | Evidência forte, mas Caderno de Erros e curva do esquecimento estão congelados/fora de vez. Revisitar junto do Caderno de Erros |
| Cancelamento pelo próprio aluno | Várias | Toca em cobrança; congelado com o pagamento |

## 6. Sequência sugerida de versões

| Versão | Tema | Itens | Esforço total |
|---|---|---|---|
| 2.4.0 | Planos e tempo de acesso (já definida) | planos, pausa, cancelamento com motivo, vencimentos | — |
| 2.5.0 | Acompanhamento da professora | F1, F3, F4, F7 | ~11 dias |
| 2.6.0 | Risco e pauta | F2, F15 (se houver chave) | ~14 dias |
| 2.7.0 | Primeiros dias do aluno | F5, F8 | ~7 dias |
| 2.8.0 | Planejamento | F6, F11 (com Caderno de Erros se liberado) | ~13 dias |
| Piloto em paralelo | F10 (manual) e F9 (decisão) | — | — |

Cada versão entra pelo `apqr atualizar`, com cópia de segurança e volta automática.

## 7. Perguntas que só o Lucas pode responder (com a minha recomendação)

1. **Chave de IA (Anthropic):** liberar? *Recomendo sim, com limite diário por ambiente (já existe). Sem ela, F15 não entra.*
2. **Faixa anônima da turma (F9):** o ranking para o aluno ficou "fora de vez". *Recomendo manter fora e testar só o piloto F10.*
3. **Recado da professora (F1):** o aluno pode responder? *Recomendo que não; resposta vira chat, que está fora de vez. O aluno responde pelo WhatsApp como hoje.*
4. **NPS (F7):** quem enxerga as respostas? *Recomendo só a professora e o admin, nunca os monitores.*
5. **Piloto de grupos (F10):** a Pollyana topa formar 3 grupos de teste por 4 semanas? *Recomendo sim; custa zero e responde com dado se vale construir.*
6. **Ordem das versões:** aprovar 2.5.0 como próxima depois da 2.4.0? *Recomendo sim: tudo de baixo esforço e de uso diário da professora.*

## 8. Fontes e limites da pesquisa

**Plataformas**
- Tutory: [relatórios](https://ajuda.tutory.com.br/pt-BR/articles/12701510-tutory-mentoria-relatorios-gerais-e-relatorios-especificos), [central de ajuda](https://ajuda.tutory.com.br/pt-BR/collections/8140923-tutory-mentoria), [site](https://www.tutory.com.br/)
- Memberkit: [gamificação](https://ajuda.memberkit.com.br/como-funciona/gamificacao), [relatórios](https://ajuda.memberkit.com.br/como-funciona/relatorios)
- Hotmart: [gestão de alunos](https://suportehotmart.zendesk.com/hc/pt-br/articles/15584344141197-Como-fazer-a-gest%C3%A3o-de-alunos-no-Hotmart-Club), [blog](https://hotmart.com/en/blog/hotmart-club-distance-learning-platform)
- Curseduca: [gamificação](https://help.curseduca.com/conteudos/area-de-membros/gamificacao)
- Kiwify: [certificado](https://ajuda.kiwify.com.br/pt-br/article/como-configurar-um-certificado-5749he/)
- Eduzz: [Nutror](https://www.eduzz.com/produtos/nutror) · Ticto: [Mozart](https://help.ticto.com.br/sou-produtor/area-de-membros-mozart) · Greenn: [Club](https://greenn.com.br/blog/greenn-club-area-de-membros/)
- Kajabi: [coaching](https://www.kajabi.com/product/coaching) · Circle: [membership](https://circle.so/membership)
- Estratégia: [ferramentas](https://www.estrategiaconcursos.com.br/blog/ferramentas-de-estudo-do-estrategia/) · Gran: [gerenciador](https://blog.grancursosonline.com.br/gran-gerenciador-de-estudos-na-web/), [plataforma](https://grancursosonline.zendesk.com/hc/pt-br/articles/41111161185563-Quais-recursos-a-plataforma-do-Gran-oferece-para-potencializar-os-seus-estudos)
- Gabaritei: [site](https://gabaritei.com.br/) · QConcursos: [questões](https://www.qconcursos.com/questoes-de-concursos/questoes)
- Reclame Aqui: [Estratégia](https://www.reclameaqui.com.br/empresa/estrategia-concursos/), [Gran](https://www.reclameaqui.com.br/empresa/gran-concursos/), [TEC](https://www.reclameaqui.com.br/empresa/tec-concursos/), [Curseduca (exportação)](https://www.reclameaqui.com.br/curseduca/plataforma-curseduca-nao-oferece-exportacao-de-dados-de-alunos-e-suporte-in_oQFV-xgm3r0cHlVB/), [Hotmart (limite de importação)](https://www.reclameaqui.com.br/hotmart/limite-de-importacao-de-alunos-na-area-de-membros-da-hotmart_VEJaoF77cYqvkPMZ/)

**Evidência**
- Coaching proativo: [Bettinger & Baker](https://edpolicyinca.org/sites/default/files/2023-11/bettinger-effectsstudentcoaching-2014.pdf)
- Nudges que pioraram: [Baker, Evans & Dee](https://journals.sagepub.com/doi/10.1177/2332858416674007) · mensagens de pessoas conhecidas: [Castleman & Page](https://www.nber.org/system/files/working_papers/w27897/w27897.pdf)
- IA apoiando o tutor: [Tutor CoPilot](https://arxiv.org/pdf/2410.03017v1)
- Evasão em MOOCs: [revisão sistemática](https://www.researchgate.net/publication/363820560_A_systematic_review_for_MOOC_dropout_prediction_from_the_perspective_of_machine_learning)
- Streaks: [Lenny's/Duolingo](https://www.lennysnewsletter.com/p/behind-the-product-duolingo-streaks) · Khan: [resultados](https://blog.khanacademy.org/khan-academy-efficacy-results-november-2024/)
- Técnicas de estudo: [Dunlosky et al.](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html) · FSRS: [benchmark](https://expertium.github.io/Benchmark.html)

**Limites (leia antes de decidir)**
- TEC Concursos (erro 405) e Coruja não foram verificados. O detalhe do SQ do Estratégia não foi lido. Reddit e fóruns não devolveram conversas.
- Reclame Aqui e G2 foram lidos por título ou resumo, não em volume.
- Gollwitzer & Sheeran (d ≈ 0,65), Rohrer (2020), Rowland (2014) e Cepeda (2006) vieram de resumos ou da memória; **abra o artigo antes de citar números** em conteúdo público.
- Quase toda evidência de intervenção vem de ensino básico, universitário e MOOC; para concurso é extrapolação.
- Os limiares de risco (F2) e as estimativas de esforço são hipóteses a calibrar.
- O Tutory da ONE UP só foi lido de forma agregada (totais e médias); nenhum nome de aluno foi usado neste documento.
