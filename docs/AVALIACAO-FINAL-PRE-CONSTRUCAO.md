# Comitê final antes de construir (07/10/2026)

> **ATUALIZAÇÃO 14:57:** o Lucas pediu para NÃO mexer no cadastro de editais. Os itens 9 (importador) e 12 (trava de nome repetido) e todo o §3 estão **fora do escopo**; o §3 fica só como registro do teste. A fase v2.4.1 deixa de existir.

Base: código da v2.3.1, `ESCOPO-CONSULTORIA-DECIDIDO.md`, `AUDITORIA-PRE-IMPLEMENTACAO.md` e as decisões do Lucas de hoje. Nada foi construído.
**Aviso:** as notas são opinião do modelo (comitê simulado de 5 funcionais e 5 técnicos). Não medem nada de forma objetiva. As colunas F e T são a média das cinco opiniões de cada lado; a nota final é (F + T) ÷ 2, arredondada a uma casa. Não calculei a mediana individual dos 10, porque as notas foram dadas já por grupo.

## 1. Resumo
- **Pode construir.** Nenhuma decisão do Lucas fere as regras do método.
- **Maior risco:** mudança de banco em produção (acessos, perfis, aceite do termo) sem ensaio. Mitigação: backup, ensaio em cópia, mudanças só de acréscimo.
- **Segundo risco:** aluno vencido que já está logado continuar usando. Corrige-se no servidor.
- **Importador de editais (colar texto):** testado em um edital real (Anvisa 2024). Funcionou no cargo de interesse. Ver §3.
- **Adiar:** Pagar.me (até a conta ativar), IA (até o teto de custo e base sólida), leitura direta de PDF, biblioteca de matérias.
- **Fora:** "melhor horário", Google Agenda/Meet integrado, importação de edital pelo aluno, Central da Equipe completa, MCP, Simulador.
- **Ordem:** v2.3.2 → v2.4.0 (acessos e perfis) → importador → Fase 1B → 1C.

## 2. Itens avaliados (20)

| # | Item | Existe hoje? | Esforço | Dependências | F | T | Final | Veredito |
|---|---|---|---|---|---|---|---|---|
| 1 | Rótulo **Q/R-1, Q/R-2…** em função única | Só "R1…R4" em telas e mensagens do servidor | P | nenhuma | 8,0 | 9,5 | 8,8 | Fazer (v2.3.2) |
| 2 | Calendário mensal (horas em tela larga; número e cor no celular) | Mapa de calor de 182 dias | P/M | nenhuma | 8,0 | 8,5 | 8,3 | Fazer (v2.3.2) |
| 3 | Botão WhatsApp com texto pronto (nunca envia sozinho) | Não | P | telefone 10–11 dígitos; prefixo 55 | 9,0 | 9,0 | 9,0 | Fazer (v2.3.2) |
| 4 | Edição de cadastro pela equipe + caixa de confirmação com valor anterior e novo + nascimento | Só nome, validade, objetivo, plano | M | coluna nova (nascimento); auditoria com valor anterior | 9,0 | 8,0 | 8,5 | Fazer (v2.3.2) |
| 5 | Corrigir aluno vencido logado + tela "período encerrado" | Login bloqueia; sessão aberta não | M | item 6 | 8,5 | 8,5 | 8,5 | Fazer (v2.4.0) |
| 6 | Acessos com validade (turma, consultoria, plataforma), pausa (1 por plano, extra só com a Professora), cancelamento com motivo | Só `access_until` | G | migração, ensaio em cópia | 9,0 | 6,5 | 7,8 | Ajustar: entra com ensaio |
| 7 | Perfis: Monitor (só editais e arquivos), Coordenadora, Professora/Administrador (2 logins) | Professora e mentor | M/G | e-mails distintos; revisão de permissões | 9,0 | 6,5 | 7,8 | Ajustar: revisão por tela |
| 8 | Termo (PDF versionado, cópia no sistema, aceite com versão/data/hora/IP) + caixa de consentimento no diagnóstico | Não | M | texto do termo | 8,5 | 8,0 | 8,3 | Fazer (v2.4.0) |
| 9 | **Importar edital colando o texto** (prévia editável) | Cria matéria e cola tópicos um por linha | M | nenhuma de banco | 9,5 | 8,5 | 9,0 | Fazer (depois da v2.4.0) |
| 10 | Aba Questões ("Faço Questão de Farmácia"), materiais por turma, links dos 2 grupos de WhatsApp por turma | Materiais sem público; sem aba | M | lista de turmas; colunas novas | 8,0 | 8,0 | 8,0 | Fazer (Fase 1B) |
| 11 | Foto de perfil (uso interno, enviada pelo aluno) | Só iniciais | M | migração de arquivos; termo | 6,5 | 7,0 | 6,8 | Depois (v2.5) |
| 12 | Trava de nome de edital repetido (sem acento/maiúscula) | Não | P | nenhuma hoje (não há duplicados) | 7,5 | 9,0 | 8,3 | Fazer junto do 9 |
| 13 | Diagnóstico nativo + quadro da jornada da consultoria | Não | G | itens 6 e 8 | 8,5 | 6,5 | 7,5 | Fazer (Fase 1B) |
| 14 | Plano de ação (PDF) + relatório de 30 dias com aprovação da Professora | Não | G | item 13; regra de credibilidade | 8,5 | 6,0 | 7,3 | Ajustar: versão mínima primeiro |
| 15 | Bônus de execução (medição automática, aplicação manual) | Não | M/G | item 14 | 7,5 | 6,0 | 6,8 | Ajustar: por último |
| 16 | Pacto de Estudo (substitui Meta da semana; semana de segunda a domingo, fuso do aluno) | Rotina guarda disponibilidade | M | item 20 | 8,5 | 6,5 | 7,5 | Fase 2 |
| 17 | Fila da Coordenação (lista calculada, "marquei como feito") | Não | M | tabela pequena | 8,0 | 7,5 | 7,8 | Fase 1C/2 |
| 18 | Pagar.me + catálogo de preços | Webhook genérico | M/G | conta ativa e chaves | 8,5 | 5,5 | 7,0 | Adiar até ativar |
| 19 | E-mail transacional (SMTP) | App já suporta; desligado | P | conta no provedor, SPF/DKIM | 7,5 | 8,0 | 7,8 | Deixar pronto e desligado |
| 20 | Regra de credibilidade (mínimos por insight; IA só com base sólida) | Não | M | teto de custo da IA | 8,0 | 7,0 | 7,5 | Fazer a regra; IA desligada |

