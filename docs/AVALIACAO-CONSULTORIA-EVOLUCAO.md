# Avaliação do escopo "Consultoria Individual + Evolução da Plataforma" (07/10/2026)

Base: código da v2.3.1 lido em 07/10. Nada foi construído.
O comitê é simulado por mim (5 especialistas funcionais e 5 técnicos). As notas de 0 a 10 são opinião do modelo, sem distribuição forçada e sem pesquisa de mercado. Elas ordenam prioridades; não são medida.

## 0. Escopo registrado
O escopo inteiro entrou no `docs/BACKLOG-V2.2.md` como **CONGELADO** (seção "Congelado: Consultoria Individual + Evolução da Plataforma"). Nada é programado sem a liberação de cada fase.

## 1. Comitê

**Funcional / prática**
1. Mentora sênior de concursos (aderência ao método e à rotina do aluno).
2. Gestora de sucesso do cliente e retenção (coordenação, renovação, atendimento).
3. Designer de produto e UX (jornada, carga cognitiva, celular).
4. Especialista em vendas e operação comercial de infoprodutos (preço, checkout, bônus).
5. Especialista em LGPD e direito do consumidor (termo, consentimento, reembolso).

**Técnica**
6. Arquiteto de back-end e banco (modelo de dados, migrações, RLS).
7. Engenheiro de segurança de aplicações (perfis, sessões, auditoria).
8. Engenheiro de pagamentos e integrações (Pagar.me, Google, e-mail).
9. Engenheiro de infraestrutura e confiabilidade (VPS, rotinas, backup, custo).
10. Engenheiro de dados e IA aplicada (insights, validação de saída da IA, custo).

## 2. O que já existe no código (base de comparação)

- **Perfis:** `platform_admin`, `teacher`, `mentor`, `student` (restrição no banco). O monitor (`mentor`) vê **só os alunos atribuídos**. Não existe Coordenador nem Administrador do ambiente.
- **Acesso:** uma só validade (`access_until`) e uma situação (`plan_status` ativo/encerrado) por aluno. O login **bloqueia** quem venceu (403). Quem já está logado continua entrando (falha conhecida).
- **Financeiro:** produtos, vendas, eventos e webhook genérico por URL com token. Sem assinatura de gateway, sem Pagar.me, sem recorrência.
- **IA:** provedor Anthropic (Haiku 4.5), OpenAI ou simulado, com `validate.js` e `facts.js` (a IA recebe fatos calculados e uma validação confere os números). Sem limite mensal de custo.
- **E-mail:** só texto, desligado por padrão (`SMTP_URL`). Não existe rotina agendada de nenhum tipo.
- **Estudo:** cronômetro com estado no servidor, registro manual, `daily_activity`, sequência de dias (`streak`), Rotina (blocos de disponibilidade), Agenda da professora, auditoria, relatórios, Raio-X.
- **Não existe:** diagnóstico, plano de ação, relatório de 30 dias, bônus, Pacto, Chama/Escudo, Ajuste de Rota, tarefas da equipe, Centro de Comando, Google Agenda/Meet, termo em 11 blocos.

## 3. Item a item: existe / viável / esforço / dependências, com notas

Esforço: P pequeno, M médio, G grande. Notas: F = média dos 5 funcionais, T = média dos 5 técnicos, Final = média simples (50/50). Veredito: **Fazer**, **Ajustar** (fazer mudando algo), **Reduzir** (versão mínima), **Adiar**.

