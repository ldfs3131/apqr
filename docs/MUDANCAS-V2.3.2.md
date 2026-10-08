# Versão 2.3.2: ajustes de experiência (07/10/2026)

Origem: `AUDITORIA-EXPERIENCIA-E-PRODUTO.md`. Nenhuma regra do método foi alterada. Sem mudança de banco.

## Aluno
- **Hoje:** título repetido removido; "O que fazer agora" com uma recomendação e o aviso de matéria parada dentro do mesmo cartão, só quando é de outra matéria, com link para os conteúdos dela; um só percentual (o "ponderado" só aparece se for diferente); insights sem repetição (servidor, `dedupeInsights`); cartões alinhados ao topo; eixo de horas em números redondos; no celular, a parte de detalhes começa recolhida ("Ver mais detalhes"). Página no celular caiu de cerca de 3.200 px para cerca de 2.000 px.
- **Meu edital:** matérias sem atividade começam recolhidas (aluno que ainda não começou vê tudo aberto); colunas de revisão só até a usada; "Aguardando início" e traços sem dados ficam em branco ou discretos; busca e filtros abrem tudo; link `?subject=` abre filtrado.
- **Registrar:** histórico agrupado por semana (segunda a domingo), 2 semanas à vista e "Mostrar semanas anteriores".
- **Evolução:** três abas (Resumo, Horas e questões, Edital); texto do equilíbrio em linguagem simples.

## Professora
- **Raio-X:** botão WhatsApp (abre a conversa com texto pronto; nunca envia; desabilitado se o telefone for inválido) e botão "Anotação rápida".
- **Alunos:** coluna com "vence em X dias" (amarelo até 30 dias, vermelho até 7) e ordenação (nome, vence primeiro, parados primeiro).
- **Central:** faixa de 6 números sem cartão órfão (6, 3 ou 2 colunas); cartões alinhados ao topo.

## Técnico
- Pacote do site dividido por área: arquivo principal de 1.018 KB para 735 KB (gzip 212 KB); telas da professora e da plataforma carregam sob demanda.
- Teste de carga com 800 alunos (ver auditoria, M1). Script de carga corrigido (`enrollment_id` por edital).
- Testes: 126 do servidor e 36 do navegador, verdes; `release:check` ok.

## Não incluído (aguarda decisão ou próxima versão)
Barra de progresso neutra (decisão da Pollyana); menu agrupado e Hoje com Pacto (junto do desenho aprovado no Open Design); lista única de alunos com filtros salvos; "último contato" no Raio-X (precisa da Fila da Coordenação); rótulo Q/R-1.
