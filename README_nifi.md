# Zabbix Template: Apache NiFi API by JS

Monitoramento de fluxos Apache NiFi via API REST (`/nifi-api`), com **JavaScript embutido**
(coleta e processamento no lado do Zabbix). Não requer agente — apenas conectividade HTTP(S)
do Zabbix Server/Proxy até a API do NiFi.

Arquivo: `template_nifi_api.yaml` (export Zabbix **7.4**, 4 templates).

## Estrutura

| Template | Função |
|---|---|
| `Apache NiFi API by JS` (master) | Status da API, bulletin board, **login/token** + LLD de Process Groups (threads, filas, flowfiles in/out, bytes, processadores com erro, uptime) |
| `... Cluster Resources` | JVM (heap usado/max/%, GC %, uptime), storage dos repositórios (%), nodes do cluster, threads totais |
| `... Queues` | Por fila (connection): objetos/bytes, % de back pressure (objetos e bytes), idade do dado mais antigo |
| `... Counters` | LLD de counters registrados (ex.: UpdateCounter) com filtro por regex |

## Autenticação

Todos os itens de coleta autenticam com header **`Authorization: Bearer {$NIFI.TOKEN}`**
(confere com o template — nenhum item usa HTTP Basic):

1. O item `NiFi API: Token de acesso (login)` (`nifi.api.token`) faz `POST {$NIFI.URL}/access/token`
   com `username=...&password=...` (`Content-Type: application/x-www-form-urlencoded`, resposta
   esperada `201`) e registra o token gerado (histórico desabilitado; uso diagnóstico) — serve
   para validar que as credenciais estão corretas.
2. A coleta dos demais itens usa a macro `{$NIFI.TOKEN}` no header. Como o NiFi só emite tokens
   de curta duração (8h no login single-user), a macro precisa ser renovada periodicamente —
   o playbook Ansible `renovar_nifi_token.yml` faz isso via API do Zabbix (ver seção
   **Renovação automática do token**).
3. `{$NIFI.USER}`/`{$NIFI.PASSWORD}` alimentam o login (item de token e renovação). A macro
   `{$NIFI.AUTH}` (`basic`|`token`) documenta o modo de autenticação pretendido do host.

Teste manual do login:

```bash
curl -sk -X POST "{$NIFI_URL}/access/token" \
  -d 'username=USUARIO&password=SENHA'
# retorna o token em texto puro
```

## Macros principais

| Macro | Descrição |
|---|---|
| `{$NIFI.URL}` | URL base da API (ex.: `https://nifi-host:8443/nifi-api`) |
| `{$NIFI.USER}` / `{$NIFI.PASSWORD}` | Credenciais do login do NiFi |
| `{$NIFI.TOKEN}` | Token Bearer enviado no header de todos os itens (`Authorization: Bearer`) — renovado via playbook/cron |
| `{$NIFI.AUTH}` | Modo de autenticação (`basic` = login via user/pass; `token` = usa `{$NIFI.TOKEN}` direto) |
| `{$NIFI.ROOT_PG_ID}` | ID do Process Group raiz (default `root`) |
| `{$NIFI.PROCESS_GROUPS}` | Lista estática de IDs de PGs. Vazio = descobrir via API |
| `{$NIFI.QUEUE_BACKPRESSURE_PCT}` | % do back pressure p/ trigger (default `80`) |
| `{$NIFI.QUEUE_AGE_MIN}` | Idade máx. (s) do dado na fila (default `300`) |
| `{$NIFI.HEAP_PCT}` | % de heap da JVM p/ trigger (default `85`) |
| `{$NIFI.PROC_STOPPED}` | Processadores inválidos/parados tolerados (default `0`) |
| `{$NIFI.COUNTERS_FILTER}` | Regex p/ filtrar counters (vazio = todos) |
| `{$NIFI.TIMEOUT}` | Timeout HTTP com unidade (default `15s`) |