| # | Item | Existe hoje | Esforço | F | T | Final | Veredito | Dependências e observações |
|---|---|---|---|---|---|---|---|---|
| 1 | Termo e consentimento em 11 blocos | Termo simples `2026-09-v1` | M | 9,5 | 8,0 | **8,8** | **Ajustar, fazer primeiro** | Ver §5. Precisa de advogado. Aceite pré-conta no checkout |
| 2 | Modelo "uma conta, vários acessos" | Só `access_until` | G | 9,0 | 7,0 | **8,0** | **Fazer** | Tabela de acessos; absorve planos, pausa e cancelamento da v2.4.0; corrigir sessão vencida |
| 3 | Tela "Seu período de acesso encerrou" | Login bloqueia | M | 9,0 | 8,0 | **8,5** | **Fazer (urgente)** | Mudança de comportamento do login; o bloqueio tem que ser **no servidor**, não só na tela |
| 4 | Catálogo e preços (editáveis só pelo Administrador) | Tabela `products` | P | 8,5 | 8,5 | **8,5** | **Fazer** | Ligar ao novo modelo de acessos |
| 5 | Perfis (5) e permissões | 4 perfis; monitor só vê atribuídos | G | 8,0 | 7,0 | **7,5** | **Ajustar** | Ver §5: papel de dono do ambiente, coordenador, permissão por campo (financeiro) |
| 6 | Pagar.me (Pix, cartão, webhook, recorrência, link de pagamento) | Webhook genérico | G | 9,0 | 6,5 | **7,8** | **Ajustar** | Checkout/link hospedado (sem cartão no nosso servidor), assinatura do webhook, idempotência, conciliação. Credenciais ainda não existem |
| 7 | Agenda Google + reserva de 30 min + Meet | Agenda própria da professora | G | 8,0 | 5,5 | **6,8** | **Ajustar, depois do MVP** | OAuth do Google (ver §5), lista de espera, bloqueio de horário |
| 8 | Diagnóstico nativo (1 pergunta por tela, upload) | Não | M | 8,5 | 7,5 | **8,0** | **Fazer** | Maior risco de LGPD (dado sensível e IA). Uploads exigem limite e varredura de tipo |
| 9 | Remarcação (24 h, máx. 2) e lembretes | Não | M | 7,5 | 7,0 | **7,3** | **Fazer simples** | E-mail transacional e rotina agendada (não existem) |
| 10 | Plano de ação (editor, marcar feito, PDF) | `pdf-lib` já usado | M | 9,0 | 7,5 | **8,3** | **Fazer** | Núcleo do produto; alimenta o bônus |
| 11 | Relatório de 30 dias (IA + aprovação da professora) | Relatório IA do aluno existe | M | 8,5 | 7,0 | **7,8** | **Fazer** | Fila de aprovação; publicação com aviso |
| 12 | Bônus de Execução (medalhas e descontos) | Não | M | 6,5 | 6,5 | **6,5** | **Reduzir** | Ver §5: risco de fraude e de margem; começar manual e validar réguas |
| 13 | Vitrine consultoria.pollylyra.com.br + mini-diagnóstico + checkout | Não (fora do APQR) | G | 8,5 | 7,0 | **7,8** | **Fazer, separado do APQR** | Site estático com formulário; depende de 6 e 7 |
| 14 | Pacto de Estudo semanal | Rotina + `streak` | M | 8,5 | 8,0 | **8,3** | **Fazer** | Absorve "Meta da semana" |
| 15 | Chama, Escudos, Mês colorido | `streak` diário | M | 7,5 | 8,0 | **7,8** | **Ajustar** | Contar por semana; seguir o layout aprovado; cuidado com ansiedade |
| 16 | Modo Foco | Cronômetro já existe | P | 7,0 | 8,5 | **7,8** | **Fazer (P)** | Só marcar o tempo manual |
| 17 | Lembretes inteligentes e meta adaptativa | Não | M | 7,5 | 6,5 | **7,0** | **Ajustar** | Só e-mail e aviso no app; depende de rotina agendada e e-mail |
| 18 | Ajuste de Rota quinzenal (8 blocos + IA) | Parcial (relatório IA) | G | 8,5 | 6,5 | **7,5** | **Ajustar** | Catálogo fechado de ajustes; depende do Caderno de Erros (congelado) |
| 19 | Central da Equipe (tarefas) | Não | G | 6,5 | 7,0 | **6,8** | **Reduzir** | Equipe de poucas pessoas; versão mínima ou ferramenta pronta |
| 20 | Painéis de Desempenho por papel | Central e Raio-X existem | G | 7,0 | 6,0 | **6,5** | **Ajustar, em partes** | Começar pela fila de risco do Coordenador |
| 21 | Centro de Comando | Painel financeiro básico | G | 7,5 | 6,5 | **7,0** | **Fazer depois dos dados** | Precisa de meses de dados para ter sentido |
| 22 | Diretor de Crescimento (IA) e "Pergunte ao seu negócio" | Não | G | 6,5 | 5,0 | **5,8** | **Adiar** | Ver §5: perguntas livres sobre dados são arriscadas |
| 23 | Simulador "E se?" | Não | M | 5,5 | 7,0 | **6,3** | **Adiar** | Uma planilha resolve |
| 24 | Motor de insights noturno | Não existe rotina agendada | M | 7,5 | 6,0 | **6,8** | **Fazer enxuto** | Volume mínimo de dados antes de exibir; limite de custo da IA |

