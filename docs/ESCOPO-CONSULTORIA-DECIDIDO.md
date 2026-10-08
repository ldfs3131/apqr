# Escopo da Consultoria e da Evolução — versão decidida (07/10/2026, tarde)

Este documento **substitui** o §8 (fases) e as recomendações do `AVALIACAO-CONSULTORIA-EVOLUCAO.md` onde houver diferença. Continua CONGELADO: nada é construído sem a liberação de cada fase.

## 1. Decisões do Lucas

1. Consultoria: **30 dias** de plataforma, contados **depois do encontro** (não 3 meses).
2. Preços do catálogo da seção 4 do prompt **substituem** todos os anteriores.
3. Perfis: **Professora e Administrador unificados** (mesmo perfil, tudo liberado, inclusive Centro de Comando). **Monitor** só cadastra editais e sobe conteúdos e arquivos; não vê dados de alunos.
4. **Agenda da consultoria é manual:** a Marcela marca com o aluno; nada de Google Agenda/Meet integrado nem horário na agenda do aluno por ora.
5. **Pacto de Estudo** substitui a Meta da semana.
6. Bônus de Execução (só para quem veio da consultoria): **medição automática**, aplicação do valor **manual**.
7. **Central da Equipe** sai do APQR (usa o Clint); entra uma fila leve (§5).
8. **Termo** hospedado em link do Google Drive; o app registra o aceite.
9. **WhatsApp:** só botão que abre a conversa com texto pronto; o sistema nunca envia sozinho.
10. **MCP** e "Pergunte ao seu negócio": congelados.
11. **KVM 2:** pode assinar. **Pagar.me:** ativação solicitada. **Nota fiscal:** com o Lucas. **Reembolso:** sem texto no app. **Construir antes de vender.**

## 2. Perfis finais (4)

| Perfil | Acesso |
|---|---|
| Aluno | Própria área, Pacto, Mês colorido, Ajuste de Rota, aba Consultoria (se tiver acesso), relatórios, bônus |
| Monitor | Cadastrar e organizar editais (matérias, tópicos, data da prova) e subir conteúdos e arquivos. **Sem** dados de alunos, financeiro ou configurações |
| Coordenadora (Marcela) | Todos os alunos, fichas, diagnósticos, relatórios, alertas, Fila da Coordenação, links de pagamento do catálogo no preço de tabela. **Sem** faturamento, receita e relatórios financeiros |
| Professora / Administrador | Tudo: aprovações, financeiro completo, preços, configurações, integrações, Centro de Comando |

- **Mesmo perfil, logins separados.** Pollyana e Lucas têm o mesmo poder, cada um com seu e-mail e senha. Senha compartilhada impede saber quem fez o quê (você pediu auditoria) e o bloqueio por tentativas erradas trava os dois.
- A conta ONE UP (plataforma) continua à parte, só para suporte.

## 3. Acessos

- Uma conta, vários acessos (Turma, Consultoria, Só Plataforma), cada um com sua validade. A plataforma abre com qualquer acesso válido.
- **Consultoria:** acesso de 30 dias que começa quando a Marcela marca "encontro realizado".
- **Pausa e cancelamento por acesso.** Pausa só para acessos longos (Turma e Plataforma trimestral, semestral e anual). Consultoria de 30 dias não pausa. Cancelamento com motivo em qualquer acesso.
- **Acesso vencido (método recomendado):** o aluno **entra** e vê "Seu período de acesso encerrou", com um resumo do que conquistou (horas, questões, edital), o botão de renovar e o bônus (se tiver). Não registra estudo nem abre materiais e cursos. Os dados ficam guardados. O servidor só permite ver o aviso, renovar e baixar os próprios dados. Não precisa de rotina noturna, o vencimento é calculado pela data.
- Plano pausado usa a mesma tela, com "Plano pausado".

## 4. Consultoria: como funciona a versão manual

Hoje (v2.3.1) já dá para operar sem código novo:
1. Aluno paga no Pagar.me (link ou checkout); o aviso chega por e-mail e no painel do Pagar.me. Confirme nas configurações da conta que a notificação de venda aprovada está ligada.
2. A Marcela cadastra o aluno, manda o convite e registra o edital-alvo. Usa o campo **turma = "Consultoria"** e a **validade** (data do encontro + 30 dias).
3. Marcela combina o horário por WhatsApp e cria o evento no Google Agenda dela (o Google gera o Meet).
4. Diagnóstico, plano de ação e relatório ficam fora do sistema até serem construídos.

Falta no sistema atual: selo de tipo de aluno, tela de acesso encerrado, diagnóstico nativo, plano de ação, relatório de 30 dias e bônus.

**Quadro da jornada (construir):** cada consultoria tem status (pago → diagnóstico → agendado → realizado → plano → relatório → continuou?), data e link da sessão preenchidos pela Marcela, e vencimento do relatório (dia 30). Sem integração com o Google.

## 5. Fila da Coordenação (substitui a Central da Equipe)

Uma tela só, com listas calculadas a partir dos dados. Cada linha traz o motivo, o botão de WhatsApp com texto pronto e "marquei como feito" (com quem e quando).
- Consultorias pagas aguardando agendamento.
- Diagnósticos recebidos e sessões da semana.
- Relatórios de 30 dias a preparar e a aprovar (aparecem para a Professora).
- Planos vencendo em 7 dias e bônus vencendo em 3 dias.
- Alunos com 2 semanas abaixo de 50% sem escudo.

Dados: uma tabela pequena de ações ("feito por, quando, nota"). Sem conversa, sem repasse, sem painel do dono. Tarefas gerais continuam no Clint.

## 6. Regra de credibilidade da IA e dos insights

Um insight só aparece se passar em três níveis:

