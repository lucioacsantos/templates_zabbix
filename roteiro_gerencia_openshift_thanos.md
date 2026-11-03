# Roteiro de Apresentação — Gerência Executiva
## Monitoramento de Namespaces OpenShift via Thanos no Zabbix (Template "OpenShift Thanos API by JS")

| Campo | Valor |
|---|---|
| **Público** | Gerência executiva (TI / Plataforma / Negócio) |
| **Duração** | 20 min (16 min apresentação + 4 min Q&A) |
| **Objetivo** | Aprovar a implantação do master template e a criação do token de leitura (service account) do Thanos |
| **Base** | `template_openshift_thanos.yaml` (Zabbix 7.4) |
| **Artigo de apoio** | `artigo_monitoramento_openshift_zabbix_thanos.md` |

---

## Mensagem-chave (repetir no início e no fim)

> **"A plataforma OpenShift abriga as aplicações em namespaces — e problemas como erro 5xx, falta de memória (OOMKill) e disco cheio hoje aparecem primeiro para o usuário. Este template traz esses sinais para o Zabbix de forma automática: cada namespace novo entra em monitoração sozinho, sem trabalho manual."**

---

## SLIDE 1 — Contexto (2 min)

**O que dizer:**
- No OpenShift, cada aplicação roda em um **namespace** — é a unidade onde medimos CPU, memória, rede, disco e saúde dos pods.
- O cluster já produz métricas (Prometheus), e o **Thanos Querier** é a porta de consulta com histórico consolidado e de longo prazo.
- O Zabbix é o ponto de centralização corporativo de alertas. Este template conecta os dois: **Zabbix coleta via Thanos e transforma métricas em decisões e notificações** — sem agente no cluster, sem custo de licença.

**Princípio do desenho:** o template master **descobre automaticamente os namespaces ativos** (métrica de fase do namespace). Sempre que uma equipe cria um namespace novo, a monitoração nasce junto.

---

## SLIDE 2 — O problema hoje (3 min)

**O que dizer (pontos de dor):**
1. **Visão por namespace não existe** de forma consolidada: não sabemos quanto cada área consome de CPU/memória em relação aos limites que ela própria definiu.
2. **Descoberta reativa:** erros HTTP 5xx e OOMKills são percebidos pelo usuário ou por quem olha logs — não por alerta.
3. **Degradação silenciosa:** *CPU throttling* (container "estrangulado" no limite) derruba performance sem jamais "quebrar" — invisível hoje.
4. **Disco:** volumes (PVC) cheios causam falha de escrita inesperada.
5. **Planejamento de capacidade:** sem tendência histórica, pedidos de quota/limit são negociados "no feeling".
6. **Risco de cegueira:** se a própria fonte (Thanos) cair, tudo fica sem dados — por isso o template alerta de forma explícita sobre a fonte e avisa que incidentes podem estar mascarados.

---

## SLIDE 3 — A solução: o que o template entrega (4 min)

**O que dizer:**
- Um **master template** no Zabbix que exige apenas: URL do Thanos + token de leitura (armazenado como segredo, com validação de SSL e suporte a proxy para redes restritas).
- **18 métricas por namespace descoberto**: CPU e memória usadas, % do limite, % do request, quotas (ResourceQuota), pods rodando/com falha/desconhecidos, restarts na última hora, latência p95, taxa de erros 5xx, tráfego (RPS), uso de disco (PVC %) e OOMKills.
- **Métricas por container** (dentro de cada pod): *CPU throttling* e memória.
- **8 alertas automáticos** criados junto com cada namespace — nenhuma configuração manual por equipe.
- Alinhado aos **4 sinais clássicos de observabilidade** (práticas de excelência da indústria):

| Sinal | Métrica do template |
|---|---|
| Tráfego | Requisições por segundo (RPS) |
| Erros | Taxa de HTTP 5xx |
| Latência | P95 das requisições |
| Saturação | CPU/memória % do limite, disco PVC |

**Ciclo de vida automático:** descoberta a cada 1h; namespaces removidos caducam em 30 dias; frequência de coleta (step) configurável (padrão 60s).

---

## SLIDE 4 — Cobertura de alertas (3 min)

