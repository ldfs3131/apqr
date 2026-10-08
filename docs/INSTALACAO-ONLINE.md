# APQR online: como atualizar, fazer cópia e ser avisado

Este guia vale para o APQR que já está no ar no servidor da ONE UP (Hostinger). Ele descreve o fluxo fixo e o passo a passo para ligar tudo **uma única vez**.

## O fluxo (é sempre assim)

1. Você pede a mudança no chat.
2. O Claude altera, roda os testes, confere o site compilado e envia para o GitHub (`ldfs3131/apqr`, repositório privado).
3. O Claude avisa: **"pronto, rode `apqr atualizar`"**.
4. Você roda esse **único comando** no terminal do servidor. Ele faz tudo sozinho e, se a versão nova não ligar, **volta sozinho** para a anterior.
5. Se aparecer erro, você manda a tela para o Claude.

Mudanças que não são de código (cores, logo, alunos, editais, materiais, agenda) continuam sendo feitas direto na plataforma, sem comando nenhum.

## Ligar tudo (uma vez só)

Abra o terminal da Hostinger (o mesmo da instalação). Rode **um comando por vez** e confira o resultado esperado. Se aparecer `sudo`, mantenha; se você já estiver como `root`, funciona igual.

### Parte 1. GitHub (no navegador)

Já feita: repositório **privado e vazio** `apqr` na conta `ldfs3131`, liberado para o Claude. O Claude envia o código para lá; você não precisa fazer nada nele além da Parte 2, passo 2.

### Parte 2. Servidor

**1. Criar a chave de leitura do GitHub** (o servidor só LÊ o GitHub, nunca escreve):

```
sudo mkdir -p /opt/oneup/apqr/.ssh && sudo ssh-keygen -t ed25519 -N "" -C "apqr-servidor" -f /opt/oneup/apqr/.ssh/deploy_key
```

Esperado: aparece a "key fingerprint" e um desenho. Sem erro.

**2. Mostrar a chave pública e cadastrar no GitHub:**

```
sudo cat /opt/oneup/apqr/.ssh/deploy_key.pub
```

Copie a linha inteira (começa com `ssh-ed25519`). No GitHub: repositório **apqr → Settings → Deploy keys → Add deploy key**. Dê o título `servidor`, cole a linha e **deixe DESMARCADO "Allow write access"**. Clique em Add key. (Essa linha é a parte pública; não é segredo e pode ser copiada com segurança.)

**3. Baixar o código do GitHub para o servidor:**

```
sudo git clone -c core.sshCommand="ssh -i /opt/oneup/apqr/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" git@github.com:ldfs3131/apqr.git /opt/oneup/apqr/repo
```

Esperado: `Cloning into '/opt/oneup/apqr/repo'...` e termina sem erro.
Se der `Permission denied (publickey)`, a chave do passo 2 não foi cadastrada (ou está com o nome errado). Refaça o passo 2.

**4. Rodar o adaptador (um comando):**

```
sudo bash /opt/oneup/apqr/repo/deploy/instalar.sh
```

Esperado: cinco etapas (`1/5` a `5/5`), uma tabela de situação no fim e a mensagem `Adaptação concluída. O APQR continuou no ar durante todo o processo`.

O que ele faz: confere o servidor, **faz uma cópia completa antes de mexer em qualquer coisa**, instala o comando `apqr`, agenda a cópia diária (03:40) e o vigia (a cada 5 minutos). Ele **não reinicia o APQR**, não mexe no Nginx, nos outros sistemas (restaurante, Lava Jato), no firewall, no fuso horário nem no Node. Pode rodar de novo sem problema.

Se ele recusar, a mensagem diz o motivo (por exemplo, porta de outro sistema). Nada é alterado nesse caso.

### Parte 3. Conferências finais (um comando por vez)

| # | Comando | Esperado |
|---|---|---|
| 1 | `apqr status` | `Sistema ... NO AR`, cópia no servidor com horas, cadeado HTTPS com dias, disco e memória |
| 2 | `apqr atualizar` | primeira troca para o código do GitHub, terminando em `Atualizado: 2.3.0 → 2.3.1. No ar e conferido.` |
| 3 | `apqr alertas configurar` | pede seu WhatsApp (com 55 e DDD) e a chave do CallMeBot. **Pode usar o mesmo número e a mesma chave do restaurante** |
| 4 | `apqr alerta teste` | chega uma mensagem no seu WhatsApp |
| 5 | `apqr backup-externo configurar` | lista as conexões do rclone (use a do Google Drive da ONE UP, a mesma do restaurante serve), mostra a **frase das cópias uma vez** e pede para digitar `guardei` |
| 6 | `apqr backup-externo agora` | `cópia no Drive ok`. No Drive aparece `ONEUP-backups/apqr/` |
| 7 | `apqr certificado testar-renovacao` | `Congratulations, all simulated renewals succeeded` |

