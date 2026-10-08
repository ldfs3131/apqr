# Auditoria antes de construir (07/10/2026)

Base: código da v2.3.1 e decisões de `ESCOPO-CONSULTORIA-DECIDIDO.md`. Nada foi construído.
Equipe de auditoria simulada: segurança, dados e LGPD, qualidade e testes, operação e infraestrutura, produto e consistência. Gravidade: **Alta** (resolver antes de vender ou de usar com dados reais), **Média** (resolver na própria fase), **Baixa** (anotar).

## 1. Decisões novas registradas
- **Google Agenda/Meet integrado: removido.** A Marcela marca e cria o evento no Google dela.
- Acesso vencido: método aprovado (entra e vê o aviso). Pausa só em acessos longos: aprovado.
- Professora e Administrador: **dois logins** para o mesmo perfil. Caixa de consentimento no diagnóstico: aprovada.
- KVM 2: será assinada.

## 2. Achados

### Alta
1. **Aluno vencido continua entrando.** O login bloqueia, mas quem já está logado segue usando (`loadUser` não confere a validade). Corrigir na Fase 1A, no servidor.
2. **E-mail é único na plataforma inteira.** O mesmo e-mail não pode ter duas contas. O login de Lucas como Administrador do ambiente precisa de um e-mail **diferente** do login ONE UP (um alias do mesmo Gmail serve, por exemplo `lucas+apqr@gmail.com`). Hoje só existe convite para monitor (`createMentor`); criar o segundo professor passa pelo console ONE UP (`teacher_invite`) ou por função nova.
3. **Mudança de banco em produção.** Cada migração (acessos, aceites, nascimento, papéis) exige backup antes, ensaio numa cópia restaurada e plano de volta. O backup e o restaurar existem, e há teste que impede esquecer tabela nova no backup.
4. **Como as versões chegam ao servidor.** O repositório do GitHub ainda não foi criado e autorizado. Sem ele, cada versão vai por envio manual de arquivo e instalação. Precisa decidir antes da primeira versão.

### Média
5. **Rótulo R-Q em mais de um lugar.** Além das telas, "R1" aparece em mensagens do servidor (`apqr.js`, `guidance.js`, `stats.js`) e em relatórios. Criar **uma função única** de rótulo (servidor e site), senão fica "R-Q1" na tela e "R1" na mensagem.
6. **Monitor novo ≠ monitor atual.** Hoje o monitor vê os alunos atribuídos. O novo só cadastra editais e sobe arquivos, sem dados de alunos. Se já existe monitor com alunos atribuídos, ele perde esse acesso. Confirmar.
7. **Coordenadora exige revisão de permissões.** Rotas de professora e monitor compartilham o mesmo bloco (`requireRole('teacher','mentor')`). O papel novo pede permissão por tela e por campo (financeiro: vê pagamento, não vê faturamento). O financeiro hoje já é só da professora, o que ajuda.
8. **Telefone.** Fica guardado com 10 ou 11 dígitos, sem o 55. O botão de WhatsApp monta o número com 55 na frente; telefone vazio ou inválido deixa o botão desabilitado com aviso.
9. **Data de nascimento não existe no cadastro.** Entra como campo opcional novo (migração) e é editável pelo admin.
10. **Acesso vencido no site.** O site hoje não trata o código `access_expired`. A tela nova de "período encerrado" e o bloqueio do servidor precisam ser construídos juntos.
11. **Termo no Drive.** O link pode quebrar (arquivo movido, permissão trocada). Guardar também **uma cópia do PDF dentro do sistema**, ligada à versão aceita. Essa cópia é a prova do que o aluno aceitou.
12. **Arquivos enviados pelo aluno (diagnóstico).** Aceitar só PDF, PNG e JPG, até 10 MB, com nome gerado pelo sistema e sem abrir nada no servidor. A tabela de arquivos hoje só aceita "content" e "logo": migração.
13. **IA sem chave e sem teto de custo.** Só ligar a IA depois de implantar o limite mensal; até lá fica no modo simulado.
14. **Pagar.me.** A conta ainda não está ativa. Construir o adaptador só com credenciais e ambiente de teste. A Fase 1A sai sem ele, usando o webhook genérico atual.
15. **Mini-diagnóstico da vitrine** coleta dados de quem ainda nem comprou: também precisa de caixa de consentimento.
16. **Ex-alunos importados (cerca de 785).** Ao ligar o novo modelo de acessos, cada validade atual vira um acesso. Quem tiver plano encerrado e conta ativa passa a ver a tela "período encerrado" em vez de ser barrado. É bom para recuperar venda, mas muda o comportamento atual. Configurar antes os links de renovação (consultoria, turma, plataforma).
17. **Bônus automático depende do plano de ação** (meta de 70% das ações). Por isso o bônus fica por último na Fase 1.

### Baixa
18. **"Melhor horário" só existe para o tempo de cronômetro.** O registro de questões guarda só a data, não a hora. Então o sistema não consegue dizer "você acerta mais à noite". Só consegue dizer **quando você mais estuda**. (Explicação abaixo.)
19. **Turma digitada à mão ("Consultoria").** Erro de digitação cria turmas diferentes. Usar lista de escolha até existir o tipo de acesso.
20. **Semana do Pacto.** Definir: de segunda a domingo, 23h59, no fuso do aluno. Já existe cálculo de dia por fuso.

## 3. O que não fazer
- Compartilhar uma senha entre Pollyana e Lucas.
- Editar o PDF do termo no mesmo arquivo depois de publicado (criar versão nova).
- Contar tempo lançado à mão no "melhor horário" e no bônus.
- Ligar a IA sem teto de custo e sem regra de credibilidade.
- Construir Pagar.me antes da conta ativa.
- Mexer no acesso vencido e no login sem teste de segurança (aluno vencido tentando abrir rotas de estudo direto).

## 4. Dúvidas que bloqueiam
1. O repositório no GitHub (`ldfs3131/apqr`): criado? Se não, sigo com envio manual?
2. Existe algum monitor com alunos atribuídos hoje?
3. Qual e-mail o Lucas usa no login de Administrador do ambiente (diferente do login ONE UP)?
4. Marcela já tem e-mail definido para o login de Coordenadora?
5. Posso redigir o termo (primeira versão) para você revisar e subir no Drive?

## 5. Ordem e testes
1. **v2.3.2** (sem mudança grave de banco): R-Q, calendário mensal, botão de WhatsApp, edição de cadastro (com nascimento e auditoria com valor anterior). Testes: unidade, e2e e conferência da versão compilada (`release:check`).
2. **v2.4.0 / Fase 1A:** acessos com validade, tela de período encerrado, correção do vencido logado, perfis, aceite do termo. Ensaio de migração na cópia do backup.
3. Fase 1B: diagnóstico com caixa de consentimento, quadro da jornada. Fase 1C: plano de ação, relatório, bônus. Pagar.me quando ativar.
Cada versão: testes automáticos verdes, ensaio em ambiente de cópia, backup antes de publicar.