| Severidade | Situação | Significado e ação prevista no alerta |
|---|---|---|
| **High** | Thanos API indisponível (5 min) | Fonte da monitoração caiu — validar rota/token; incidentes podem estar mascarados |
| **High** | **Taxa de erros 5xx > 5%** | Serviços devolvendo erro em escala — verificar logs e dependências |
| **High** | **OOMKill detectado** | Container morto por falta de memória e reiniciado — revisar limit/leak |
| **Average** | Disco (PVC) > 85% | Risco de falha de escrita — ampliar volume ou limpar/rotacionar |
| **Warning** | CPU > 90% do limite (5 min) | Risco de throttling e latência — revisar limits/HPA |
| **Warning** | Memória > 90% do limite (5 min) | OOMKill iminente — agir antes |
| **Warning** | Restarts de containers na última hora | Crashloop / probe falhando — investigar |
| **Warning** | CPU throttling no container | Degradação silenciosa de performance |
| **Warning** | Namespace sem targets "up" | Sonda da aplicação parada **ou** namespace sem monitoração configurada (é demanda de onboarding, não falha) |

**Frase de efeito:** *"Cada alerta já nasce com o 'o que significa' e 'o que fazer' descritos no próprio alarme — o time de plantão não precisa adivinhar."*

---

## SLIDE 5 — Benefícios esperados (2 min)

- **Proatividade:** OOMKill, disco e 5xx detectados por alerta — antes ou no exato momento do sintoma, não pelo usuário.
- **Transparência por área:** consumo por namespace vs. quota/limit dá base objetiva para cobrança, rateio e renegociação de capacidade.
- **Escalabilidade zero-esforço:** namespace novo = monitorado automaticamente; filtro de escopo configurável (todos ou apenas os críticos).
- **Segurança:** token de **leitura apenas**, guardado como segredo no Zabbix; validação de SSL; proxy opcional.
- **Ponto único:** tudo converge para o Zabbix corporativo — mesmo operador, mesmos escalonamentos, mesmo histórico (7 dias de detalhe + 30 dias de tendência por namespace).

---

## SLIDE 6 — Próximos passos e decisões (2 min)

**Pedidos à gerência (objetivo da reunião):**
1. **Aprovar** a implantação do master template (homologação em ambiente de teste).
2. **Plataforma OpenShift:** autorizar **service account de leitura** das métricas e emitir o token para o monitoramento.
3. **Governança de escopo:** decidir entre monitorar **todos os namespaces** (padrão recomendado) ou aplicar filtro (`{$THANOS.NAMESPACES}`) para os críticos primeiro.
4. **Onboarding de monitoração:** definir que namespace sem sonda/target é tratado como pendência de configuração da equipe (não incidente) — já contemplado na semântica dos alertas.
5. **Fase 2 (opcional):** vincular os templates dependentes (Recursos, Pods, Rede, Application, Storage, Events) previstos na arquitetura do master.

---

## SLIDE 7 — Encerramento (1 min)

> **"Com um token de leitura e um template master, o Zabbix passa a enxergar cada namespace do OpenShift — o que hoje a gente descobre pelo usuário, passa a ser descoberto pelo alerta."**

---

## Q&A — perguntas antecipadas

| Pergunta provável | Resposta |
|---|---|
| Quanto custa? | Zero de licença: usa a API Prometheus/Thanos que já existe no OpenShift; só se cria um token de leitura. |
| Impacto no cluster/Thanos? | Só consultas de leitura (queries PromQL leves, ~1 série por namespace); sem agente instalado nos nós. |
| E se o Thanos cair? | Alerta High dedicado em 5 min, com aviso explícito de que incidentes podem estar mascarados — transparência total ao plantão. |
| E a segurança do token? | Token de leitura, tipo segredo (não visível na UI), SSL validado por padrão, proxy suportado. |
| Precisa configurar cada equipe? | Não. Namespaces são descobertos automaticamente. Configuração cabe apenas se quisermos restringir o escopo. |
| E se um namespace não tiver monitoração (sem ServiceMonitor)? | O template diferencia: valor especial indica "sem alvo configurado" — gera demanda de onboarding, não incidente falso. |
| Falsos positivos? | Severidades calibradas (5 min de persistência, limiares 90% limite / 85% disco / 5% erros) e descrições com causa e ação para filtrar o que é ruído operacional. |
| Próximas expansões? | Templates dependentes já previstos no desenho: pods, rede, storage e eventos por namespace. |