## Itens monitorados

### Template master — `Apache NiFi API by JS`

| Item | Coleta | Descrição |
|---|---|---|
| `nifi.api.status` | `GET /flow/status` | Status do serviço. O JS extrai `active_threads`, `queued`, `queued_bytes`, `running`, `invalid`. Value map: `ok` = Serviço OK |
| `nifi.api.bullets` | `GET /flow/bulletin-board` | Conta boletins WARN/ERROR da UI e guarda a mensagem do último erro (`last_error`, máx. 200 chars) |
| `nifi.api.token` | `POST /access/token` | Faz login e registra o token (histórico desabilitado; uso diagnóstico/scripts) |

**LLD de Process Groups** (`nifi.discovery.process_groups`, via `/flow/process-groups/{root}`, delay 1h) — cria por PG (`{#PGID}`/`{#PGNAME}`):

| Item | Fonte | Descrição |
|---|---|---|
| `nifi.pg.status[{#PGID}]` | `/flow/process-groups/{id}/status` | Snapshot agregado do PG (raw JSON) — alimenta o trigger de disponibilidade |
| `nifi.pg.threads[{#PGID}]` | idem | Threads ativas no PG |
| `nifi.pg.queued_count[{#PGID}]` | idem | Objetos (FlowFiles) em fila |
| `nifi.pg.queued_bytes[{#PGID}]` | idem | Bytes em fila |
| `nifi.pg.flowfiles_in[{#PGID}]` | idem | FlowFiles de entrada (janela de 5m) |
| `nifi.pg.flowfiles_out[{#PGID}]` | idem | FlowFiles transferidos para fora (5m) |
| `nifi.pg.bytes_read[{#PGID}]` | idem | Bytes lidos (5m) |
| `nifi.pg.bytes_written[{#PGID}]` | idem | Bytes escritos (5m) |
| `nifi.pg.proc_errors[{#PGID}]` | `/flow/process-groups/{id}` | Processadores `INVALID` ou com erros de validação |
| `nifi.pg.uptime[{#PGID}]` | idem | Maior uptime entre processadores `RUNNING` do PG |

### Template `... Cluster Resources`

Baseado em `GET /system-diagnostics` (itens dependentes do raw):

| Item | Descrição |
|---|---|
| `nifi.jvm.heap_used` / `nifi.jvm.heap_max` | Heap usado/máximo da JVM (bytes) |
| `nifi.jvm.heap_pct` | % de heap usado (usado/max) |
| `nifi.jvm.uptime` | Uptime da JVM em segundos (parse de `HH:mm:ss`) |
| `nifi.jvm.gc_pct` | % do tempo em GC (placeholder, retorna 0) |
| `nifi.cluster.nodes` / `nifi.cluster.nodes_connected` | Nodes do cluster / conectados (placeholder, retorna 1) |
| `nifi.storage.used_pct` | % de uso máximo dos repositórios (flowfile/content/provenance) |
| `nifi.cluster.threads_total` | Total de threads ativas (`/flow/status`) |

### Template `... Queues`

**LLD de filas** (`nifi.discovery.queues`, via connections do PG raiz, delay 5m) — cria por connection (`{#CONNID}`/`{#CONNNAME}`):

| Item | Descrição |
|---|---|
| `nifi.queue.raw[{#CONNID}]` | JSON da connection (raw) |
| `nifi.queue.objects[{#CONNID}]` | Objetos na fila (`queueSize.objectCount`) |
| `nifi.queue.bytes[{#CONNID}]` | Bytes na fila (`queueSize.byteCount`) |
| `nifi.queue.bp_objects_pct[{#CONNID}]` | % atingido do back pressure por objetos |
| `nifi.queue.bp_bytes_pct[{#CONNID}]` | % atingido do back pressure por bytes |
| `nifi.queue.oldest[{#CONNID}]` | Idade em s do FlowFile mais antigo (`oldestFlowFileTimestamp`) |

