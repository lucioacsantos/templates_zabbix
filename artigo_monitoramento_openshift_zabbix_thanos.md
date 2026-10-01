# Monitorando OpenShift com Zabbix e Thanos: template agentless, laboratório local e o caminho até o Golden Signals

> **Resumo** — Este artigo documenta a engenharia completa por trás de um template Zabbix que monitora namespaces de um cluster OpenShift **sem agente**, usando a API do Thanos Querier como fonte de métricas. Cobrimos: a infraestrutura de laboratório (Docker + Kind + kube-prometheus-stack + Thanos), o funcionamento interno do template (LLD, JavaScript embutido, PromQL), o alinhamento com práticas SRE (Golden Signals, limites de recursos, throttling, OOMKills) e um problema real de produção — o HTTP 400 do router do OpenShift — com a análise e a correção do encoding de URLs.

---

## 1. Por que monitorar OpenShift sem agente?

Clusters OpenShift já expõem, nativamente, um stack de observabilidade consolidado: Prometheus, kube-state-metrics, cAdvisor e node-exporter, agregados pelo **Thanos Querier** — uma camada de consulta federada (`/api/v1/query` compatível com Prometheus) que centraliza métricas de todos os componentes do cluster.

Instalar agente Zabbix em cada node de um cluster gerenciado é, na maioria dos casos, inviável operacionalmente (permissões no worker, ciclo de vida dos nodes, política de imagens). A alternativa elegante é **não instalar nada no cluster**: o Zabbix Server consome a API do Thanos via itens do tipo `HTTP agent`, executa PromQL e faz o parsing do JSON com **JavaScript embutido** no preprocessing — uma abordagem *pull-based*, sem lado esquerdo de coleta, que requer apenas:

- Zabbix Server/Proxy **7.4+** (suporte a JavaScript no preprocessing de itens HTTP);
- Conectividade HTTP(S) do Zabbix até a rota do Thanos Querier;
- Um Bearer token de service account com permissão de leitura (`cluster-reader`).

O template discutido aqui (`OpenShift Thanos API by JS`) é distribuído como um único YAML de export Zabbix 7.4 e cobre infraestrutura, Golden Signals de aplicação, storage e eventos do cluster.

---

## 2. A infraestrutura local de desenvolvimento

Nenhum template sério nasce sem um cluster de teste. A configuração abaixo reproduz, em um único host, todos os componentes do cenário real — inclusive a rede, que foi a fonte de algumas descobertas interessantes durante o desenvolvimento.

### 2.1 Visão geral do laboratório

| Componente | Tecnologia | Papel no laboratório |
|---|---|---|
| Cluster Kubernetes de teste | **Kind** (`kindest/node:v1.37.0`) — container `zabbix-test-control-plane` | Simula o cluster OpenShift ("alvo" do monitoramento) |
| Stack de métricas | **kube-prometheus-stack** (Prometheus 3/3 + kube-state-metrics + node-exporter) | Fonte das métricas de namespace/pods/containers |
| Thanos Querier | **`quay.io/thanos/thanos:v0.39.2`** (deployment `thanos-query` + sidecar no StatefulSet do Prometheus) | API compatível `/api/v1/query` consumida pelo Zabbix |
| Zabbix Server | Container `zabbix/zabbix-server-mysql:alpine-7.4-latest` (7.4.15) | Executa os itens HTTP_AGENT do template |
| Zabbix Frontend | Container `zabbix/zabbix-web-nginx-mysql:alpine-7.4-latest` | Interface de operação/depuração |
| Banco | Container `mysql:8.0-oracle` | Backend do Zabbix |
| Alvo de workload | `nginx-test` (2 réplicas, namespace `default`) | Gera métricas de pods para a LLD descobrir |

Tudo é orquestrado por Docker Compose (implícito na topologia) sobre uma **rede Docker dedicada**:

