# Migração V1 → V2

A V1 guardava tudo num arquivo SQLite (`apqr.db`). A V2 usa PostgreSQL e passa a ter **ambientes** (um por professora). A migração copia os dados da V1 para o ambiente da professora na V2, **sem alterar o arquivo da V1**.

## O que é migrado

| V1 | V2 |
|---|---|
| Administrador principal da V1 | é associado à professora do ambiente (não duplica) |
| Mentores da V1 | monitores do ambiente |
| Editais-modelo da mentoria | editais do ambiente (matérias, conteúdos, Plano Global) |
| Editais criados pelo próprio aluno | viram editais do ambiente, vinculados só àquele aluno |
| Conteúdos que o aluno acrescentou num edital da mentoria | importados como **arquivados** (o histórico fica guardado; a professora decide se restaura) |
| Alunos | alunos do ambiente, **com a mesma senha** (o formato é compatível) |
| Etapa de cada conteúdo, datas, ciclos, bloqueios | progresso por aluno |
| Sessões de estudo, revisões, questões avulsas, atualizações de resumo | mesmos registros, com a data original (cronômetros em andamento não migram: peça para finalizarem antes) |
| Histórico de etapas | linha do tempo (`learning_events`) |
| Regras da V1 (mínimo de questões, % de consolidação) | cada revisão importada guarda os valores da V1 (`min_questions_used`, `threshold_used`) |
| Rotina | rotina |

Depois da migração, alunos sem CPF/endereço (a V1 não pedia) veem uma tela de **cadastro complementar** no primeiro acesso. O histórico deles fica intacto.

## Passo a passo

> Use Node.js 22.13 ou mais novo (o importador lê o SQLite com o módulo nativo do Node).

### 1. Backup

- **Pare a V1** para ninguém registrar nada durante a migração.
- Copie o arquivo `apqr.db` da V1 (no Windows, normalmente em `metodo-apqr\server\data\apqr.db`; na nuvem, `/data/apqr.db`) para um lugar seguro. Exemplo: `apqr-v1-backup-2026-10-01.db`.
- Se a V2 já estiver em produção com PostgreSQL, faça também o backup dele (`pg_dump`, ou o backup automático do provedor).

### 2. Criar o ambiente da professora na V2

No console ONE UP: **Ambientes → Novo ambiente**. Anote o **identificador** (ex.: `pollyana-lyra`). O ambiente precisa estar **sem alunos**.

### 3. Simular (não grava nada)

```
npm run import-v1 -- --sqlite C:\caminho\apqr-v1-backup.db --tenant pollyana-lyra --dry-run
```

O comando executa a migração inteira dentro de uma transação, valida e **desfaz tudo no final**. Confira no relatório:

- `imported`: quantidade de alunos, editais, conteúdos, sessões, revisões etc.;
- `fingerprints`: para cada aluno, compara V1 × V2 (conteúdos por etapa, horas, número de revisões, questões e acertos). Precisa estar tudo **igual**;
- `notes`: o que não teve destino direto (ex.: conteúdos próprios importados como arquivados).

### 4. Migrar de verdade

```
npm run import-v1 -- --sqlite C:\caminho\apqr-v1-backup.db --tenant pollyana-lyra
```

- Tudo roda numa **única transação**. Se a impressão digital de qualquer aluno não bater, **nada é gravado** (rollback automático) e o erro diz qual aluno divergiu.
- A importação fica registrada na auditoria (`import.v1`).

Em produção, rode o comando no servidor com a `DATABASE_URL` do banco da V2 configurada.

### 5. Validar

1. Entre como a professora: a Central deve listar todos os alunos.
2. Abra o **Raio-X** de 2 ou 3 alunos e compare com a V1: consolidados, revisões (R1…R4 com os percentuais), horas.
3. Entre como um aluno de teste (mesma senha da V1): ele deve ver o edital e a tela de cadastro complementar.
4. Na V2, em **Configurações**, confira as regras vigentes. A V2 começa com os padrões (20 questões, acima de 70%); ajuste se na V1 eram outros valores. As revisões antigas mantêm os valores da V1.

### 6. Como voltar (rollback)

A V1 **não é alterada** em nenhum momento. Para voltar:

- **Antes de liberar a V2 para os alunos:** basta religar a V1 com o arquivo original. Na V2, suspenda o ambiente (Console → Ambientes → Suspender) ou restaure o backup do PostgreSQL.
- **Depois de os alunos usarem a V2:** os registros novos existem só na V2. Voltar à V1 significa perder o que foi registrado depois da migração. Por isso, valide bem nos passos 3 e 5 antes de liberar.
- **Repetir a migração:** restaure o backup do PostgreSQL (ou crie outro ambiente vazio) e rode de novo. O importador recusa um ambiente que já tenha alunos, para não duplicar dados.

## Checklist rápido

- [ ] V1 parada e `apqr.db` copiado
- [ ] Backup do PostgreSQL da V2 (se já em produção)
- [ ] Ambiente criado e vazio
- [ ] `--dry-run` com todas as impressões digitais iguais
- [ ] Migração executada (status `ok`)
- [ ] Central, Raio-X e login de aluno conferidos
- [ ] Regras do método conferidas
- [ ] V1 mantida desligada, com o backup guardado

## Base de alunos da plataforma anterior (V2.2)

Separado da migração V1 → V2: traz a **lista de alunos** (ativos e ex-alunos) com turma, fim do plano e último login da plataforma anterior.

1. Faça backup (`npm run backup`).
2. Simule: `npm run import-base -- --arquivo base-alunos-mentoria.csv --tenant <ambiente> --simular` (ou pela tela, que sempre mostra a prévia).
3. Importe de verdade (mesmo comando sem `--simular`, ou "Confirmar importação" na tela).
4. Confira em **Relatórios → Base de alunos**: o total, os planos ativos e o engajamento por turma devem bater com o relatório de origem.
5. Para atualizar depois (nova exportação da plataforma anterior), importe o novo arquivo: quem já existe é atualizado, quem é novo é criado.
6. Para dar acesso a um aluno importado: Alunos → aluno → Cadastro → **Gerar novo convite** e envie o link.
