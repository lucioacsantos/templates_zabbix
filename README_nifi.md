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

A versão do NiFi em uso autentica via **login → token → Bearer**:

1. O item `NiFi API: Token de acesso (login)` (`nifi.api.token`) faz `POST {$NIFI.URL}/access/token`
   com `{"username":"...","password":"..."}` e registra o token gerado (histórico desabilitado; uso diagnóstico).
2. As demais chamadas executam com **HTTP Basic** (`authtype: BASIC` + `{$NIFI.USER}`/`{$NIFI.PASSWORD}`),
   que a API do NiFi aceita nativamente em todos os endpoints — sem precisar encadear login no item.
3. Se preferir token fixo (ex.: gerado externamente com expiração longa), defina
   `{$NIFI.TOKEN}` no host e troque `authtype` por header `Authorization: Bearer {$NIFI.TOKEN}`.

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
| `{$NIFI.TOKEN}` | Token de acesso (uso manual/scripts; itens usam Basic) |
| `{$NIFI.ROOT_PG_ID}` | ID do Process Group raiz (default `root`) |
| `{$NIFI.PROCESS_GROUPS}` | Lista estática de IDs de PGs. Vazio = descobrir via API |
| `{$NIFI.QUEUE_BACKPRESSURE_PCT}` | % do back pressure p/ trigger (default `80`) |
| `{$NIFI.QUEUE_AGE_MIN}` | Idade máx. (s) do dado na fila (default `300`) |
| `{$NIFI.HEAP_PCT}` | % de heap da JVM p/ trigger (default `85`) |
| `{$NIFI.PROC_STOPPED}` | Processadores inválidos/parados tolerados (default `0`) |
| `{$NIFI.COUNTERS_FILTER}` | Regex p/ filtrar counters (vazio = todos) |
| `{$NIFI.TIMEOUT}` | Timeout HTTP com unidade (default `15s`) |

## Requisitos no NiFi

- Usuário com permissões **read** em `/flow`, `/controller`, `/counters`.
- Endpoints: `/access/token` (login), `/flow/status`, `/flow/process-groups/{id}`,
  `/controller/bulletin-board`, `/controller/diagnostics`, `/flowfile-queues/{id}`, `/counters`.

## Triggers (principais)

- NiFi API sem dados (HIGH)
- Heap JVM > `{$NIFI.HEAP_PCT}%` (WARNING)
- Repositório > `{$NIFI.QUEUE_BACKPRESSURE_PCT}%` (WARNING)
- Threads totais > `{$NIFI.THREADS_MAX}` (WARNING)
- Fila com back pressure > `{$NIFI.QUEUE_BACKPRESSURE_PCT}%` (AVERAGE)
- Fila com dados parados > `{$NIFI.QUEUE_AGE_MIN}s` (AVERAGE)
- Processadores inválidos/parados no PG (AVERAGE)
- Bullets de ERROR no bulletin board (AVERAGE)

## Observações

- A LLD de filas depende da LLD de PGs do master (macro `{#PGID}`).
- Counters só são descobertos se já registrados pelos componentes (ex.: `UpdateCounter`).
