# Zabbix Template: Apache NiFi API by JS

Monitoramento de fluxos Apache NiFi via API REST (`/nifi-api`), com **JavaScript embutido**
(coleta e processamento no lado do Zabbix). Não requer agente — apenas conectividade HTTP(S)
do Zabbix Server/Proxy até a API do NiFi.

| Arquivo | Descrição |
|---|---|
| `template_nifi_api.yaml` | Versão original (v1, histórico) |
| `template_nifi_api_v2-Sugestoes_AMCOM.yaml` | v1 + alteração 1 do TO-BE (storage) — parcial |
| **`template_nifi_api_v3-ajustes_AMCOM.yaml`** | **Versão atual (TO-BE DBT-6131 completo)** |
| `preprocessamento_fluxos.js` | Código 5 de referência (embutido no item `nifi.fluxos.status`) |

Export Zabbix **7.4**, 4 templates. Valores de referência: `AJUSTES_ZABBIX_NIFI_RESUMO.md`.

## Estrutura

| Template | Função |
|---|---|
| `Apache NiFi API by JS` (master) | Status da API, bulletin board (+ item dependente de erro), login/token (1x/h), sinal do playbook (trapper) e **descoberta de fluxos** (`nifi.fluxos.status` + 16 itens e 5 triggers por fluxo) |
| `... Cluster Resources` | JVM (heap usado/max/%, GC %, uptime), storage dos repositórios (%), threads totais (fix real do §1.6) |
| `... Queues` | (antiga) descoberta de filas por PG — **desativada**, substituída pela descoberta de fluxos |
| `... Counters` | LLD de counters registrados (ex.: UpdateCounter) com filtro por regex |

## Autenticação

Todas as coletas usam header **`Authorization: Bearer {$NIFI.TOKEN}`**:

1. O token é renovado pelo playbook/cron `renovar_nifi_token.yml` (login em `POST /access/token`
   com `{$NIFI.USER}`/`{$NIFI.PASSWORD}` + atualização da macro via API do Zabbix).
2. Após cada renovação o cron sinaliza o Zabbix:

   ```bash
   zabbix_sender -z <servidor-zabbix> -s <host> -k nifi.token.renovado -o 1
   ```

   O item trapper `nifi.token.renovado` + trigger `nodata(...,8h)` avisam se a renovação falhou
   (alteração 15). O playbook deve rodar **para cada host NiFi** (alteração 16) — um token por
   instância.
3. O item `NiFi API: Token de acesso (login)` (`nifi.api.token`) agora roda **1x/hora** (alteração 14)
   apenas para diagnóstico — login a cada minuto chega a bloquear a conta no AD.

> **Importante (testado no 7.4):** macros do tipo **`SECRET_TEXT` não são expandidas em headers
> HTTP**. Por host, defina `{$NIFI.TOKEN}` como macro do tipo *Text* (ou *Vault*); o playbook de
> renovação já pode gravar como Text — o valor é segredo de rotação a cada ~8h.

## Macros principais

| Macro | Valor | Descrição |
|---|---|---|
| `{$NIFI.URL}` | — | URL base da API (ex.: `https://host:8443/nifi-api`) |
| `{$NIFI.USER}` / `{$NIFI.PASSWORD}` | — | Credenciais do login (playbook + item de diagnóstico) |
| `{$NIFI.TOKEN}` | — | Token Bearer de todas as coletas — renovado via playbook/cron. Definir como **Text** por host (ver nota acima) |
| `{$NIFI.ROOT_PG_ID}` | `root` | Process Group raiz |
| `{$NIFI.FLUXO.PROFUNDIDADE}` | 1 | Alteração 12 — 1 = filhos da raiz, 2 = um nível abaixo, 0 = todos |
| `{$NIFI.DEVE_RODAR}` | 0 | Alteração 11 — no **host**: `{$NIFI.DEVE_RODAR:"<ID do PG>"}=1` para cada fluxo que deve rodar (alerta de parado só para esses) |
| `{$NIFI.REPO_PCT.WARN}` | 70 | Alteração 2 — % de uso dos repositórios p/ trigger Warning |
| `{$NIFI.REPO_PCT.HIGH}` | 90 | Alteração 2 — % de uso dos repositórios p/ trigger High |
| `{$NIFI.HEAP_PCT}` | 80 | Alteração 3 — % de heap da JVM p/ trigger (era 85) |
| `{$NIFI.BULLETS_ERROR}` | 1 | Boletins ERROR p/ trigger (`nifi.api.bullets.error`) |
| `{$NIFI.QUEUE_BACKPRESSURE_PCT}` | 80 | % do back pressure p/ trigger de fila (LLD antiga) |
| `{$NIFI.QUEUE_AGE_MIN}` | 300 | Idade máx. (s) do dado na fila (LLD antiga) |
| `{$NIFI.PROC_STOPPED}` | 0 | Processadores inválidos tolerados (LLD antiga) |
| `{$NIFI.COUNTERS_FILTER}` | — | Regex p/ filtrar counters (vazio = todos) |
| `{$NIFI.TIMEOUT}` | 15s | Timeout HTTP (o item de fluxos usa 60s fixo — coleta recursiva) |
| `{$NIFI.STATUS_NS_TRIGGER}` | 3m | Janela de `nodata()` da API |