### Template `... Counters`

**LLD de counters** (`nifi.discovery.counters`, via `/counters`, delay 5m, filtro `{$NIFI.COUNTERS_FILTER}`):

| Item | Descrição |
|---|---|
| `nifi.counter.value[{#COUNTERNAME}]` | Valor atual do counter descoberto (ex.: `UpdateCounter`) |

## Requisitos no NiFi

- Usuário com permissões **read** em `/flow`, `/controller`, `/counters`.
- Endpoints: `/access/token` (login), `/flow/status`, `/flow/process-groups/{id}`,
  `/controller/bulletin-board`, `/controller/diagnostics`, `/flowfile-queues/{id}`, `/counters`.

## Triggers

Todas permitem fechamento manual (`manual_close`) e usam `min()`/`nodata()` com janelas
para evitar flapping. Thresholds são controlados por macros — ajuste por host sem editar o template.

### Disponibilidade

| Trigger | Severidade | Condição | Macro |
|---|---|---|---|
| `NiFi API: sem dados (serviço indisponível)` | HIGH | `nodata(nifi.api.status, {$NIFI.STATUS_NS_TRIGGER})` — API sem responder no período | `{$NIFI.STATUS_NS_TRIGGER}` (3m) |
| `PG {#PGNAME}: sem dados da API` | WARNING | `nodata(nifi.pg.status, ...)`. Também cobre itens dependentes que param de chegar (HTTP falha) | `{$NIFI.STATUS_NS_TRIGGER}` |
| `NiFi: threads ativas acima do limite` | WARNING | `min(nifi.cluster.threads_total,10m) > {$NIFI.THREADS_MAX} and {$NIFI.THREADS_MAX} > 0` | `{$NIFI.THREADS_MAX}` (0 = desativado) |

### Recursos (Cluster Resources)

| Trigger | Severidade | Condição | Macro |
|---|---|---|---|
| `NiFi JVM: heap > {$NIFI.HEAP_PCT}%` | WARNING | `min(nifi.jvm.heap_pct,5m) > {$NIFI.HEAP_PCT}` | `{$NIFI.HEAP_PCT}` (85) |
| `NiFi Storage: repositório acima de ...%` | WARNING | `min(nifi.storage.used_pct,5m) > {$NIFI.QUEUE_BACKPRESSURE_PCT}` (flowfile/content/provenance) | `{$NIFI.QUEUE_BACKPRESSURE_PCT}` (80) |

### Filas (Queues) — protótipos por fila descoberta

| Trigger | Severidade | Condição | Macro |
|---|---|---|---|
| `Fila {#CONNNAME}: back pressure objetos > ...%` | AVERAGE | `min(nifi.queue.bp_objects_pct,10m) > {$NIFI.QUEUE_BACKPRESSURE_PCT}` | `{$NIFI.QUEUE_BACKPRESSURE_PCT}` (80) |
| `Fila {#CONNNAME}: back pressure bytes > ...%` | AVERAGE | `min(nifi.queue.bp_bytes_pct,10m) > {$NIFI.QUEUE_BACKPRESSURE_PCT}` | `{$NIFI.QUEUE_BACKPRESSURE_PCT}` (80) |
| `Fila {#CONNNAME}: dados parados` | AVERAGE | `min(nifi.queue.oldest,10m) > {$NIFI.QUEUE_AGE_MIN}` — dado mais antigo na fila mais velho que o limite | `{$NIFI.QUEUE_AGE_MIN}` (300s) |

Back pressure alto significa que o consumidor da fila está lento/parado; próximo de 100% o NiFi
passa a aplicar *back pressure* real (upstream para de rodar). `dados parados` detecta
estagnação mesmo sem atingir o threshold (fila pequena).

### Fluxo / processadores (master)