Conta de conferência (média F/T → final), exemplo: item 6: (9,0 + 6,5) ÷ 2 = 7,75 → 7,8. Item 15: (7,5 + 6,0) ÷ 2 = 6,75 → 6,8.

## 3. Importador de editais (colar texto): teste real

**Fato (testado):** extraí o texto do PDF da Anvisa (ED 1/2024) e rodei um leitor protótipo, que separa matérias por título em maiúsculas seguido de ":" e tópicos por numeração sequencial (1, 1.1, 1.2, 2…).
- **Cargo Área 2:** 7 matérias, 40 itens principais e 29 subitens (69 linhas). Conferi à mão Farmacologia (6 itens, 17 subitens) e BPF (8 itens, 10 subitens): bateu.
- **Documento inteiro (conhecimentos básicos, complementares e as 4 áreas):** 49 matérias e 476 linhas, sem erro de estrutura.
- **A numeração sequencial evita erros:** "Lei nº 6.030/1976" e "ED50" não viram tópico.
- **Defeitos encontrados:**
  1. As linhas "CARGO: …" apareceram como matéria vazia. Corrige-se tratando "CARGO" como marcador de seção.
  2. A matéria "IV EVOLUÇÃO DA VIGILÂNCIA SANITÁRIA NO BRASIL" tem o "IV" no próprio edital. A prévia editável serve para corrigir isso.
  3. Seis linhas passam de 300 caracteres (o servidor hoje recusa nome de tópico acima disso). A prévia avisa "tópico longo" e deixa dividir ou encurtar.
  4. Três matérias têm um item principal só (por exemplo Boas Práticas Laboratoriais). É assim no edital; a prévia só avisa.

**Não verificado:** só tenho um edital da Anvisa. Outras bancas escrevem de outro jeito (sem numeração, itens separados por ponto e vírgula, tabelas). Não sei a taxa de acerto nesses casos. Por isso o leitor tem um modo de reserva (separar por ";" e ".") com aviso de baixa confiança, e a pessoa sempre confere antes de criar.

**Como funciona para o Lucas ("achar o cargo"):**
1. Colar o texto do conteúdo programático (todas as páginas, sem recortar).
2. O sistema lista o que achou: "Conhecimentos básicos", "Conhecimentos complementares", "Cargo: Área 1, 2, 3, 4".
3. Marcar o que entra, por exemplo básicos + complementares + Área 2.
4. Prévia em árvore: renomear, juntar, mover, dividir, apagar; opção "subitens como tópicos próprios" por matéria (nome "3 Farmacocinética – 3.1 Vias de administração").
5. Confirmar. Só aí grava, tudo ou nada, com registro de auditoria.

**Decisões de projeto:** o leitor roda **no navegador** (não pesa no servidor de 1 CPU e não grava nada antes de confirmar); o servidor valida de novo o que recebe (limites de tamanho, número de matérias e tópicos); o texto original não é alterado, só separado. Monitor, Coordenadora e Professora podem importar; aluno nunca. Fica congelado: ler PDF direto, biblioteca da casa, "Organizar com IA".