## Itens monitorados

### Template master — `Apache NiFi API by JS`

| Item | Coleta | Descrição |
|---|---|---|
| `nifi.api.status` | `GET /flow/status` | Status do serviço. Value map: `ok` |
| `nifi.api.bullets` | `GET /flow/bulletin-board` | JSON `{warn, error, sem_permissao, last_error}` (alteração 6 — lê `bulletinBoard.bulletins`) |
| `nifi.api.bullets.error` | dependente | Contador numérico de boletins ERROR (alteração 7) |
| `nifi.api.token` | `POST /access/token` | Diagnóstico de login — **1x/hora** |
| `nifi.token.renovado` | trapper | Sinal `1` do playbook após cada renovação (alteração 15) |
| `nifi.fluxos.status` | `GET /flow/process-groups/{raiz}/status?recursive=true` | Item mestre — um bloco por fluxo, com contadores acumulando o subgrupo inteiro (alterações 9/10) |

**Descoberta de fluxos** (`nifi.fluxos.descoberta`, dependente do mestre; macros `{#FLUXO_ID}`/`{#FLUXO}`).

Por fluxo (`{#FLUXO}` = nome, `{#FLUXO_ID}` = id do PG) — todos dependentes do mestre:

| Item | Campo | Descrição |
|---|---|---|
| `nifi.fluxo.parados[{#FLUXO_ID}]` | `stopped` | Processadores STOPPED no fluxo (somam os subgrupos) |
| `nifi.fluxo.invalidos[{#FLUXO_ID}]` | `invalid` | Processadores INVALID (portas sem conexão excluídas) |
| `nifi.fluxo.fila_uso[{#FLUXO_ID}]` | `max_uso_fila_pct` | Maior % de back pressure entre as filas |
| `nifi.fluxo.contrapressao[{#FLUXO_ID}]` | `conexoes_contrapressao` | Filas em 100% do back pressure |
| `nifi.fluxo.fila[{#FLUXO_ID}]` | `fila_flowfiles` | FlowFiles em fila |
| `nifi.fluxo.fila_bytes[{#FLUXO_ID}]` | `fila_bytes` | Bytes em fila |
| `nifi.fluxo.deriva[{#FLUXO_ID}]` | `pgs_com_deriva` | Grupos com `versionedFlowState != UP_TO_DATE` (NiFi 1.x) |
| `nifi.fluxo.ff_in/ff_out[{#FLUXO_ID}]` | — | FlowFiles recebidos/enviados (janela 5m) |
| `nifi.fluxo.bytes_in/bytes_out[{#FLUXO_ID}]` | — | Bytes recebidos/enviados (5m) |
| `nifi.fluxo.threads[{#FLUXO_ID}]` | `threads_ativas` | Threads ativas |
| `nifi.fluxo.tarefas_ms[{#FLUXO_ID}]` | `tarefas_ms_5min` | Tempo de processamento (ms, 5m) |
| `nifi.fluxo.lento_ms/lento_nome[{#FLUXO_ID}]` | — | Processador mais lento (ms/tarefa + nome) |
| `nifi.fluxo.versao[{#FLUXO_ID}]` | `versionamento` | Estado de versionamento (raw) |

### Template `... Cluster Resources`

Baseado em `GET /system-diagnostics` (dependentes do raw):

| Item | Descrição |
|---|---|
| `nifi.jvm.heap_used` / `heap_max` / `heap_pct` | Heap (corrigida para TO-BE: trigger a 80%) |
| `nifi.jvm.uptime` | Uptime da JVM em segundos |
| `nifi.jvm.gc_pct` | % de tempo em GC — **fix real** (JS + change per second + ×0.1) |
| `nifi.cluster.threads_total` | **Fix real** — dependente de `nifi.jvm.raw` lendo `totalThreads` (o `/flow/status` não tem esse campo) |
| `nifi.storage.used_pct` | **Fix real** — maior % entre flowfile/content/provenance (era % de non-heap) |
| `nifi.cluster.nodes` / `nodes_connected` | Placeholders — **desativados** (alteração 18) |

### Templates `... Queues` / `... Counters`

- Queues: LLD **desativada** (alteração 18) — as métricas de fila por fluxo vêm da descoberta de fluxos.
- Counters: LLD ativa (`nifi.counter.value[{#COUNTERNAME}]`) com filtro `{$NIFI.COUNTERS_FILTER}`.

## Triggers

Todas com `manual_close` e janelas `min()`/`nodata()` para evitar flapping.

### Disponibilidade

| Trigger | Severidade | Condição |
|---|---|---|
| `NiFi API: sem dados (servico indisponivel)` | High | `nodata(nifi.api.status, {$NIFI.STATUS_NS_TRIGGER})` |
| `NiFi: coleta dos fluxos parou` | High | `nodata(nifi.fluxos.status,5m)` (alteração 9) |
| `NiFi: renovacao do token falhou (sem sinal do playbook)` | High | `nodata(nifi.token.renovado,8h)=1` (alteração 15) |
| `NiFi: boletins ERROR no bulletin board` | Average | `last(nifi.api.bullets.error)>={$NIFI.BULLETS_ERROR}` (alteração 8) |