```
+---------------------------------------------------------------
|  rede Docker: zabbix-net (172.20.240.0/16)
|
|   mysql-server (172.20.240.4)
|        |
|   zabbix-server-mysql (172.20.240.3)  <--- itens HTTP_AGENT
|        ^                                  coletando PromQL
|   zabbix-web-nginx-mysql (172.20.240.2)
|
|   kind / zabbix-test-control-plane (172.20.240.5)
|        |-- NodePort 30901 --> svc/thanos-query (monitoring)
|        |-- NodePort 30900 --> svc/prometheus-nodeport
|        +-- namespaces: default, kube-system, monitoring, local-path-storage
+---------------------------------------------------------------
```

Um detalhe de desenho que fez diferença: o container do **Kind foi conectado tanto à rede `zabbix-net` quanto à rede `kind`** (sua rede padrão). Isso permite que o Zabbix Server alcance o NodePort do Thanos diretamente pelo IP do node (`172.20.240.5:30901`), sem port-forward, sem ingress e sem expor nada ao host físico. Em clusters Kind, `docker network connect kind <node>` + NodePort é o caminho mais curto entre o mundo Docker e o mundo Kubernetes.

### 2.2 O cluster Kubernetes de teste (Kind)

Dentro do node Kind, o namespace `monitoring` foi provisionado com o kube-prometheus-stack, e duas peças foram adicionadas para simular a anatomia da observabilidade do OpenShift:

**1. Thanos Query (deployment):**

```yaml
image: quay.io/thanos/thanos:v0.39.2
# serviço exposto como NodePort:
svc/thanos-query   Type=NodePort   9090:30901/TCP
```

**2. Thanos Sidecar (StatefulSet do Prometheus)** — o Prometheus roda como `sts prometheus-prometheus-kube-prometheus-prometheus` com os containers `prometheus`, `config-reloader` e `thanos-sidecar`. É esse sidecar que provê os dados ao Querier, replicando a topologia do `openshift-monitoring` (onde o Thanos Querier agrega Prometheus + Thanos Ruler por cluster).

A validação da fonte, direto de dentro do container do Zabbix Server — mesma jornada que os itens HTTP farão em produção:

```bash
docker exec zabbix-server-mysql curl -sS \
  'http://172.20.240.5:30901/api/v1/query?query=up'
# {"status":"success","data":{"resultType":"vector",
#  "result":[{"metric":{"__name__":"up","namespace":"monitoring",... }}]}}
```

E a query de descoberta usada pela LLD do template:

```bash
docker exec zabbix-server-mysql curl -sS \
  'http://172.20.240.5:30901/api/v1/query?query=kube_namespace_status_phase%7Bphase%3D%22Active%22%7D'
# retorna os namespaces Active: default, kube-system, monitoring
```

### 2.3 O host de teste no Zabbix

O template foi importado via **API do Zabbix** (`template.import`, método JSON-RPC) por scripts Python no diretório `scripts_teste/`, e um host de teste centraliza a configuração:

| Propriedade | Valor |
|---|---|
| Nome | `OpenShift Test Cluster` |
| Templates | `OpenShift Thanos API by JS` (link único — os dependentes são auto-aplicados pela LLD) |
| `{$THANOS.URL}` | `http://172.20.240.5:30901` |
| `{$THANOS.TOKEN}` | `<SECRET_TEXT>` (macro tipo segredo, nunca exibida na UI nem em export) |
| `{$THANOS.NAMESPACES}` | `default,kube-system,monitoring` |

O loop de desenvolvimento foi: editar YAML → importar via API → executar os itens → ler os valores via `item.get` → corrigir. Uma execução real do item master após a convergência do lab mostra a LLD funcionando:

```json
{
  "status": "success",
  "targets_total": 15,
  "targets_up": 11,
  "targets_down": 4,
  "namespaces": ["default", "kube-system", "monitoring"]
}
```