**A frase das cópias (passo 5):** ela aparece uma única vez na tela. Anote **no seu gerenciador de senhas**. Sem ela não é possível abrir as cópias do Drive. Ela também fica guardada no servidor, em arquivo que só o administrador lê. **Nunca cole a frase, senhas, chaves ou tokens no chat.** Se o servidor for perdido, a frase do seu gerenciador de senhas é o que permite recuperar tudo.

## Comandos

| Comando | Para quê |
|---|---|
| `apqr status` | Como está agora: no ar, versão, última cópia (servidor e Drive), cadeado HTTPS, memória e disco |
| `apqr atualizar` | Baixa a versão nova do GitHub, faz cópia antes, troca e confere. Volta sozinho se não ligar |
| `apqr voltar` | Volta para a versão anterior em segundos (depois de uma atualização que ligou mas você não gostou) |
| `apqr versao` | Versão em execução, anterior e a do GitHub |
| `apqr backup` | Cópia do banco e dos arquivos agora. Automática todo dia às 03:40, guardando 14 dias (e 12 mensais) |
| `apqr restaurar <cópia>` | Volta o banco para uma cópia. Faz cópia do estado atual antes e pede para digitar `RESTAURAR` |
| `apqr backup-externo configurar` | Liga a cópia diária cifrada no Google Drive (uma vez) |
| `apqr backup-externo agora` / `listar` | Envia uma cópia agora / mostra as que estão no Drive (30 diárias e 12 mensais) |
| `apqr restaurar-externo <nome>` | Baixa do Drive, abre com a frase e restaura |
| `apqr alertas configurar` / `apqr alerta teste` | Liga e testa os avisos no seu WhatsApp |
| `apqr logs` | Últimas linhas do registro do app (`apqr logs db` para o banco, `apqr logs -f` para acompanhar) |
| `apqr reiniciar` | Reinicia o app e espera responder |
| `apqr certificado` | Validade do cadeado HTTPS (`apqr certificado testar-renovacao` testa a renovação automática) |
| `apqr acessos` | Quantos logins nas últimas 24 horas, com sucesso, senha errada e bloqueados |
| `apqr ajuda` | Lista tudo |

## O que o `apqr atualizar` faz (e por que é seguro)

1. Busca o GitHub. Se já está na versão mais nova, diz isso e para.
2. Recusa se a versão do GitHub for **mais antiga** que a em uso, ou se o código mudou sem a versão mudar.
3. **Faz a cópia de segurança antes. Sem cópia, não atualiza.**
4. Liga a marca de **manutenção** (o vigia não avisa "fora do ar" à toa durante a troca).
5. Constrói a versão nova (só dependências de produção, até 3 tentativas). O site antigo continua no ar durante a construção.
6. Troca e espera o sistema responder por até 90 segundos.
7. **Se não ligar, volta sozinho** para a versão anterior e confirma que ela voltou. Os dados são preservados. Se nem a anterior ligar, a tela diz qual cópia restaurar.
8. No fim, confere que a versão no ar é a mesma que foi baixada.

Em qualquer falha você recebe um aviso no WhatsApp.

O servidor **nunca compila o site**: o repositório já traz o site pronto (pasta `web/dist`). Isso protege a memória do servidor, que é compartilhado com o restaurante e o Lava Jato.

## Cópias de segurança: onde ficam

| Onde | O quê | Por quanto tempo |
|---|---|---|
| No servidor, `/opt/oneup/backups/apqr/diario/` | banco + arquivos enviados, com conferência de integridade | 14 dias |
| No servidor, `.../mensal/` | a primeira cópia de cada mês | 12 meses |
| Google Drive, `ONEUP-backups/apqr/diarias/` | o mesmo, **cifrado (AES-256)** | 30 dias |
| Google Drive, `ONEUP-backups/apqr/mensais/` | a primeira de cada mês, cifrada | 12 meses |

O arquivo `.env` (senhas do servidor) **não entra nas cópias**: guarde uma cópia dele no gerenciador de senhas.

## O que fazer em cada aviso do WhatsApp

