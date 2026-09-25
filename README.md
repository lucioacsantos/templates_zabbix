# templates_zabbix

Templates Zabbix com JavaScript embutido para monitorar APIs sem agente.
Todos usam itens HTTP agent com preprocessing JavaScript (Zabbix >= 7.4), macros
para URL/token/credenciais e LLD para descoberta automática de recursos.

## Templates disponíveis

| Arquivo | Template | Função |
|---|---|---|
| `template_openshift_thanos.yaml` | OpenShift Thanos API by JS | Namespaces OpenShift via API Thanos/Prometheus (Thanos Querier) |
| `template_nifi_api.yaml` | Apache NiFi API by JS | Fluxos, filas, recursos e counters do Apache NiFi |

## Estrutura comum

Cada arquivo de export contém 4 templates:

1. **Master** — status da API + LLD (descoberta de namespaces / process groups)
2. **Recursos** — consumo de CPU/memória, % de limites (OpenShift) ou JVM/cluster/storage (NiFi)
3. **Cargas** — pods por fase, restarts (OpenShift) ou filas/back pressure (NiFi)
4. **Extras** — rede, alertas Prometheus, HPA (OpenShift) ou counters (NiFi)

## Requisitos

- Zabbix Server/Proxy >= 7.4
- Conectividade HTTP(S) do Zabbix até a API monitorada
- Credencial de leitura (Bearer token no OpenShift, usuário/senha ou token no NiFi)

## Documentação por template

- [README_openshift.md](./README_openshift.md) — importação, macros, criação de service account/token (`oc`) e teste com `curl`
- [README_nifi.md](./README_nifi.md) — importação, macros, permissões no NiFi e endpoints usados

## Como usar

1. Importe o YAML em *Data collection → Templates → Import*.
2. Vincule os 4 templates do arquivo ao host monitorado.
3. Configure as macros no host (`URL`, `TOKEN`/credenciais, filtros de LLD).
4. Valide a coleta com um `curl` manual (exemplo nos READMEs de cada template).