E os itens prototipados por namespace coletando (ex.: `Namespace monitoring: Status (up targets)` → `1`).

### 2.4 A automatização dos testes (scripts_teste/)

O diretório `scripts_teste/` contém ~25 scripts Python que formam uma suíte artesanal de integração — cada um com um papel no ciclo debug-ajuste-recerto:

| Script | Função |
|---|---|
| `check_api.py` / `test_import.py` | Verifica versionamento e importa o YAML via `template.import` com regras de `createMissing/updateExisting/deleteMissing` |
| `set_token_macro.py` / `update_url.py` | Configura as macros do host (token como `type=1`/SECRET, URL apontando ao NodePort do lab) |
| `check_lld_values.py` / `check_status.py` / `verify_data.py` | Consulta `discoveryrule.get` / `item.get` para validar LLD e valores coletados |
| `debug_macros.py` / `debug_item_url.py` | Depura resolução de macros em URLs de itens (a origem do bug do 400) |
| `trigger_item.py` / `trigger_lld.py` | Força execução (`item.execute`/novo check) de itens e regras LLD sem esperar o delay de 1h da LLD |
| `fix_*.py` / `validate_uuids.py` | Regenera UUIDv4 válidos do export e valida unicidade |

Este ciclo — script → API → leitura de estado — substitui com precisão o `curl` manual + click na UI, e escala bem quando o template tem dezenas de itens e protótipos.

**Nota sobre o 400**: um dos aprendizados do lab apareceu como o caso mais interessante — três itens funcionavam no Kind (que expõe HTTP direto, sem router intermediário) mas quebravam com `400 Bad request` (`<h1>Your browser sent an invalid request</h1>`) no OpenShift real. A causa: a URL de três itens **não estava URL-encoded** — espaços e parênteses crus em queries PromQL como `100 * sum(kubelet_volume_stats_used_bytes{...}) / sum(...)`. O router do OpenShift (e intermediários como HAProxy) rejeitam URLs com espaço literal, enquanto o NodePort do lab aceita. A correção foi normalizar os três itens ao padrão do restante do template (`%20` para espaço, `%2F` para divisão, linha única no YAML) — um exemplo perfeito de por que o lab **não** deve ser *idêntico* à produção: intermediários de rede expõe classes de erro que o lab limpo esconde.

---

## 3. Funcionamento do template

### 3.1 Arquitetura: master + descoberta com auto-linkage

O export contém um **template master** que concentra toda a lógica. A LLD de namespaces (`thanos.discovery.descoberta_de_namespaces`) executa uma query PromQL e produz uma linha por namespace:

```promql
kube_namespace_status_phase{phase="Active"}
```

O JavaScript de preprocessing da LLD faz três coisas: valida o envelope da resposta (`status !== 'success'` → `throw`), aplica o filtro `{$THANOS.NAMESPACES}` como **regex OU** (lista por vírgula ou pipe; vazio = todos os namespaces ativos) e emite `{#NSNAME}`. Uma melhoria importante foi fazer a LLD **falhar com mensagem explícita** quando nenhum namespace casa com o filtro — em vez de retornar vazio silenciosamente, o que deixa itens órfãos e host inflado.

A LLD usa **`template_linkage`**: para cada `{#NSNAME}` descoberto, os templates dependentes (Resource Limits, Pods, Containers, Application, Storage, Events) são vinculados automaticamente. O operador linka apenas o master no host — a partir daí, todo namespace novo é monitorado sem intervenção.

### 3.2 O padrão de item: HTTP agent + JavaScript

Cada métrica segue um padrão único e auditável — item `HTTP_AGENT`, GET na API, header `Authorization: Bearer {$THANOS.TOKEN}`, e um preprocessing JavaScript de três linhas que:

1. **Valida o envelope** (status da Thanos API) e falha com mensagem clara;
2. **Extrai o valor** do primeiro série (ou soma/agrega quando a query retorna múltiplas);
3. **Degrad gracefully**: série vazia (`result.length = 0`) → retorna `0` em vez de "unsupported" (evita alertas de coleta para namespaces sem determinada métrica — ex.: aplicação sem histograma HTTP).

