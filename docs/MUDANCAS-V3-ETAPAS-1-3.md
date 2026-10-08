# Versão 2.9.0 — etapas 1 a 3 da v3.0 (pronta para você testar)

Rodar localmente: `npm run setup` e depois `npm run demo` (cria ambiente de demonstração com alunos, acessos e pactos). Logins: professora@demo.oneup / aluno1@demo.oneup … senha demo12345.

## Etapa 1 — Cadastro
- Rótulo **Q/R-1, Q/R-2…** em todo o sistema (aluno, professora, mensagens do servidor).
- **Editar cadastro** (aluno no Perfil; equipe no Raio-X → Cadastro): caixinha "antes → depois" antes de gravar; a auditoria guarda valor anterior e novo.
- **Data de nascimento** no cadastro. CPF e e-mail só a equipe edita (professora/administrador e coordenadora).
- **Calendário mensal** "Dias de estudo" (Evolução → Tempo).

## Etapa 2 — Acessos, perfis, termos
- **Acessos**: uma conta com várias vigências (Turma, Consultoria, Só plataforma). Consultoria conta 30 dias do "encontro realizado". Pausa: 1 por acesso longo (90 dias ou mais); a extra só a professora libera; retomar soma os dias parados. Cancelar exige motivo.
- **Aluno vencido ou pausado entra** e vê "Seu período de acesso encerrou" (resumo, renovar, baixar dados). O servidor bloqueia todo o resto (corrigido o furo em que o aluno já logado continuava com acesso).
- **Perfis**: Professora/Administrador (cada um com e-mail próprio), Coordenadora (todos os alunos, edita cadastro e acessos, sem financeiro/configurações), Monitor (só editais e materiais, nenhum dado de aluno).
- **Termos** versionados: texto-rascunho já na plataforma (Configurações → Termos), PDF gerado, link do Drive, aceite com versão/data/hora/IP e novo aceite a cada versão. **Peça revisão jurídica antes de usar com alunos.**
- Configurações: link de renovação e WhatsApp da coordenação.

## Etapa 3 — Pacto, Chama e Escudos
- Pacto semanal (horas de 30 em 30 min + dias), trava na quarta 23h59; sem definir repete o da semana anterior.
- Semana vale com 50%+; vermelho <50%, amarelo 50–99%, verde 100%+. Primeira semana parcial e semana pausada não contam nem quebram.
- **Chama** = semanas válidas seguidas. **Escudo**: 1 a cada 4 semanas verdes, **máximo 2 guardados**, 1 uso por mês, automático na semana vencida.
- **Mês colorido** (menu "Pacto") e resumo no topo do "Hoje". Sugestão de pacto menor/maior. Professora vê o pacto no Raio-X (API).

## Decisões minhas (ajustáveis)
- Escudo: contagem de 4 semanas verdes zera numa semana vermelha; semana amarela não zera nem soma.
- Pausa e cancelamento: quem executa é a equipe (o aluno não se pausa sozinho).

## Ainda vem (etapas 4 a 6)
Aba Questões (Faço Questão de Farmácia), materiais por turma, links de WhatsApp por turma, foto de perfil, diagnóstico nativo + plano de ação + relatório 30 dias, Bônus de Execução, Fila da Coordenação, Ajuste de Rota, menu agrupado.

Testes: 152 do servidor + 36 de navegador passando.
