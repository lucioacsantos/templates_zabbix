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

## Renovação automática do token

O NiFi **não** emite tokens de longa duração: o JWT máximo é de **12h** (hardcoded,
`StandardBearerTokenProvider.MAXIMUM_EXPIRATION`) e o single-user login gera tokens de **8h** fixos.
Não existe "API token"/"service token" na UI nem via CLI.

Para o Zabbix, o token é renovado automaticamente pelo script `renovar_nifi_token.sh`
(login no NiFi + atualização de `{$NIFI.TOKEN}` via API do Zabbix).

Instalação:

```bash
chmod +x renovar_nifi_token.sh
# executar manualmente para validar:
./renovar_nifi_token.sh
# instalar no crontab (renova a cada 7h — folga de 1h antes da expiração de 8h):
( crontab -l 2>/dev/null; \
  echo "0 */7 * * * $PWD/renovar_nifi_token.sh >> $HOME/renovar-nifi-token.log 2>&1" ) | crontab -
```

Log de execução: `~/renovar-nifi-token.log`. Variáveis ajustáveis no topo do script
(`ZABBIX_HOST_NAME`, `ZABBIX_MACRO`, `NIFI_TOKEN_URL`).

### Alternativa oficial: mTLS com client certificate

A recomendação oficial do NiFi para automação/monitoramento é autenticação por
**certificado de cliente (X.509)** — sem tokens/renovação. No Zabbix, um item HTTP não
suporta mTLS com certificado de cliente; seria necessário um script proxy (mesmo modelo do
cron acima, com `curl --cert/--key`). Para o cenário atual, o cron de renovação é mais simples.

## Observações

## Observações

- A LLD de filas depende da LLD de PGs do master (macro `{#PGID}`).
- Counters só são descobertos se já registrados pelos componentes (ex.: `UpdateCounter`).