A query é embutida na URL — já URL-encoded (`%7B %22 %3D~ %5B %20 %2C`):

```
{$THANOS.URL}/api/v1/query?query=100%20*%20sum(rate(container_cpu_usage_seconds_total%7Bnamespace%3D~%22{#NSNAME}%22%2Ccontainer%21%3D%22%22%2Cimage%21%3D%22%22%7D%5B{$THANOS.STEP}%5D))%20%2F%20sum(kube_pod_container_resource_limits%7B...%2Cresource%3D%22cpu%22%7D)
```

### 3.3 Cobertura de métricas

**Infraestrutura (Core):**
- Status do serviço (item master, com valormap OK/FALHA + trigger HIGH);
- Targets `up` por namespace;
- CPU (millicores) e memória (bytes) — `container_cpu_usage_seconds_total` / `container_memory_working_set_bytes`;
- **CPU/Memória % do limite** — razão entre uso e `kube_pod_container_resource_limits`;
- **CPU/Memória % do request** — para medir sobreposição de requests vs. uso;
- ResourceQuota (hard) de CPU/memória por namespace;
- Pods por fase (Running/Failed/Unknown) e restarts na última hora.

**Golden Signals (L7):**
- **Latência p95**: `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{...}[{$THANOS.STEP}])) by (le))`;
- **Taxa de erro 5xx**: razão `http_requests_total{status=~"5.."}` vs. total, em %;
- **Tráfego**: RPS total por namespace.

**Storage / Events (SRE):**
- Uso de PVC (`kubelet_volume_stats_used_bytes` / `capacity`) em %;
- OOMKills (`kube_pod_container_status_terminated_reason{reason="OOMKilled"}`) com trigger por `change()`;
- LLD de containers por namespace/pod/container com **CPU throttling** (`container_cpu_cfs_throttled_periods_total`).

### 3.4 Triggers com threshold em macro

Todos os thresholds são macros (`{$THANOS.CPU_LIMIT_PCT}`, `{$THANOS.MEM_LIMIT_PCT}`, `{$THANOS.EPS_MAX}`, `{$THANOS.HPA_MIN_PCT}`...), e os triggers usam funções de janelas (`min(...,5m)`, `max(...,{$THANOS.STATUS_NS_TRIGGER})`, `change()`) para evitar flapping. Tags em todos os triggers (`namespace`, `pod`, `scope: availability/performance/capacity`) habilitam filtragem e integração com ITSM/event routing.

---

## 4. Pontos fortes

1. **Zero footprint no cluster**: sem DaemonSet, sem RBAC custom, sem image scanning de agente. Só o token de leitura.
2. **LLD de namespaces com regência total**: filtro por macro regex (`{$THANOS.NAMESPACES}`), falha explícita quando não descobre nada, lifetime de 30d para limpar itens de namespaces removidos.
3. **Auto-linkage de templates dependentes**: um link no host → seis domínios de observabilidade ativos por namespace.
4. **JavaScript sem dependências externas**: o parsing vive no item (versionado no YAML, auditável no git), sem script externo, sem `UserParameter`, sem master item encadeado.
5. **Triggers calibrados por janela** (`min/max` de 5-10m), com `manual_close: YES` e tags estruturadas — pronto para triagem e correlação.
6. **Macros seguras**: token `SECRET_TEXT` — o valor nunca aparece na UI, em export ou em logs de item.
7. **Suíte de teste automatizada**: o ciclo de desenvolvimento (import via API, execução forçada de itens, validação de LLD) é todo scriptado e reproduzível.
8. **Testes de conectividade documentados**: `README_openshift.md` traz cURLs para validar DNS/firewall/RBAC/SSL **a partir do host do Zabbix** antes de aplicar o template.