## 4. Notas gerais do aplicativo (opinião)

| Dimensão | Hoje (v2.3.1) | Tudo de uma vez | Plano em fases |
|---|---|---|---|
| Valor para o aluno | 7,5 | 8,5 | 8,5 |
| Valor para a equipe e o negócio | 6,5 | 8,5 | 8,5 |
| Aderência ao método | 9,0 | 8,5 | 9,0 |
| Segurança e LGPD | 7,5 | 6,5 | 8,0 |
| Simplicidade de manter | 8,0 | 5,5 | 7,0 |
| Prontidão operacional | 6,0 | 5,5 | 8,0 |
| **Média** | **7,4** | **7,2** | **8,2** |

Contas: hoje 44,5 ÷ 6 = 7,4; tudo de uma vez 43,0 ÷ 6 = 7,2; em fases 49,0 ÷ 6 = 8,2.
Por que "tudo de uma vez" cai: muita migração de banco ao mesmo tempo, mais perfis e mais telas para manter, sem ensaio. A nota "hoje" é 7,4 e não os 7,6 da avaliação anterior porque agora conta a falha do aluno vencido logado.

## 5. Conflitos e duplicidades
1. Rótulo "R1" ainda em mensagens do servidor (`apqr.js`, `guidance.js`, `stats.js`) enquanto a tela passa a Q/R. Função única nos dois lados.
2. "Monitor" atual (vê alunos atribuídos) × novo Monitor (só editais e arquivos). A migração mantém quem existe e cria o novo perfil separado.
3. Pausa × alertas: aluno pausado sai dos alertas de atenção.
4. Meta de horas × Pacto de Estudo: são a mesma coisa; vale o Pacto.
5. Edição de CPF/e-mail × índices únicos: validar dígito e duplicidade antes de gravar; trocar e-mail encerra sessões.
6. Coordenadora vê CPF, mas não vê faturamento.
7. Limite de 300 caracteres do tópico × itens longos de edital (ver §3).

## 6. Riscos por especialidade
- **LGPD:** foto só pelo aluno e uso interno; consentimento do diagnóstico e aceite do termo registrados; divulgação só com permissão por WhatsApp guardada por você. Não substitui revisão jurídica.
- **Segurança:** bloqueio do vencido no servidor, teste de rota direta; permissão por tela para Coordenadora; senha nunca compartilhada; link de grupo de WhatsApp com aprovação de entrada ligada.
- **Pagamentos:** só com conta ativa e ambiente de teste.
- **IA:** desligada; antes, teto mensal de custo e regra de credibilidade.
- **Infraestrutura:** KVM 2; backup e ensaio de migração em cópia; importador no navegador.
- **Funcional:** se ninguém conferir a prévia do importador, tópico errado entra no método do aluno. A confirmação é obrigatória.

## 7. Plano em fases

| Fase | Conteúdo | Banco |
|---|---|---|
| v2.3.2 | Q/R, calendário mensal, botão WhatsApp, edição de cadastro com confirmação | 1 coluna (nascimento) |
| v2.4.0 | Acessos, vencido logado, tela de encerrado, pausa, perfis, termo e aceite | tabelas de acessos, aceites, papéis |
| v2.4.1 | Importador de editais (colar) + trava de nome repetido | índice único de nome |
| Fase 1B | Aba Questões, materiais por turma, grupos de WhatsApp, diagnóstico, jornada | tabelas e colunas novas |
| Fase 1C | Plano de ação, relatório, Fila da Coordenação, bônus | tabelas |
| Depois | Foto, Pacto, Pagar.me, e-mail ligado, leitura de PDF | conforme item |

Cada versão: testes automáticos verdes, `release:check`, backup antes, ensaio em cópia.

## 8. Decisões que ainda dependem do Lucas
1. Repositório no GitHub: confirmar; senão, envio manual.
2. E-mails de Administrador, Coordenadora e demais (na hora de executar).
3. Mandar o segundo edital de exemplo (de outra banca) para testar o leitor.
4. Confirmar se a plataforma "Faço Questão de Farmácia" é da casa (para o selo).
5. Termo: eu redijo o texto-base; revisão jurídica recomendada.

## 9. O que conferi e o que não consegui verificar
- **Conferi:** contas das notas; teste do importador contra a contagem manual; limite de 300 caracteres no código (`createTopics`); que aluno não tem rota de criar edital (`routes/me.js` e `enrollments.js`).
- **Não consegui verificar:** funcionamento em editais de outras bancas; custo e limites atuais de provedores de e-mail; texto jurídico do termo; comportamento do banco real (só testei com a base local).