| Trigger | Severidade | Condição | Macro |
|---|---|---|---|
| `PG {#PGNAME}: processadores inválidos/parados` | AVERAGE | `min(nifi.pg.proc_errors,10m) > {$NIFI.PROC_STOPPED}` — processadores `INVALID` ou com erros de validação | `{$NIFI.PROC_STOPPED}` (0) |
| `NiFi: bullets de ERROR no bulletin board` | AVERAGE | `find(nifi.api.bullets,5m,"like","\"error\":{$NIFI.BULLETS_ERROR}")=1` — N+ boletins ERROR na UI | `{$NIFI.BULLETS_ERROR}` (1) |

> **Nota:** o trigger de bullets faz busca textual no valor TEXT do item — `{$NIFI.BULLETS_ERROR}`
> deve ser um número sem aspas na macro para casar com `"error":1`.

### O que ainda não tem trigger (métricas informativas)

- `nifi.pg.threads/queued_count/queued_bytes/flowfiles_in/out/bytes_read/bytes_written/uptime` por PG
- `nifi.jvm.heap_used/heap_max/uptime/gc_pct`, `nifi.cluster.nodes/nodes_connected`
- `nifi.queue.objects/bytes` por fila
- `nifi.counter.value` por counter
- `{$NIFI.GC_PCT}`, `{$NIFI.BULLETS_WARN}`, `{$NIFI.RETRIES}` e macros de GC/nodes estão
  declaradas para evolução futura (protótipos em placeholder no template de recursos).

## Renovação automática do token

O NiFi **não** emite tokens de longa duração: o JWT máximo é de **12h** (hardcoded,
`StandardBearerTokenProvider.MAXIMUM_EXPIRATION`) e o single-user login gera tokens de **8h** fixos.
Não existe "API token"/"service token" na UI nem via CLI.

Para o Zabbix, o token é renovado automaticamente pelo playbook Ansible `renovar_nifi_token.yml`
(login no NiFi + atualização de `{$NIFI.TOKEN}` via API do Zabbix). Alternativa legada:
script shell `renovar_nifi_token.sh` (mesmo fluxo, com `curl` + `python3`).

### Playbook Ansible (recomendado)

Requisitos: `ansible-core` + coleção `community.general` (já instalados no `venv/` do projeto).

```bash
# executar manualmente para validar:
venv/bin/ansible-playbook renovar_nifi_token.yml

# sintaxe apenas (sem executar):
venv/bin/ansible-playbook renovar_nifi_token.yml --syntax-check
```

O playbook lê `.env` do projeto (`token_zabbix`, `nifi_username`, `nifi_password`), faz login no
NiFi (`POST /access/token`, `201`), resolve `hostid`/`hostmacroid` de `{$NIFI.TOKEN}` via API do
Zabbix e atualiza a macro (segredo nunca logado — `no_log`).

Instalação no cron (renova a cada 7h — folga de 1h antes da expiração de 8h):

```bash
( crontab -l 2>/dev/null; \
  echo "0 */7 * * * cd $PWD && venv/bin/ansible-playbook renovar_nifi_token.yml >> $HOME/renovar-nifi-token.log 2>&1" ) | crontab -
```

Variáveis ajustáveis no topo do playbook (`zabbix_host_name`, `zabbix_macro`, `nifi_token_url`,
`zabbix_api_url`, `env_file`).

### Alternativa oficial: mTLS com client certificate

A recomendação oficial do NiFi para automação/monitoramento é autenticação por
**certificado de cliente (X.509)** — sem tokens/renovação. No Zabbix, um item HTTP não
suporta mTLS com certificado de cliente; seria necessário um script proxy (mesmo modelo do
cron acima, com `curl --cert/--key`). Para o cenário atual, o cron de renovação é mais simples.

## Observações

- A LLD de filas depende da LLD de PGs do master (macro `{#PGID}`).
- Counters só são descobertos se já registrados pelos componentes (ex.: `UpdateCounter`).