---

## 5. Alinhamento com as boas práticas SRE

O template foi desenhado sobre as diretrizes clássicas de SRE (Google SRE Workbook):
- **Golden Signals completos**: latência (p95), tráfego (RPS), erros (% 5xx) e saturação (CPU/limites, memória/limites, PVC) — os quatros sinais por namespace;
- **SLOs implícitos via limites do Kubernetes**: os triggers de CPU/memória % do limite (`min(...,5m) > 90%`) atuam como proxy de saturação e antecipam throttling/OOMKill;
- **Detecção de causas clássicas**: OOMKill por `change()`, CPU throttling por container (CFS) e restarts por janela — os três "quase-acidentes" mais comuns em workloads k8s;
- **Sinais antes de sintomas**: disco de PVC em % com threshold de 85% dispara antes do `DiskPressure` do kubelet;
- **Alerting econômico**: janelas de avaliação de 5m, `manual_close` e prioridades calibradas (WARNING para degradação, HIGH para indisponibilidade/erros 5xx) — sem alert storm em blips;
- **Observabilidade do próprio monitor**: o item master monitora a saúde do Thanos, separando "falha do cluster" de "falha da coleta" (o item master cai ≠ cluster cai).

---

## 6. Vantagens do modelo (agentless + JS + LLD)

| Dimensão | Benefício |
|---|---|
| **Operação** | Nada para instalar/atualizar/remover no cluster. Ciclo de vida do template separado do ciclo de vida do cluster. |
| **Segurança** | Superfície mínima: token read-only em macro segredo, sem porta de agente exposta nos nodes, sem rodar container privilegiado. |
| **Escalabilidade** | LLD + linkage automático: escala de 1 para N namespaces sem trabalho adicional de configuração. |
| **Manutenção** | Template versionado em Git, com mudanças auditáveis (`git log` como changelog) e re-deploy via API. |
| **Custo cognitivo** | Um único padrão de item (HTTP + JS) para todas as métricas — troubleshooting uniforme. |
| **Independência de plataformas** | A API do Thanos é compatível com Prometheus: o mesmo padrão funciona em RKS, EKS, GKE, Rancher ou OpenShift — muda só a URL. |
| **Aproveitamento do Prometheus nativo** | As métricas do stack de observabilidade do OpenShift, sem duplicar instrumentação. |

---

## 7. Conclusão

O case documenta um caminho completo: da infraestrutura de laboratório (Kind + kube-prometheus-stack + Thanos + Zabbix 7.4 em containers, numa única rede Docker) à produção em OpenShift, passando por uma suíte de testes via API Zabbix e um bug real de encoding de URL resolvido comparando o comportamento do router de produção com o NodePort "confiável" do lab.

O resultado é um template **declarativo, versionado e reproduzível** que transforma o Zabbix em um consumidor first-class do stack de observabilidade nativo do Kubernetes — sem agente, sem instrumentação duplicada, e com Golden Signals prontos por namespace.

---

### Apêndice A — Comandos do laboratório (resumo)

```bash
# rede dedicada + Kind com NodePort mapeado
docker network create zabbix-net
docker network connect zabbix-net zabbix-test-control-plane

# validação da fonte (jornada do item HTTP)
docker exec zabbix-server-mysql curl -sS \
  'http://172.20.240.5:30901/api/v1/query?query=up'

# import e teste do template via API Zabbix
venv/bin/python scripts_teste/test_import.py
venv/bin/python scripts_teste/check_lld_values.py
```

### Apêndice B — Query PromQL do template (exemplo: p95 de latência)

```promql
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket{namespace=~"prd-prtl"}[60s]))
  by (le)
)
```

*(No YAML, a URL é inteira url-encoded — `histogram_quantile(0.95%2C%20sum(...)...` — para atravessar routers reversos como o do OpenShift, que rejeitam espaços literais em URLs.)*