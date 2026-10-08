# Método APQR v3.0.0 — versão única para importar os alunos

## O que entrou (tudo na mesma versão)
**Aluno**
- Registrar → Questões: por tema, só pela matéria ou Simulado (total e acertos). Questão livre nunca é bloqueada pelos 80%.
- Aba Questões com atalho "Faço Questão de Farmácia" (link configurável).
- Foto de perfil (upload do aluno, uso interno).
- Pacto redesenhado (chama e escudo coloridos, "N de 2", cartões por semana) e "Seu mês em cores"; calendário com faixas fixas.
- Ajuste de Rota quinzenal (sem IA, catálogo fechado, até 3 sugestões, liga/desliga em Configurações).
- Aba Consultoria (só quem tem acesso de consultoria): linha do tempo, diagnóstico com consentimento, 3 metas, medalhas Bronze/Prata/Ouro, plano de ação, relatório.
- Tela de período encerrado/pausado redesenhada, com cartão do bônus.
- Avisos na tela Hoje (acesso vencendo em 7 dias, diagnóstico pendente, bônus vencendo, rota pronta) e botões dos 2 grupos de WhatsApp da turma.

**Equipe**
- Fila da Coordenação (substitui a Central da Equipe): ações do dia com texto pronto de WhatsApp e "marquei como feito".
- Turmas: nome + 2 links de WhatsApp (avisos e alunos); materiais por turma; turma do aluno na ficha.
- Ficha do aluno → aba Consultoria: jornada, diagnóstico, plano (publicar), relatório (só a professora aprova e emite o bônus), baixa manual do bônus.
- Ranking da turma: abas Horas estudadas, Questões feitas e % de acerto (mínimo 40 questões).
- Configurações: Ajuste de Rota, link das questões, réguas do bônus e amostra mínima por matéria.
- Pagar.me: adaptador pronto (desligado).

## Para validar antes de usar com alunos reais
1. Valores do bônus (padrão Bronze R$ 25, Prata R$ 75, Ouro R$ 200), metas (3 de 4 semanas, 300 questões, 70% do plano) e validade (15 dias): Pollyana valida em Configurações.
2. Logo do Faço Questão: já incluído em web/public/brand/faco-questao.png.
3. Texto dos Termos: revisão jurídica.
4. Seguem DESLIGADOS: Pagar.me, e-mail transacional e IA. Importador de editais não foi feito; barra de progresso neutra aguarda OK da Pollyana.

## Testes
Servidor 168/168, e2e 36/36, build do web OK. Demonstração (`npm run demo`) inclui turma com links, 3 alunos de consultoria (um sem diagnóstico, um com relatório aprovado e bônus), questões livres e simulado.

---
# v3.0.1 — endurecimento depois da auditoria
**Bônus:** constância só conta cronômetro ou estudo lançado no próprio dia, com pacto mínimo (padrão 5 h/semana); medalha só com 1+ meta (Bronze 1, Prata 2, Ouro 3); aprovação e baixa à prova de clique duplo, um bônus por consultoria, relatório aprovado não gera novo rascunho; plano de ação pertence à jornada (renovação começa limpa); medição no fuso do aluno; validade de 15 dias contando o dia da emissão; ações do plano só contam até o fim da janela, e a professora vê a data de cada marcação.
**Privacidade (LGPD):** exportação do aluno inclui consultoria, diagnóstico, plano, relatórios, bônus, rota, acessos, termos e foto; "Observação interna" nunca vai ao aluno; leitura da ficha de consultoria e edição de relatório entram na auditoria; trocar/remover foto apaga o arquivo; links exigem https.
**Perfis:** coordenadora não vê valores em R$ do bônus (ficha e Fila); equipe só visualiza o Ajuste de Rota (não grava nem aceita pelo aluno); configuração valida tipos.
**Ranking:** quem não tem amostra mínima no % de acerto fica sem posição.
**Rota:** porcentagem e variação só com dados suficientes; quinzena no fuso do aluno; aceitar só na quinzena atual; sugestão de pacto menor usa a mesma régua de 50% do Pacto.
**Operação:** backup restaura com foto; Fila sem uma consulta por aluno; seed de demonstração recusa rodar em produção; aba antiga recarrega após atualização; cache do app renovado; índices novos; passo a passo de upgrade/rollback.
**Telas:** abas não estouram no celular; alvos de toque de 44 px; contrastes corrigidos; textos e datas padronizados; rótulos acessíveis.
Decisões tomadas por mim (mude em Configurações): Bronze exige 1 meta; coordenadora não vê R$; pacto mínimo 5 h.

Testes da v3.0.1: servidor 177/177, e2e 36/36, varredura de telas (e2e/telas.mjs) em instalação vazia e com a demonstração, celular e computador, sem erros.