**Leitura rápida:** os itens 1 a 4, 10, 14 e 15 são os de maior valor e menor risco. Os itens 19, 22 e 23 são os que menos justificam o esforço agora.

## 4. Nota geral do aplicativo, antes e depois

Seis dimensões, em opinião do comitê:

| Dimensão | Antes (v2.3.1) | Depois, tudo como escrito | Depois, plano recomendado |
|---|---|---|---|
| Valor para o aluno | 7,5 | 8,8 | 8,5 |
| Valor para a equipe e o negócio | 6,0 | 8,6 | 8,0 |
| Aderência ao método APQR | 9,0 | 8,4 | 9,0 |
| Segurança e LGPD | 7,5 | 7,0 | 8,2 |
| Simplicidade e facilidade de manter | 8,5 | 5,5 | 7,0 |
| Prontidão operacional (VPS, rotinas, custo) | 7,0 | 5,0 | 7,0 |
| **Média** | **7,6** | **7,2** | **8,0** |

**Leitura:** fazer tudo do jeito escrito e de uma vez **piora** o aplicativo no conjunto, porque ganha muito valor e perde simplicidade, segurança e prontidão. Fazer em ordem, reduzindo o que está marcado, **melhora**. O motivo da queda em aderência ao método no "tudo como escrito" é a IA gerando ajustes sem catálogo fechado (ver §5).

## 5. O que o comitê apontou, por especialidade

### LGPD e consumidor
- **Dado sensível.** O bloco 3 do termo inclui "informações emocionais e de bem-estar". A lei trata esse tipo de dado como sensível, e ele exige consentimento específico e destacado. **Aceite único obrigatório para usar o app não vale para esse bloco.** Proposta: o diagnóstico tem seu próprio aceite, na hora de preenchê-lo, separado do aceite de uso do app. Quem recusar não perde o app.
- **Ofertas da marca (bloco 7).** Marketing por e-mail e WhatsApp não pode ser condição de uso. Caixa separada, desmarcada por padrão.
- **IA e dado sensível.** O texto do prompt diz que a IA recebe "dados agregados", mas a **pré-análise do diagnóstico** manda respostas livres (rotina, família, bem-estar) para o modelo. Isso é dado sensível indo para um fornecedor nos EUA. Precisa constar no termo (transferência internacional), minimizar (sem nome, CPF, e-mail) e aparecer como aviso na tela.
- **Reembolso.** A política "7 dias, se a sessão ainda não aconteceu" é **mais restritiva** que o direito de arrependimento do Código de Defesa do Consumidor para compra a distância. Pode ser contestada. Peça ao advogado antes de publicar.
- **Aceite no checkout.** Quando o aluno compra, a conta ainda não existe. O aceite precisa ser guardado com e-mail, versão do termo, data, hora e IP, e ligado à conta quando ela for criada.
- **Retenção.** O termo precisa de prazo de guarda e exclusão por tipo de dado (diagnóstico, relatório, foto, financeiro).

