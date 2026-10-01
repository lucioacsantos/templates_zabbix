# templates_zabbix

Templates Zabbix com JavaScript embutido para monitorar APIs sem agente.
Todos usam itens HTTP agent com preprocessing JavaScript (Zabbix >= 7.4), macros
para URL/token/credenciais e LLD para descoberta automática de recursos.

## Templates disponíveis

| Arquivo | Template | Função |
|---|---|---|
| `template_openshift_thanos.yaml` | OpenShift Thanos API by JS | Namespaces OpenShift via API Thanos/Prometheus (Thanos Querier) |
| `template_nifi_api.yaml` | Apache NiFi API by JS | Fluxos, filas, recursos e counters do Apache NiFi |

## Playbooks Ansible disponíveis

| Arquivo | Função |
|---|---|
| `dynatrace_sinteticos_sob_demanda.yml` | Executa sintéticos Dynatrace sob demanda via API v2, compatível com Survey do AAP |
| `renovar_nifi_token.yml` | Renova o token do Apache NiFi e atualiza a macro no Zabbix |

### Dynatrace — Execução de Sintéticos sob Demanda

Dispara um ou mais monitores sintéticos do Dynatrace via API v2 (batch execution),
aguarda a conclusão com polling e reporta o resultado de cada execução.

**Uso no AAP:** configure um Job Template apontando para `dynatrace_sinteticos_sob_demanda.yml`
e adicione o Survey descrito em [`dynatrace_sinteticos_survey.md`](./dynatrace_sinteticos_survey.md).

**Requisitos:**
- Ansible >= 2.9 / AAP 2.x
- Token Dynatrace com escopos `syntheticExecutions.write` e `syntheticExecutions.read`
- Conectividade HTTPS do executor até `https://<environment-id>.live.dynatrace.com`

**Variáveis principais (Survey):**

| Variável | Obrigatório | Descrição |
|---|---|---|
| `dynatrace_environment_id` | Sim | ID do tenant Dynatrace |
| `dynatrace_api_token` | Sim | Token de API (usar Credencial Customizada no AAP) |
| `synthetic_monitor_ids` | Sim | IDs separados por vírgula: `HTTP_CHECK-AAA,SYNTHETIC_TEST-BBB` |
| `synthetic_locations` | Não | IDs de locais separados por vírgula (padrão: locais do monitor) |
| `processing_mode` | Não | `STANDARD` / `DISABLE_PROBLEM_DETECTION` / `EXECUTIONS_DETAILS_ONLY` |
| `fail_on_performance_issue` | Não | Falhar em degradação de performance (padrão: `false`) |
| `stop_on_problem` | Não | Não agendar se houver problema ativo (padrão: `false`) |
| `poll_interval_seconds` | Não | Intervalo de polling em segundos (padrão: `10`) |
| `poll_max_attempts` | Não | Tentativas máximas de polling (padrão: `30`) |

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