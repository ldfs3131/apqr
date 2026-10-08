# Painel de decisão — 16 propostas (05/10/2026)

> **Leia primeiro:** este painel é uma **simulação feita pelo Claude**. Os 50 especialistas, os 10 desenvolvedores e os 500 alunos são papéis simulados, não pessoas reais. As notas dos alunos foram geradas por modelo (médias-alvo definidas por segmento + sorteio individual), então são **hipóteses para orientar**, não pesquisa de mercado. Os três painéis foram feitos pela mesma IA, o que tende a deixá-los parecidos. Os achados dos desenvolvedores sobre o código foram conferidos no repositório e são os mais confiáveis. Valide com 15–20 alunos reais antes de investir em qualquer item de nota média.

## Método
1. **Comitê de 50** (10 áreas × 5): redesenhou os 5 buracos e as 12 ideias em 16 propostas (4 novas) e deu nota de 0 a 10.
2. **10 desenvolvedores** (backend, banco/RLS, segurança, frontend/PWA, DevOps, QA, dados, SRE, LGPD, manutenção): nota de 0 a 10 por proposta, lendo o código real.
3. **500 alunos simulados** (10 segmentos × 50): nota de 0 a 10 do ponto de vista do aluno.
4. **Média final** = (comitê + desenvolvedores + alunos) ÷ 3.
- **Decisão:** ≥ 7,0 implementar · 5,5 a 6,9 ajustar ou piloto · < 5,5 não agora.
- **Trava:** mesmo com média alta, nota de qualquer painel abaixo de 4 ou rejeição ativa de alunos ≥ 30% impede "implementar".

## Resultado

| # | Proposta | Comitê | Devs | Alunos | Rejeição | **Média** | Decisão | Esforço |
|---|---|---|---|---|---|---|---|---|
| P01 | Recado da professora | 8,42 | 8,10 | 6,61 | 4,6% | **7,71** | ✅ IMPLEMENTAR | 5 d |
| P03 | Mensagens prontas (WhatsApp) | 7,66 | 7,30 | 5,35 | 9,8% | **6,77** | 🟡 ajustar | 4 d |
| P06 | Trilha dos primeiros 7 dias | 7,72 | 6,70 | 5,21 | 11,6% | **6,54** | 🟡 ajustar | 6 d |
| P16 | Higiene do sinal (não registrou × não estudou) | 7,06 | 5,70 | 6,75 | 3,2% | **6,50** | 🟡 ajustar | 6 d |
| P04 | Registro de contato | 7,48 | 6,80 | 4,91 | 10,4% | **6,40** | 🟡 ajustar | 4 d |
| P05 | Pulso mensal (NPS) | 7,02 | 7,00 | 4,94 | 14,4% | **6,32** | 🟡 ajustar | 4 d |
| P02 | Fila "quem chamar hoje" | 7,44 | 6,00 | 4,83 | 11,6% | **6,09** | 🟡 piloto sombra | 11 d |
| P13 | Feedback do alerta | 6,86 | 6,30 | 4,73 | 8,6% | **5,96** | 🟡 junto do P02 | 4 d |
| P15 | Grupo-controle embutido | 7,16 | 6,50 | 3,74 | 31,6% | **5,80** | 🟡 só com aviso claro | 4 d |
| P08 | Pauta de check-in por IA | 5,86 | 6,50 | 4,89 | 21,4% | **5,75** | 🟡 opcional, com consentimento | 5 d |
| P10 | Anotação livre por conteúdo | 5,24 | 6,00 | 5,80 | 5,0% | **5,68** | 🟡 junto do Caderno de Erros | 3 d |
| P14 | Delegação aos monitores | 6,74 | 6,10 | 4,20 | 22,0% | **5,68** | 🟡 só interna | 4 d |
| P07 | Plano "se-então" | 5,58 | 6,60 | 3,72 | 37,8% | **5,30** | ❌ não agora | 3 d |
| P12 | Projeção de chegada à prova | 6,22 | 4,30 | 4,51 | 25,2% | **5,01** | ❌ não agora | 10 d |
| P09 | Aparelhos e limite de sessões | 5,52 | 5,90 | 3,36 | 36,8% | **4,93** | ❌ não agora | 3 d |
| P11 | Grupos de constância (WhatsApp) | 4,84 | 5,60 | 4,03 | 33,6% | **4,82** | ❌ não agora | 0,5 d |

**Leitura honesta:** só uma proposta passa de 7 (o Recado da professora). O painel não achou "unanimidade" em quase nada, o que é saudável: a maioria ficou na faixa de ajuste, não de descarte.

## O que o painel exige mudar (por proposta)

**P01 Recado ✅** — Para envio em lote, usar uma **tabela de destinatários** (um `lido_em` por aluno), não um campo único. Pré-visualizar o texto antes de enviar em lote (risco de variável errada para centenas). Os alunos pedem o recado também por WhatsApp e com prazo maior de validade; entra como "copiar para WhatsApp" na primeira versão.

