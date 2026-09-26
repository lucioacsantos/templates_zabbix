# Monitoramento OpenShift via Thanos API (by JS)

Este template permite o monitoramento completo de namespaces e containers do OpenShift utilizando a API do Thanos (Querier), eliminando a necessidade de Zabbix Agents nos pods.

## 🚀 Funcionalidades

### 1. Monitoramento de Namespaces (Lvl 1)
- **Disponibilidade**: Status de targets `up` por namespace.
- **Recursos**: 
  - Consumo de CPU e Memória vs Limites (`Limits`).
  - Consumo de CPU e Memória vs Requisições (`Requests`).
  - Monitoramento de `ResourceQuota` (Hard limits) do namespace.
- **Pods**: 
  - Contagem de pods por fase (`Running`, `Pending`, `Failed`, `Unknown`).
  - Alerta de pods não-rodando e pods pendentes.
  - Taxa de restarts de containers (estatística de 1h).
- **HPA (Horizontal Pod Autoscaler)**:
  - Réplicas atuais vs desejadas.
  - Percentual de utilização do HPA (Saturação).
- **Rede e API**:
  - Tráfego de rede RX/TX.
  - Taxa de requisições ao API Server do Kubernetes.
  - Integração com alertas do Prometheus (`firing alerts`).

### 2. Monitoramento de Containers (Lvl 2 - SRE)
- **Descoberta Automática (LLD)**: Identifica containers individualmente por pod.
- **CPU Throttling**: Monitora a perda de performance por limitação de CPU em cada container.
- **Uso de Memória**: Acompanhamento do `working_set_bytes` por container para detecção precoce de riscos de OOMKill.

## ⚙️ Configuração e Macros

Para configurar o template, defina as seguintes macros no host ou no template:

| Macro | Valor Sugerido | Descrição |
|---|---|---|
| `{$THANOS.URL}` | `https://thanos-querier...` | URL base do Thanos Querier (sem barra final). |
| `{$THANOS.TOKEN}` | `Bearer <token>` | Token de Service Account com permissão de leitura. |
| `{$THANOS.NAMESPACES}` | `ns1,ns2` | Lista de namespaces (se vazio, usa LLD via query `up`). |
| `{$THANOS.STEP}` | `60s` | Intervalo de tempo para as queries PromQL. |
| `{$THANOS.CPU_LIMIT_PCT}` | `90` | Gatilho de alerta para uso de CPU (% do limite). |
| `{$THANOS.MEM_LIMIT_PCT}` | `90` | Gatilho de alerta para uso de Memória (% do limite). |
| `{$THANOS.EPS_MAX}` | `1000` | Limite de requisições ao API Server (rps). |

## 🛠️ Requisitos
- **Zabbix**: Versão 6.0 ou superior (recomendado 7.4).
- **Conectividade**: O Zabbix Server/Proxy deve ter alcance HTTP(S) ao endpoint do Thanos Querier.
- **Permissões**: O token fornecido deve ter permissão de `cluster-reader` ou similar no OpenShift.