### Recursos (Cluster Resources)

| Trigger | Severidade | Condição |
|---|---|---|
| `NiFi Storage: repositorio acima de {$NIFI.REPO_PCT.WARN}%` | Warning | `min(10m)>=70` — **dependente** da High (alteração 2) |
| `NiFi Storage: repositorio acima de {$NIFI.REPO_PCT.HIGH}%` | High | `min(10m)>=90` |
| `NiFi JVM: heap > {$NIFI.HEAP_PCT}%` | Warning | `min(5m)>80` |
| `NiFi: threads ativas acima do limite` | Warning | `{$NIFI.THREADS_MAX}>0` |

### Fluxos (protótipos por fluxo descoberto)

| Trigger | Severidade | Condição |
|---|---|---|
| `{#FLUXO}: processador parado` | High | `min(parados,2m)>0 and {$NIFI.DEVE_RODAR:"{#FLUXO_ID}"}=1` |
| `{#FLUXO}: processador invalido` | High | idem com `invalidos` |
| `{#FLUXO}: fila acima de 80%` | Warning | `min(fila_uso,5m)>=80` |
| `{#FLUXO}: fila em contrapressao` | High | `min(contrapressao,5m)>0` |
| `{#FLUXO}: alteracao nao versionada` | Information | `last(deriva)>0` |

> O alerta de parado/inválido **só dispara** para fluxos marcados com
> `{$NIFI.DEVE_RODAR:"<ID do PG>"}=1` no host (alteração 11) — sem isso vira ruído.

## Retenção (alteração 13)

Itens numéricos (incluindo protótipos): **history 31d / trends 400d**. Itens raw/texto
(`.raw`, `nifi.fluxos.status`, `nifi.api.status/bullets`): history 1d.

## Entidades desativadas (alteração 18)

Desativadas (não excluídas) na v3 — reative/remova após homologar a descoberta de fluxos:

- LLD `nifi.discovery.process_groups` (master) e `nifi.discovery.queues` (Queues)
- Itens `nifi.cluster.nodes` e `nifi.cluster.nodes_connected`
- Trigger antiga de bullets (`find(...,"like",...)`) — não reconhecia 2–9 erros

## Requisitos no NiFi (alteração 19 — mínimo privilégio)

A conta usada pelo Zabbix precisa apenas de:

- *view the user interface*
- *view system diagnostics*
- *view the component* no grupo raiz

**Não** precisa de acesso a `/controller` (a versão anterior do README indicava, à toa).

## Renovação automática do token

O JWT do NiFi é de ~8h de duração (login single-user). O token usado em `{$NIFI.TOKEN}` é
renovado pelo playbook Ansible `renovar_nifi_token.yml` (le `.env`, login, atualiza a macro
via API do Zabbix com `no_log`). Alternativa legada: `renovar_nifi_token.sh`.

Alterações 15/16 do TO-BE no playbook/instalação:

1. Ao final da execução, sinalizar: `zabbix_sender -z <server> -s <host> -k nifi.token.renovado -o 1`.
2. Rodar o playbook **uma vez por host** (`zabbix_host_name` por instância).
3. Cron com folga de 1h antes da expiração:

```bash
( crontab -l 2>/dev/null; \
  echo "0 */7 * * * cd $PWD && venv/bin/ansible-playbook renovar_nifi_token.yml >> $HOME/renovar-nifi-token.log 2>&1" ) | crontab -
```

4. Macro do host `{$NIFI.TOKEN}` como **Text** (SECRET não expande em header no 7.4).

## Recursos da VM (alteração 17)

Instale o **Zabbix agent 2** na VM e vincule o template padrão **Linux by Zabbix agent**
(vínculo por host, fora deste template).

## Homologação

Testado com as imagens docker locais:

- **Import** no stack `zabbix/zabbix-server-mysql` + `zabbix-web-nginx-mysql` (`alpine-7.4-latest`,
  7.4.15) — import e re-import (idempotente) OK.
- **Coleta real** contra `apache/nifi:latest` (NiFi 2.12) com fluxo de teste (PG + subgrupo,
  fila em contrapressão, processador parado/inválido): itens e triggers por fluxo geraram
  valores corretos e alertas (`fila acima de 80%`, `fila em contrapressão`, `processador invalido`
  com `{$NIFI.DEVE_RODAR:<pgid>}=1`).
- Compatibilidade com NiFi **1.x** preservada no JS (listas flat + `versionedFlowState`).
- No NiFi **2.x** o status recursivo não expõe `versionedFlowState` — itens
  `nifi.fluxo.deriva`/`nifi.fluxo.versao` ficam zerados/vazios nessa versão.

Constantes de import 7.4 a lembrar (já usadas no arquivo): item trapper = `TRAP`,
severidade Information = `INFO`.