### Segurança e perfis
- **Administrador não é a conta ONE UP.** Hoje `platform_admin` é global e age "dentro" do ambiente. Para o Administrador/dono do ambiente (Centro de Comando, preços, financeiro completo), proponho um papel de **dono do ambiente** separado, para a ONE UP não acessar dados de alunos por padrão.
- **Coordenador vê pagamento mas não vê faturamento.** Exige permissão por campo e por tela, não só por papel.
- **Monitor.** O prompt diz que ele vê "progresso de estudo dos alunos". Hoje ele vê só os atribuídos. Definir: todos os alunos (só horas, questões, cores) ou só os atribuídos.
- **Desconto personalizado só com aprovação do Administrador:** fluxo de pedido e aprovação, com registro.
- **Acesso vencido:** o servidor tem que recusar tudo o que não seja "ver aviso, renovar e baixar meus dados". Esconder a tela não basta.
- **Auditoria:** gravar valor anterior e novo (hoje só grava o novo).

### Pagamentos e integrações
- **Pagar.me:** usar link de pagamento ou checkout hospedado, para o cartão nunca passar pelo nosso servidor. Validar a assinatura de cada webhook, ignorar repetições (idempotência) e conciliar com a lista de vendas. O webhook atual é só um token na URL; serve de base, não basta para dinheiro.
- **Estorno e chargeback:** encerram o acesso, já existe no webhook genérico.
- **Nota fiscal:** não aparece no escopo. Alguém precisa emitir (ONE UP, em CNPJ). Combine com o contador antes de vender em volume.
- **Google Agenda:** a autorização do Google, enquanto o aplicativo está em "teste", expira em 7 dias. Para uso contínuo, o aplicativo precisa ficar em produção. Para uma única conta autorizando (a da professora), isso é viável com o aviso de "app não verificado". Confirme na hora de montar.
- **Reserva de 30 minutos:** guardar o bloqueio no nosso banco e criar o evento no Google só no pagamento. Evita horário preso.
- **E-mail transacional:** hoje desligado e só texto. Precisa de provedor de envio, domínio autenticado (SPF, DKIM, DMARC) e modelo HTML. Sem isso, lembretes e resumos das 8h não chegam.

### IA e dados
- **"3 ajustes dentro das regras do método".** Pedir à IA "obedeça o método" não garante. Solução: **catálogo fechado** de ajustes permitidos (por exemplo 12 tipos), escolhidos por regras sobre os dados; a IA só **reescreve o texto**. Uma checagem automática rejeita qualquer saída que mencione revisão espaçada, cronograma por data ou número que não esteja nos fatos. A estrutura de validação da IA já existe (`validate.js`) e serve de base.
- **"Pergunte ao seu negócio".** Perguntas livres sobre dados exigem que a IA consulte o banco, e isso é risco de vazamento e de resposta errada. Proponho um **conjunto fechado de métricas** (a mesma ideia do conector MCP somente leitura que já está congelado), com um só canal para os dois usos.
- **Tarefa em linguagem natural.** A IA pode sugerir responsável e prazo, mas o usuário confirma antes de criar.
- **Volume mínimo:** definir números (por exemplo, a partir de 20 alunos e 4 semanas) e esconder o insight abaixo disso.
- **Custo:** limite mensal e por chamada, com contador no painel.

### Funcional e prática
- **Bônus de Execução.** Metas medidas por dados que o próprio aluno lança (questões e tempo manual) podem ser infladas. Proposta: contar só questões com data de registro no mesmo dia, limitar a 150 por dia e **marcar tempo manual** (já previsto). Margem: com Ouro de R$ 200 no semestral e 3 metas atingidas, o desconto é grande em relação ao ticket; simule antes (o Simulador "E se?" não é necessário, uma planilha basta).
- **Estrela-Guia do Coordenador ("alunos salvos").** O botão que abre o WhatsApp só prova que o clique aconteceu, não que a mensagem foi enviada. Peça "marquei como enviada" com um toque; senão o número é ruído.
- **Chama e Escudos.** A regra por semana, com 50% e escudo, evita a ansiedade da sequência diária. Mantenha o texto de incentivo sem culpa e sem comparação com colegas (já previsto).
- **Previsão fora da tela do aluno:** correto. Manter só para a equipe.
- **Central da Equipe.** Com 3 a 4 pessoas, um controle de tarefas completo (ciclo, repasse, conversa, prova de execução, painel do dono) é outro produto. Versão mínima recomendada: tarefa automática por evento, responsável, prazo, "feita", e o resumo das 8h.
- **Coerência com o que já foi decidido.** "Sem WhatsApp" nas regras permanentes passa a valer só para **envio automático**; o botão que abre o WhatsApp com texto pronto é permitido. "Notificações" estava em "fora de vez"; agora só e-mail e aviso no app.