| Aviso | O que fazer |
|---|---|
| 🔴 **o APQR está FORA DO AR** | Rode `apqr status` e depois `apqr logs`. Tente `apqr reiniciar`. Se continuar, mande a tela para o Claude |
| 🔴 **o site NÃO abre pela internet** (o APQR roda, mas o endereço não abre) | O problema está no Nginx ou no certificado, não no APQR. Rode `apqr certificado` e mande a tela para o Claude |
| 🔴 **a cópia de segurança FALHOU** | Rode `apqr backup` e veja a mensagem. Se falhar de novo, confira o disco (`apqr status`) e mande a tela |
| 🔴 **a última cópia tem mais de 26 horas** | Rode `apqr backup`. Se funcionar, o agendamento das 03:40 pode ter parado: avise o Claude |
| 🔴 **o envio ao Google Drive FALHOU** | Rode `apqr backup-externo agora`. Se pedir autorização de novo, refaça a conexão do rclone (`rclone config`) e avise o Claude |
| 🔴 **disco acima de 85%** | Rode `apqr status`. Cópias antigas e registros ocupam espaço; avise o Claude antes de apagar qualquer coisa |
| 🔴 **o certificado HTTPS vence em N dias** | Rode `apqr certificado testar-renovacao`. Se falhar, mande a tela para o Claude (o cadeado precisa ser renovado antes de vencer) |
| 🔴 **em manutenção há mais de 30 minutos** | Uma atualização travou. Rode `apqr status`; se o sistema estiver no ar, está tudo bem e a marca some na próxima atualização. Se não estiver, mande a tela |
| 🟠 **a atualização falhou e o sistema VOLTOU para a versão X** | Está no ar normalmente. Mande ao Claude as últimas linhas de `/opt/oneup/apqr/estado/ultimo-erro.log` (`sudo tail -n 30 /opt/oneup/apqr/estado/ultimo-erro.log`) |
| 🔴 **a atualização falhou e a versão anterior NÃO ligou** | Siga a tela: `apqr restaurar <nome da cópia>`. Depois mande a tela para o Claude |
| 🟢 **voltou ao normal** | Nada a fazer. É o fim de um problema avisado antes |

O mesmo aviso não se repete por 6 horas (vem um lembrete depois disso), e você recebe um 🟢 quando o problema acaba.

## Restaurar

- **Cópia do servidor:** `apqr restaurar` (sem nome) lista as cópias; `apqr restaurar apqr-2026-10-04-034001` restaura. O script confere a integridade, faz uma cópia do estado atual **antes** e pede para digitar `RESTAURAR`. Tudo que foi registrado depois da cópia escolhida é substituído.
- **Cópia do Google Drive:** `apqr backup-externo listar` mostra os nomes; `apqr restaurar-externo apqr-2026-10-04-034001.tar.gpg` baixa, abre com a frase e restaura. Se a frase do servidor tiver sido perdida, o comando pede a do seu gerenciador de senhas.
- **Servidor novo:** instale o Docker e o APQR como na primeira vez, rode as Partes 2 e 3 e restaure pelo Drive. No `apqr backup-externo configurar`, responda **sim** à pergunta "você já tem a frase das cópias?" e digite a do seu gerenciador de senhas (assim o servidor novo abre as cópias antigas, em vez de criar uma frase nova).

## O que este fluxo não faz

- Não troca o Nginx, o certificado nem o domínio (continuam como estão; o certbot renova o certificado sozinho).
- Não mexe no banco do restaurante, no Lava Jato nem em seus serviços.
- Não atualiza o servidor operacional (Ubuntu), o Docker nem o Node. Isso fica a seu critério e do Claude, separadamente.

## Para quem for cuidar do código (Claude)

- A cada publicação: `npm run build:web` (compila o site para `web/dist`), subir `VERSION` (por exemplo `2.3.2`), `npm run release:check` (confere se o site compilado bate com o código, se a versão é válida e se não há segredos), `npm test`, commit, tag `vX.Y.Z` e push para `main`.
- Ensaio do fluxo de atualização, sem servidor: `bash deploy/teste/ensaio.sh` (usa Docker, rclone e WhatsApp de mentira e um repositório Git local; deve terminar com `0 com problema`).
- O `apqr` e o `instalar.sh` ficam em `deploy/`. O `apqr atualizar` copia os arquivos de `deploy/` do release novo para `/opt/oneup/apqr` e troca o próprio comando no fim, só se a atualização deu certo.
