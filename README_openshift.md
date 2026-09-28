# Monitoramento OpenShift via Thanos API (by JS)

Este template fornece visibilidade completa do ecossistema OpenShift, desde a infraestrutura de pods e containers até os sinais dourados (Golden Signals) de aplicação, utilizando a API do Thanos (Querier).

## 🚀 Funcionalidades e Arquitetura

O monitoramento é dividido em templates dependentes para modularização e escalabilidade:

### 1. Infraestrutura e Recursos (Core)
- **Namespaces**: Descoberta automática e status de disponibilidade.
- **Recursos**: Monitoramento de CPU e Memória vs Limits e Requests.
- **Pods**: Ciclo de vida dos pods (Running, Pending, Failed) e taxa de restarts.
- **HPA**: Saturação e escalonamento de réplicas.
- **Containers**: LLD individual por container com detecção de **CPU Throttling**.

### 2. Golden Signals de Aplicação (L7)
- **Latência**: Acompanhamento do p95 de tempo de resposta HTTP.
- **Erros**: Taxa de erro HTTP 5xx em tempo real.
- **Tráfego**: Volume de requisições por segundo (RPS).

### 3. Persistência e Eventos (SRE)
- **Storage**: Monitoramento de uso de volumes persistentes (PVC) com alerta de disco cheio (>85%).
- **Eventos**: Detecção imediata de **OOMKills** (Out-of-Memory) por namespace.

## ⚙️ Configuração e Macros

| Macro | Valor Sugerido | Descrição |
|---|---|---|
| `{$THANOS.URL}` | `https://thanos-querier...` | URL base do Thanos Querier. |
| `{$THANOS.TOKEN}` | `Bearer <token>` | Token de Service Account com permissão de leitura. |
| `{$THANOS.NAMESPACES}` | `ns1,ns2` | Lista de namespaces (vazio = LLD automática). |
| `{$THANOS.STEP}` | `60s` | Intervalo para as queries PromQL. |
| `{$THANOS.CPU_LIMIT_PCT}` | `90` | Trigger de CPU (% do limite). |
| `{$THANOS.MEM_LIMIT_PCT}` | `90` | Trigger de Memória (% do limite). |
| `{$THANOS.EPS_MAX}` | `1000` | Limite de requisições ao API Server (rps). |

## 🛠️ Requisitos
- **Zabbix**: Versão 6.0+ (recomendado 7.4).
- **Conectividade**: Acesso HTTP(S) do Zabbix Server/Proxy ao Thanos Querier.
- **Permissões**: Token com role `cluster-reader`.

## 🧪 Testes de Conectividade (cURL)

Antes de aplicar o template, valide a conectividade a partir do **host do Zabbix Server/Proxy** (e não de outra máquina), pois é de lá que os itens HTTP farão as requisições.

```bash
THANOS_URL="https://thanos-querier-openshift-monitoring.apps.cluster.example"
THANOS_TOKEN="$(oc create token prometheus-k8s -n openshift-monitoring)"  # ou cat /path/to/token

# 1. Teste básico de conectividade e autenticação (mesma query do item "Thanos: Get up" do template)
curl -sS -w '\nHTTP_CODE: %{http_code}\n' \
  -H "Authorization: Bearer ${THANOS_TOKEN}" \
  "${THANOS_URL}/api/v1/query?query=up"

# 2. Se {$THANOS.VERIFY_HOST}=0 (SSL autoassinado do cluster), adicione -k:
curl -sSk -w '\nHTTP_CODE: %{http_code}\n' \
  -H "Authorization: Bearer ${THANOS_TOKEN}" \
  "${THANOS_URL}/api/v1/query?query=up"

# 3. Teste simulando uma query de LLD por namespace (como no discovery do template)
NS="meu-namespace"
curl -sSk -H "Authorization: Bearer ${THANOS_TOKEN}" \
  --data-urlencode "query=count(up{namespace=~\"${NS}\"})" \
  --data-urlencode "step=60" \
  -G "${THANOS_URL}/api/v1/query"
```

Interpretação dos resultados:

| Resultado | Significado |
|---|---|
| `HTTP_CODE: 200` + JSON com `"status":"success"` | Conectividade OK (mesma resposta que o Zabbix espera) |
| `HTTP_CODE: 401 / 403` | Token inválido/expirado ou sem role `cluster-reader` |
| `HTTP_CODE: 000` + erro de conexão | DNS/firewall — o host Zabbix não alcança o Querier (rota do OpenShift) |
| Timeout (exit code 28) | Porta bloqueada entre Zabbix Server/Proxy e a rota |