### Infraestrutura (VPS)
- A KVM 1 (1 CPU, 4 GB) já divide espaço com o restaurante, o lava-jato e o site da ONE UP. As cargas novas são: rotina noturna, chamadas à IA (leves, a computação é externa), webhooks (leves), geração de PDF (média), envio de e-mail (leve).
- **Recomendação:** testar a Fase 1 na KVM 1 com o aviso no WhatsApp ligado. **Subir para a KVM 2 antes de começar a Fase 2** (rotinas e lembretes). Gatilhos para subir antes: memória acima de 80% por mais de 15 minutos, carga acima de 1 por mais de 10 minutos em horário de pico, ou qualquer reinício por falta de memória. Eu não consigo medir isso daqui; o comando `apqr status` e o vigia medem no servidor.
- **Rotinas:** uma só tarefa agendada de madrugada, sequencial, com trava para não rodar duas vezes e aviso no WhatsApp se falhar.
- **Backup:** cobre os dados novos automaticamente (tabelas entram na lista do backup); testar restauração antes de ir ao ar com dados reais.

## 6. Conflitos e duplicidades encontrados

1. **Vigência da consultoria.** Decisão de hoje: 30 dias de APQR. Decisão anterior (anotada em 07/10): 3 meses. Vale a de hoje; confirme.
2. **Preços.** O prompt substitui os valores antigos (turma R$ 197/997 e plataforma R$ 127/107/97/67). Valem os do catálogo da seção 4 do seu prompt.
3. **Acesso vencido.** O login hoje bloqueia; o novo comportamento é entrar e ver o aviso. Isso exige trocar a regra de login e reforçar o bloqueio no servidor.
4. **Pausa e cancelamento (v2.4.0)** passam a ser **por acesso**, não por aluno.
5. **Meta da semana (V2.3)** é absorvida pelo **Pacto**. O **check-in semanal** antigo fica separado e sobreposto ao Pacto; manter congelado.
6. **Tela Hoje em 5 blocos:** Chama e Placar entram nela.
7. **Gargalos** viram blocos 3 e 5 do Ajuste de Rota; o **Caderno de Erros** (bloco 5) é pré-requisito e está congelado.
8. **Melhor horário (bloco 6)** precisa do horário de cada sessão de estudo; **verificar se o cronômetro grava a hora de início**.
9. **Agenda duplicada:** sessões de consultoria entram como evento de reunião na Agenda existente (público: aluno), em vez de criar uma segunda agenda.
10. **"Pergunte ao seu negócio"** e o **conector MCP** são o mesmo desejo (consulta por IA, só leitura): um só conjunto de métricas.
11. **Monitor:** vê todos os alunos ou só os atribuídos? (conflito com o código atual).
12. **Termo:** a versão `2026-10-v2` já planejada vira o termo de 11 blocos.
13. **Matrícula e Mural de Aprovados:** sem mudança; o Monitor pode alimentar o Mural.

## 7. O que foi fundido, mudou e ficou de fora

- **Fundido:** Meta da semana → Pacto. Planos/pausa/cancelamento → modelo de acessos. Gargalos → Ajuste de Rota. Contato em 1 toque → fila do Coordenador. Termo v2 → termo de 11 blocos.
- **Mudou:** acesso vencido (entra e vê aviso); notificações (e-mail e link de WhatsApp, sem envio automático); previsão (só equipe); monitor (permissão mais ampla, a definir).
- **Fica de fora, por ora:** Simulador "E se?"; "Pergunte ao seu negócio" com perguntas livres; Central da Equipe completa; avaliar bônus em dinheiro sem validação das réguas.
- **Continua congelado e independente:** Caderno de Erros, Meta de revisão por turma (não fazer), registro offline, perfil de estudo e jornada, MCP, lojas de aplicativos.