| Nível | Regra | O que o aluno ou a equipe vê |
|---|---|---|
| Insuficiente | abaixo do mínimo | "Ainda poucos dados: faltam X para esta análise." Sem número, sem texto de IA |
| Inicial | do mínimo até 2 vezes o mínimo | Número com selo "dados iniciais" |
| Confiável | acima de 2 vezes o mínimo | Número e análise normais |

Mínimos propostos (editáveis pelo Administrador):

| Insight | Mínimo |
|---|---|
| % de acerto por matéria e tendência | 30 questões na matéria; tendência só com 2 quinzenas completas |
| Seu melhor horário | 10 sessões de **cronômetro** em pelo menos 5 dias diferentes (tempo manual não entra) |
| Distribuição dos erros | 10 erros classificados |
| Ajuste de Rota do aluno | 3 dias de estudo e 3 horas na quinzena |
| Pauta do encontro (turma) | 8 alunos com dados; tema "mais errado" só com 5 alunos e 100 questões |
| Taxas do negócio (conversão, renovação) | 30 casos no denominador e 4 semanas; abaixo disso, só números absolutos |
| Previsão de receita | 3 meses de histórico |

Regras da IA: recebe só fatos calculados; cada frase indica a base ("com base em 14 sessões em 9 dias"); o texto mostra o nível de confiança; qualquer relatório que chega ao aluno passa pela professora; a validação rejeita saída que cite revisão espaçada, cronograma por data ou número fora dos fatos; o que a IA recebeu fica registrado.

## 7. Bônus de Execução

- **Automático:** medição das 3 metas (constância, questões, plano), medalha (Bronze, Prata, Ouro), valor a que o aluno tem direito, validade de 15 dias e aviso ao aluno e à Fila da Coordenação.
- **Manual:** aplicar o desconto. A Marcela gera o link com o valor mostrado pelo sistema e dá baixa no bônus.
- Proteção contra inflar: contar questões lançadas no mesmo dia, limite de 150 por dia, tempo manual marcado como "manual".
- Valores e réguas editáveis; a professora ainda valida os números.

## 8. Termo e consentimento (simples)

- Termo em PDF no Google Drive, **um arquivo por versão** (por exemplo `Termo 2026-10-v2.pdf`), com acesso "qualquer pessoa com o link pode ver". O endereço fica num campo do admin.
- O app mostra "Li e aceito os Termos" com o link, e **grava versão, data, hora e IP** do aceite. Mudou o termo, o app pede novo aceite.
- **Diagnóstico:** uma caixa antes de começar, "Autorizo o uso destas respostas para a minha análise, inclusive com apoio de inteligência artificial", com o link do termo. Sem a caixa, o aluno não preenche e a análise por IA fica desligada.
- **Divulgação (foto, mural, depoimento):** só com permissão por WhatsApp pedida por você, guardada com print ou áudio. Campo de controle: autorizou (sim/não), data, onde está guardado.
- Isto não substitui revisão jurídica; é o mínimo que o sistema precisa para funcionar com segurança.

## 9. Fases revisadas

**Fase 1A — Acessos e receita (G).** Perfis (Monitor, Coordenadora, Professora/Administrador), acessos com validade, catálogo e preços, tela de acesso encerrado, aceite do termo, Pagar.me (webhook e links, depois da ativação). Banco: tabela de acessos, papéis novos, tabela de aceites, assinatura do webhook.

**Fase 1B — Jornada da consultoria (M).** Quadro da jornada, diagnóstico nativo com caixa de consentimento, vitrine com mini-diagnóstico. **Fora:** Google Agenda/Meet, reserva de 30 minutos, lista de espera, remarcação automática, lembretes de 24 h e 1 h (a Marcela avisa).

**Fase 1C — Plano, relatório, bônus (M a G).** Plano de ação com PDF, relatório de 30 dias com regra de credibilidade e aprovação da professora, bônus (medição automática).

**Fase 2 — Engajar.** Pacto semanal, Chama, Escudos, Mês colorido, Modo Foco (marcar manual), lembretes por e-mail, meta adaptativa, Ajuste de Rota (catálogo fechado de ajustes). Depende do Caderno de Erros em versão simples (Nível 1: no registro da revisão, "seus N erros foram Não sabia / Confundi / Vacilei"), do e-mail transacional e da KVM 2.

**Fase 3 — Escalar.** Fila da Coordenação (pode vir antes, junto da Fase 1), painéis por papel em partes, Centro de Comando (com a Professora/Administrador), Diretor de Crescimento semanal com regra de credibilidade.

**Fora ou congelado:** Central da Equipe completa, Simulador "E se?", "Pergunte ao seu negócio" e MCP, integração Google Agenda/Meet.

## 10. Infraestrutura

- **KVM 2:** assinar antes da Fase 2 (pode ser antes, sem problema). Confirme na Hostinger se o upgrade mantém o IP e se não há reinstalação.
- **E-mail transacional:** recomendo um serviço com **SMTP**, porque o app já aceita SMTP (`SMTP_URL`), sem programar. Opções: Brevo ou Resend (confira os limites gratuitos atuais). Exige criar registros no domínio (SPF e DKIM) para o e-mail não cair no spam. Para o início, o resumo de 8 h e os lembretes são poucos e-mails.
- **Rotina noturna:** uma só, em sequência, com trava e aviso no WhatsApp se falhar.

## 11. Pendências

1. Pagar.me: aguardar a ativação e pegar as chaves do ambiente de teste.
2. E-mail transacional: abrir conta e criar os registros de domínio.
3. Termo: redigir a versão e subir o PDF no Drive.
4. Réguas do bônus: a Professora valida.
5. Nota fiscal: com o Lucas.
