# Zabbix Template: Apache NiFi API by JS

Monitoramento de fluxos Apache NiFi via API REST (`/nifi-api`), com **JavaScript embutido**
(coleta e processamento no lado do Zabbix). Não requer agente — apenas conectividade HTTP(S)
do Zabbix Server/Proxy até a API do NiFi.

Arquivo: `template_nifi_api.yaml` (export Zabbix 6.0, 4 templates, 23 snippets de JS validados).

## Estrutura

| Template | Função |
|---|---|
| `Apache NiFi API by JS` (master) | Status da API, bulletin board + LLD de Process Groups (threads, filas, flowfiles in/out, bytes, processadores com erro, uptime) |
| `... Cluster Resources` | JVM (heap usado/max/%, GC %, uptime), storage dos repositórios (%), nodes do cluster, threads totais |
| `... Queues` | Por fila (connection): objetos/bytes, % de back pressure (objetos e bytes), idade do dado mais antigo |
| `... Counters` | LLD de counters registrados (ex.: UpdateCounter) com filtro por regex |

## Importação

1. Zabbix UI → *Data collection → Templates → Import*.
2. Selecione `template_nifi_api.yaml` e marque *Create new* / *Update existing*.

## Configuração (macros no host)

| Macro | Descrição |
|---|---|
| `{$NIFI.URL}` | URL base da API (ex.: `https://nifi-host:8443/nifi-api`) |
| `{$NIFI.USER}` / `{$NIFI.PASSWORD}` | Credenciais Basic (usuário/senha de serviço) |
| `{$NIFI.TOKEN}` | Bearer token (se `{$NIFI.AUTH}=bearer`) |
| `{$NIFI.AUTH}` | `basic` (padrão) ou `bearer` |
| `{$NIFI.ROOT_PG_ID}` | ID do Process Group raiz (default `root`) |
| `{$NIFI.PROCESS_GROUPS}` | Lista estática de IDs de PGs. Vazio = descobrir via API |
| `{$NIFI.QUEUE_BACKPRESSURE_PCT}` | % do back pressure p/ trigger (default `80`) |
| `{$NIFI.QUEUE_AGE_MIN}` | Idade máx. (s) do dado na fila (default `300`) |
| `{$NIFI.HEAP_PCT}` | % de heap da JVM p/ trigger (default `85`) |
| `{$NIFI.PROC_STOPPED}` | Processadores inválidos/parados tolerados (default `0`) |
| `{$NIFI.COUNTERS_FILTER}` | Regex p/ filtrar counters descobertos (vazio = todos) |
| `{$NIFI.TIMEOUT}` | Timeout HTTP (s) (default `15`) |
| `{$NIFI.STATUS_NS_TRIGGER}` | Ciclos com API down p/ trigger (default `3`) |

## Requisitos no NiFi

- Usuário/SA com permissões **read** em `/flow`, `/controller`, `/counters`
  (política `read` + `view` nos componentes).
- Endpoints usados: `/flow/status`, `/flow/process-groups/{id}`,
  `/controller/bulletin-board`, `/controller/diagnostics`, `/flowfile-queues/{id}`, `/counters`.

## Teste manual da API (valida URL e credencial)

```bash
curl -sk -u "$NIFI_USER:$NIFI_PASS" \
  "{$NIFI_URL}/flow/status" | head -c 500
```

## Itens por Process Group (LLD)

- Threads ativas, filas (objetos/bytes), FlowFiles in/out (por 5m)
- Bytes lidos/escritos (Bps), uptime dos processadores
- Processadores invalidos/parados (trigger)
- Status raw do PG (para troubleshooting)

## Triggers (principais)

- NiFi API sem dados (HIGH)
- Heap JVM > `{$NIFI.HEAP_PCT}%` (WARNING)
- Repositório de storage > `{$NIFI.QUEUE_BACKPRESSURE_PCT}%` (WARNING)
- Threads totais > `{$NIFI.THREADS_MAX}` (WARNING)
- Fila com back pressure (objetos/bytes) > `{$NIFI.QUEUE_BACKPRESSURE_PCT}%` (AVERAGE)
- Fila com dados parados > `{$NIFI.QUEUE_AGE_MIN}s` (AVERAGE)
- Processadores invalidos/parados no PG (AVERAGE)
- Bullets de ERROR no bulletin board (AVERAGE)

## Observações

- A LLD de filas depende da LLD de PGs do master (macro `{#PGID}`).
- O item `nifi.pg.status[{#PGID}]` (raw TEXT) guarda o JSON completo para troubleshooting.
- Counters do NiFi são criados pelos componentes (ex.: `UpdateCounter`); o template
  só descobre os já registrados.
- Para clusters com HTTPS próprio, ajuste `verify_host=0` no host se o certificado
  não for válido para o FQDN monitorado.