# Versão Executiva — 2 Slides (OpenShift/Thanos)

| Público | Duração | Objetivo |
|---|---|---|
| Gerência executiva | 5 min (2 min por slide + 1 min Q&A) | Aprovar implantação do master template e liberar token de leitura no OpenShift |

**Referência:** `template_openshift_thanos.yaml` (Zabbix 7.4) · `artigo_monitoramento_openshift_zabbix_thanos.md`

---

## SLIDE 1 — Problemáticas analisadas (OpenShift)

- Sem visibilidade consolidada **por namespace**: consumo real vs. limites/quotas de cada área desconhecidos
- Falhas descobertas pelo usuário: erros HTTP 5xx, falta de memória (OOMKill) e disco cheio
- CPU *throttling* invisível — degradação silenciosa de performance das aplicações
- Sem tendência histórica: pedidos de capacidade/quota negociados "no feeling"
- Se a fonte de métricas (Thanos) caísse, tudo ficaria sem dados — sem alertar ninguém

> **Fala:** "Na plataforma OpenShift, o problema hoje aparece primeiro para o usuário — não para o plantão."

---

## SLIDE 2 — Soluções implementadas (Template OpenShift Thanos API)

- **Auto-descoberta de namespaces**: todo namespace novo entra em monitoração sozinho (sem agente no cluster)
- 18 métricas por namespace + 2 por container, cobrindo os sinais clássicos: **latência p95, erros 5xx, tráfego e saturação**
- 8 alertas com significado e ação já descritos no próprio alarme: OOMKill, disco >85%, CPU/memória >90% do limite, throttling, restarts
- Segurança: token de **leitura apenas**, guardado como segredo, SSL validado, proxy opcional
- Alerta dedicado se a própria fonte (Thanos) cair — sem pontos cegos

**Decisão solicitada:** aprovar homologação, autorizar service account/token de leitura das métricas e definir o escopo inicial (todos os namespaces ou apenas os críticos).

> **Fala:** "Com um token de leitura e um template master, o que hoje o usuário descobre, passa a ser o alerta que chega antes."