## 8. Fase 1 recomendada, dividida em três blocos liberáveis

**Antes de tudo (processo, não código):** vender a consultoria já com processo manual para testar a demanda, enquanto se constrói: link de pagamento do Pagar.me (se a conta estiver ativa), horário combinado pelo WhatsApp ou Google Agenda, diagnóstico no formulário atual, plano feito num documento. Se a demanda não aparecer, nada do que vem a seguir foi desperdiçado.

**Bloco 1A — Base de acessos e receita (esforço G).** Itens 1 (termo), 2, 3, 4, 5 (papéis básicos: dono do ambiente e coordenador), 6 (Pagar.me).
- Banco: tabela `accesses` (aluno, tipo, produto, início, fim, situação, venda de origem); papéis novos na restrição de `users.role`; tabela de aceites com versão; permissões por campo; auditoria com valor anterior; migração dos alunos atuais (cada `access_until` vira um acesso).
- Entrega testável: compra confirma, cria conta ou soma acesso, manda link para criar senha, aluno vencido vê "período encerrado", Coordenadora gera link de pagamento.

**Bloco 1B — Jornada da consultoria (esforço G).** Itens 7 (Agenda Google), 8, 9, 13.
- Banco: sessões de consultoria, diagnósticos (respostas com aceite próprio), reservas temporárias, lista de espera.
- Entrega testável: aluno escolhe horário, paga, preenche o diagnóstico, remarca, recebe lembretes.

**Bloco 1C — Plano, relatório, bônus (esforço M a G).** Itens 10, 11, 12 (versão reduzida), tela do bônus.
- Banco: planos de ação e ações, relatórios de 30 dias com estado de aprovação, bônus e metas.
- Entrega testável: sessão feita, plano publicado e exportado em PDF, relatório aprovado, bônus aplicado no checkout.

**Fase 2 (Engajar):** itens 14, 15, 16, 17, 18, depois de subir para a KVM 2, do Caderno de Erros e do e-mail transacional.
**Fase 3 (Escalar):** itens 19 (mínimo), 20, 21, 24; adiar 22 e 23.

## 9. Decisões que preciso de você

1. Vigência da consultoria: 30 dias ou 3 meses?
2. Monitor: vê todos os alunos (só estudo) ou só os atribuídos?
3. Administrador do ambiente: concorda com um papel de "dono do ambiente" separado da conta ONE UP?
4. Aceite do diagnóstico separado do aceite de uso do app (recomendado), ou um aceite único? (O aceite único é o mais frágil juridicamente.)
5. Reembolso: posso sugerir ao advogado alinhar com o direito de arrependimento do consumidor?
6. Bônus: começar manual e só automatizar depois de validar as réguas com a professora?
7. Vender a consultoria já em processo manual enquanto o sistema é construído?
8. Provedor de e-mail transacional: você já tem algum, ou escolho um?
9. Nota fiscal: quem emite e quando?
10. Conta do Pagar.me: já está ativa?

## 10. Revisão final (conferência antes de entregar)

- Conferi cada item do seu prompt contra o código lido; os itens 1 a 24 cobrem as seções 2 a 13.
- Conferi as contas de média (F, T e Final) uma a uma; conferi que a média das seis dimensões fecha em 7,6, 7,2 e 8,0.
- Contradições internas do prompt apontadas: acesso vencido (login), monitor, vigência, "dados agregados" × pré-análise do diagnóstico, aceite obrigatório × consentimento do dado sensível, "sem WhatsApp" × botão do WhatsApp.
- Limites desta avaliação: o comitê é simulado; não medi a VPS; não li as credenciais nem o painel do Pagar.me; a leitura jurídica é de apoio e precisa de advogado; os custos de IA e de e-mail não foram orçados.
