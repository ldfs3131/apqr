# Relatório com IA — ONE UP · Método APQR

## Princípio

**A IA nunca calcula nada.** A plataforma calcula; a IA só escreve o texto.

```
dados brutos → métricas → diagnóstico determinístico → IA (texto) → validação → relatório
```

1. **Dados brutos:** sessões, revisões, questões, materiais e mudanças de etapa do aluno.
2. **Métricas:** as mesmas da Central e do Ranking (`docs/METRICAS.md`).
3. **Diagnóstico:** regras fixas (`indicators.js`).
4. **IA:** recebe uma lista de **variáveis** — `{chave}`, descrição e valor atual (`server/src/domain/ai/facts.js`, `buildVariables`) — e devolve um JSON com resumo, pontos fortes, pontos de atenção, recomendações e mensagem ao aluno. **A IA não escreve números, datas, meses nem nomes de matérias ou conteúdos:** escreve a chave (ex.: `{consolidados} de {conteudos_no_edital}`), e a plataforma troca pelo valor real.
5. **Validação** (`validate.js`, `validateTemplate`):
   - formato e tamanho de cada seção;
   - toda `{chave}` precisa existir (valor nulo não vira variável);
   - depois de retirar as chaves, **não pode sobrar nenhum dígito** (nem "R2", nem "4 semanas", nem datas) **nem nome de mês**. Qualquer número digitado pela IA reprova o texto, mesmo que exista nos dados;
   - bloqueio de comparação com outros alunos, temas de saúde e promessa de aprovação.
6. **Se reprovar ou falhar**, o relatório exibido é o **por regras**, escrito com as mesmas chaves e preenchido pelo mesmo código, e a tela avisa o motivo.

**Limite honesto:** o valor de cada número é sempre o real, mas a frase em volta dele é escrita pela IA. A IA poderia, em tese, usar uma chave com o sentido errado (ex.: chamar de "consolidados" o valor de `{em_revisao}`). Para reduzir esse risco, cada chave tem uma descrição explícita, a tela mostra ao lado os valores usados, e o texto é uma sugestão para a professora revisar, não uma comunicação automática ao aluno.

## Dados sensíveis

Os fatos enviados à IA **não contêm** nome, e-mail, CPF, telefone, endereço, cidade nem identificadores internos. Contêm apenas números do método e nomes de matérias e conteúdos do edital (que entram como variáveis). O texto se refere a "o aluno". Os fatos enviados ficam gravados em `ai_reports` (auditável); o texto do prompt é fixo e versionado no código (`PROMPT_VERSION`).

## Custo e controle

- **Modelo barato por padrão** (Anthropic `claude-haiku-4-5-20251001` ou OpenAI `gpt-4o-mini`), trocável por variável de ambiente.
- **Cache:** mesmos fatos nas últimas 24h → devolve o relatório salvo, sem nova chamada. "Gerar novamente" força uma nova chamada.
- **Limite diário por ambiente** (`AI_DAILY_LIMIT_PER_TENANT`, padrão 100). Excedido → relatório por regras.
- **Contexto enxuto:** só a lista de variáveis (algumas centenas de tokens), resposta limitada a 1.400 tokens.
- **Log** de cada geração (`ai_reports`): provedor, modelo, tokens, custo estimado, duração, status (`ok`, `deterministic`, `rejected`, `error`), resultado da validação. Auditoria `ai.report`.
- **Tempo limite** da chamada: 45 s (`AI_TIMEOUT_MS`). A chamada acontece **fora** de transação do banco.

## Configuração (servidor)

| Variável | Uso |
|---|---|
| `AI_PROVIDER` | `anthropic`, `openai` ou `mock` (padrão: detecta pela chave presente; sem chave = relatório por regras) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | chave do provedor (nunca vai para o banco nem para o navegador) |
| `AI_MODEL` | troca o modelo |
| `AI_PRICE_IN_PER_MTOK`, `AI_PRICE_OUT_PER_MTOK` | preço em US$ por milhão de tokens, para a estimativa de custo (confira a tabela atual do provedor) |
| `AI_DAILY_LIMIT_PER_TENANT` | limite diário de relatórios com IA por ambiente |
| `AI_TIMEOUT_MS` | tempo limite da chamada |

O provedor `mock` reproduz o fluxo completo sem custo (testes e demonstração). Nos testes, `AI_MOCK_RESPONSE` força uma resposta fixa, usada para comprovar que um texto com número digitado é reprovado.

## Quem acessa

Somente a professora, a equipe (alunos atribuídos) e a ONE UP operando o ambiente. O aluno não gera nem vê o relatório; a professora pode copiar a "mensagem sugerida" e enviar a ele.
