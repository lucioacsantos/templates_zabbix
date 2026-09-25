# templates_zabbix

Templates Zabbix com JavaScript embutido para monitorar APIs sem agente.

## Templates disponíveis

| Arquivo | Template | Função |
|---|---|---|
| `template_openshift_thanos.yaml` | OpenShift Thanos API by JS | Namespaces OpenShift via API Thanos/Prometheus |
| `template_nifi_api.yaml` | Apache NiFi API by JS | Fluxos, filas e counters do Apache NiFi |

Documentação detalhada: [README_openshift.md (Thanos)](./README_openshift.md) | [README_nifi.md (NiFi)](./README_nifi.md)

Todos usam itens HTTP agent com preprocessing JavaScript (Zabbix >= 7.4), macros
para URL/token/credenciais e LLD para descobrir namespaces (OpenShift) ou
process groups/queues/counters (NiFi).