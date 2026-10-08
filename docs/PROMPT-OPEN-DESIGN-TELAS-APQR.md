# Prompt para o Open Design: protótipo visual das telas novas do APQR

Cole tudo o que está dentro do bloco abaixo.

```
OBJETIVO
Crie um PROTÓTIPO VISUAL CLICÁVEL (HTML responsivo, dados de exemplo fictícios, sem backend) de 5 telas novas do aplicativo "Método APQR", plataforma de estudos de uma mentoria para concursos de farmácia (marca Pollyana Lyra / ONE UP). O público é o aluno concurseiro, que usa muito o celular. Quero ver o visual para aprovar antes de programar. Entregue as telas navegáveis por um menu simples no topo (Tela 1 a 5) e cada tela em duas larguras: celular (390 px) e computador (1200 px).

CONTEXTO DO MÉTODO (para o texto fazer sentido)
O aluno estuda cada tópico do edital em 4 etapas: Assimilação, Produção de material, Questões e Revisão. Cada tópico tem cor: vermelho (não iniciado), laranja (assimilação), amarelo (material pronto), verde (questões e revisão) e verde-escuro (consolidado). O aluno nunca vê ranking nem compara com colegas. Não existe cronograma por data nem repetição espaçada automática. O aplicativo NUNCA mostra "previsão de aprovação" ao aluno.

IDENTIDADE VISUAL (já usada no app; mantenha a coerência)
- Azul principal #0a4296, azul suave #e6eef9, amarelo de destaque #fcb132 (uso pontual), fundo #f4f6fa, cartões brancos, texto #0e1726 / #3c4a5f / #6b778a, bordas #e1e6ee.
- Estados: bom #0c8a0c (fundo #e5f4e5), atenção #b77900 (fundo #fdf3dc), crítico #c42f2f (fundo #fbe7e7).
- Cores de status das semanas: vermelho #bd2f2b (menos de 50%), amarelo #f0c020 (50% a 99%), verde #46b06c (100% ou mais).
- Cantos arredondados (18 px nos cartões, 10 px nos botões e campos), sombra muito leve, títulos fortes e compactos, tipografia sans-serif legível. Visual limpo, moderno e motivador, sem poluição. Rosa só decorativo, nunca em texto.
- Acessibilidade: contraste mínimo AA, alvos de toque de 44 px, nunca depender só da cor (sempre ícone ou rótulo junto).
- Tom do texto: português do Brasil, direto, incentivador, sem culpa, sem comparar com outros alunos.

TELA 1 — MÊS COLORIDO + CHAMA + ESCUDOS (tela inicial do aluno, parte do Pacto)
- Cabeçalho com saudação curta, 🔥 Chama em destaque (ex.: "7 semanas seguidas") e 🛡️ Escudos (ex.: "2 de 3").
- Um cartão por semana do mês (4 a 5 cartões): intervalo da semana ("29 set a 5 out"), barra de progresso (horas feitas / horas prometidas, ex.: 6h20 de 10h), porcentagem e etiqueta de status colorida ("Em andamento", "Semana vencida", "Meta batida", "Escudo usado"). Mostre uma semana em cada estado: vermelha (30%), amarela (70%), verde (110%), uma com escudo usado, e a semana atual em andamento.
- Legenda das cores (vermelho menos de 50%, amarelo 50% a 99%, verde 100% ou mais) e o aviso "A semana vale com pelo menos 50% das horas prometidas".
- No fim, uma frase de incentivo curta e positiva.

TELA 2 — DEFINIR O PACTO DA SEMANA
- Título "Seu pacto desta semana". Campo de horas da semana (stepper de 30 em 30 min, ex.: 10 h) e seletor dos dias da semana (S T Q Q S S D, tocáveis) com a conta automática "média de 2h30 por dia".
- Aviso discreto: "Você pode alterar até quarta, 23h59. Depois o pacto trava."
- Sugestão automática, quando couber, em um cartão amarelo suave: "Nas últimas 2 semanas você ficou abaixo de 50%. Que tal um pacto de 7 h?" com botão de um toque "Usar 7 h".
- Botão principal "Confirmar pacto". Estado de sucesso depois de confirmar.
- Mostre também a variação "pacto travado" (campos desabilitados, texto "O pacto desta semana está travado").

TELA 3 — AJUSTE DE ROTA (relatório quinzenal automático do aluno)
- Cabeçalho: "Ajuste de Rota — 22 set a 6 out" e subtítulo "Um retrato dos seus últimos 15 dias".
- Blocos em cartões, nesta ordem:
  1. Placar da quinzena: horas feitas × pacto, porcentagem e seta de subida ou descida em relação à quinzena anterior.
  2. Edital em cores: faixa com quantos tópicos mudaram de cor (ex.: 6 passaram para amarelo, 3 para verde, 1 consolidado).
  3. Questões: volume total, % de acerto por matéria em barras horizontais (5 matérias), com um selo "dados iniciais" em uma das matérias que tem poucas questões, e um aviso "faltam 12 questões para analisar Farmacologia" em outra.
  4. Revisões: tópicos consolidados e revisões feitas no ciclo.
  5. Conquista da quinzena: cartão com troféu e frase (ex.: "Você bateu o pacto 2 semanas seguidas").
  6. "3 ajustes para a próxima quinzena": três cartões curtos, cada um com ícone, uma frase e a base do número (ex.: "Seu acerto em Legislação está em 58% com 41 questões. Reforce questões nessa matéria."). Botão "Aceitar ajustes".
- Rodapé pequeno: "Sugestões geradas por regras do método, sem inteligência artificial."
- NÃO mostrar: previsão de aprovação, ranking, comparação com colegas, melhor horário, caderno de erros.

TELA 4 — PERÍODO DE ACESSO ENCERRADO (aluno com plano vencido)
- Título "Seu período de acesso encerrou". Resumo do que o aluno conquistou (horas estudadas, questões resolvidas, tópicos consolidados, edital em cores em miniatura).
- Botão grande "Renovar meu acesso" e, se for aluno vindo da consultoria, um cartão dourado do bônus: medalha Prata e "R$ 75 de desconto na renovação, válido até 21/10".
- Abaixo, três pequenos botões bloqueados com cadeado (Estudar, Materiais, Cursos) e o link "Baixar meus dados".
- Mostre também a variação "Plano pausado" (mesmo layout, título "Seu plano está pausado", sem botão de renovar e com a data de retorno).
- Tom acolhedor, sem pressão agressiva de venda.

TELA 5 — ABA CONSULTORIA DO ALUNO (progresso do bônus)
- Linha do tempo da jornada (pago, diagnóstico enviado, sessão realizada, plano de ação, relatório, continuidade) com a etapa atual destacada.
- Três metas do bônus com barras: Constância (Chama acesa em 3 de 4 semanas), Questões (212 de 300) e Plano (5 de 7 ações feitas, 70% necessário).
- Medalhas Bronze, Prata e Ouro com a atual em destaque, e a frase "O bônus é um desconto na renovação, não vale dinheiro e vale por 15 dias após o relatório."
- Lista de ações do plano de ação com caixas de marcar.

EXTRA (se couber, como tela 6): CALENDÁRIO MENSAL "DIAS DE ESTUDO" — grade de mês (segunda a domingo) em que cada dia tem intensidade de cor pelo tempo estudado; no computador mostra as horas dentro do dia, no celular só o número do dia e a cor; setas para mudar o mês; legenda.

REGRAS DE ENTREGA
- Dados de exemplo realistas em português (matérias de farmácia: Farmacologia, Legislação Sanitária, Assistência Farmacêutica, Farmacotécnica, Microbiologia).
- Estados vazios e de erro simples quando fizer sentido.
- Navegação clicável entre as telas e variações (por exemplo, abas "Em andamento / Travado").
- Não invente funcionalidades fora das descritas. Se algo estiver ambíguo, escolha a opção mais simples e anote a decisão em uma legenda pequena no fim da tela.
- Ao final, liste em poucas linhas o que você decidiu por conta própria.
```