**P03 Mensagens prontas 🟡** — Só abrir quando houver motivo e dado concreto e correto, mostrar a prévia e o aviso "falou com este aluno há X dias". Devs e alunos temem enviar com dado errado. Há uma regra antiga do backlog contra WhatsApp no app; confirmar que `wa.me` (abrir a conversa, sem enviar) está dentro dela.

**P04 Contato 🟡** — **Sem campo livre** (vira depósito de dado sensível, sem retenção). Usar canal + resultado em categorias + próximo contato. Respeitar a pausa. Entrar no export LGPD, no backup e no `truncateAll`.

**P05 NPS 🟡** — Mais raro (trimestral), com "pular", e dizer com clareza que a professora vê quem respondeu (anonimato falso gera desconfiança). Poucas respostas dão métrica instável; mostrar o n.

**P06 Trilha 🟡** — Curta, opcional para veteranos, terminando em conteúdo (não em "tour do app"). Depende de eventos que hoje não são registrados (ver o edital, abrir o relatório).

**P16 Higiene do sinal 🟡** — Os desenvolvedores apontaram que o "500 de 500 em atraso" é um problema **do Tutory, não do APQR**. Na minha auditoria usei esse dado como indício de que triagem binária não discrimina; isso é inferência, não defeito comprovado do APQR. O que fica de útil: **"semana atípica"** (viagem, doença, plantão) e registro retroativo. O registro manual já aceita data de até 1 ano, então a janela de 24 h proposta seria **mais restritiva**; manter a regra atual.

**P02 Fila "quem chamar hoje" 🟡** — 11 dias de esforço, nota baixa dos alunos (medo de ser cobrado sem ver). Fazer **em modo sombra** por 4–6 semanas (só a professora vê, sem ação automática), com os motivos sempre visíveis. Antes: a Central hoje inclui ex-alunos (`loadClass` não filtra `plan_status`/`access_until`) e a fila repetiria isso; corrigir primeiro.

**P13 Feedback do alerta 🟡** — Só faz sentido junto do P02.

**P15 Grupo-controle 🟡** — Rejeição de 31,6% ("não quero ser cobaia"). Só com aviso claro de que é um teste e garantia de que o controle não perde apoio. O nome `cohort` já existe em `students` (significa turma); usar outro nome.

**P08 IA 🟡** — Segurança/LGPD deu 3,6; alunos desconfiados rejeitam (21%). Opcional, com consentimento explícito e só com marcadores (sem dados pessoais), como o Relatório com IA já faz. Depende da chave.

**P10 Anotação 🟡** — É um Caderno de Erros pela porta dos fundos; fazer junto dele.

**P14 Delegação 🟡** — Só interna, com monitor identificado; a Pollyana fica em renovação e casos graves. Exige teste explícito de papel: a RLS isola por ambiente, mas quem separa monitor e professora é o código (`studentScope`).

**P07, P12, P09, P11 ❌** — P07: promessa que a rotina não cumpre gera culpa (rejeição de 37,8%); a tela Rotina já existe. P12: previsão frágil lida como sentença (devs 4,3). P09: o código cria uma sessão por login, então o mesmo celular estouraria o limite. P11: quase comunidade por outro canal (fora de vez), exposição de telefones e autosseleção invalida a medição.

## Problemas do código encontrados (úteis para qualquer versão)
- A v2.4.0 ainda não existe no código (só `access_until` e `plan_status`); P02, P05 e P16 dependem dela.
- A Central inclui ex-alunos (ver P02).
- `/me/export` (LGPD) não inclui `teacher_notes`. Tabelas novas com dado do aluno precisam entrar no export, no backup e no `truncateAll` (o teste `backup-coverage` falha se faltar).
- O `audit_log` e as sessões guardam o IP inteiro, sem retenção definida.
- Já existem: Rotina (`routine_blocks`), Agenda com tipo "lembrete" (para todos, turma, edital ou aluno), `onboarding_done`, `staff_assignments` e a tela Equipe. As propostas devem reaproveitar isso em vez de duplicar.

## Recomendação final
1. **v2.4.0** (planos, pausa, cancelamento, vencimentos) primeiro. Nada do painel muda isso.
2. **v2.5.0 enxuta (~13 dias):** P01 (Recado) + P03 (mensagens prontas) + P04 (contato, sem campo livre). Todos ≥ 6,4, risco baixo, uso diário da professora. P05 (NPS) entra se sobrar espaço.
3. **Antes de P02:** corrigir a Central para ignorar ex-alunos e rodar 4–6 semanas em modo sombra.
4. **Não construir agora:** P07, P12, P09, P11.
5. **Validação real:** mandar a 15–20 alunos reais uma pergunta simples ("de 0 a 10, o quanto um recado da Pollyana dentro do app ajudaria você?"). Dez minutos de resposta valem mais que 500 notas simuladas.
