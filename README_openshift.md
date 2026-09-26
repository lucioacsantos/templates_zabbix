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

