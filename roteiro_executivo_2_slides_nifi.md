# Versão Executiva — 2 Slides (NiFi)

| Público | Duração | Objetivo |
|---|---|---|
| Gerência executiva | 5 min (2 min por slide + 1 min Q&A) | Aprovar implantação do template NiFi v3 em HML e liberar pré-requisitos |

**Referências:** chamado DBT-6131 · TO-BE AMCOM Onda 0 (§1.1, 1.3, 1.4, 1.6) · Arq. de Referência §7.4

---

## SLIDE 1 — Problemáticas analisadas (NiFi — 19 desvios do TO-BE)

- Alerta de "disco cheio" media, na verdade, a memória da JVM — risco de a plataforma parar de gravar dados sem aviso
- Fluxos parados **dentro de subgrupos** sem detecção; contadores de threads e erros sempre zero
- 35 falsos positivos registrados só na homologação — alertas que o time aprende a ignorar
- Monitoramento fazia login no AD **1.440×/dia** (risco de bloqueio da conta) e o token expirava sem aviso
- Limiares fora do padrão (heap 85% vs 80%) e sem histórico para planejamento de capacidade

> **Fala:** "Quando descobríamos um fluxo parado, já era tarde — muitas vezes, pelo usuário."

---

## SLIDE 2 — Soluções implementadas (Template NiFi v3)

- **Descoberta automática de fluxos** via API REST (sem agente): 16 métricas + 5 alertas criados sozinhos por fluxo
- **Anti-ruído**: alerta de fluxo parado só para os que devem rodar (lista do Desenvolvimento)
- Correções: disco real com alertas 70%/90%, heap em 80%, GC/threads/erros reais
- Token renovado automaticamente com "batimento" no Zabbix — falha alertada 8h antes de parar a coleta; login reduzido a 1×/hora (−98% no AD)
- Retenção: 31 dias de detalhe + 400 dias de tendência para decisões de capacidade

**Decisão solicitada:** aprovar homologação em HML, envio da lista de fluxos críticos (Desenvolvimento) e agendar playbook/cron do token + agent 2 Linux nas VMs.

> **Fala:** "Implantando este template, trocamos 'descobrir o incidente pelo usuário' por 'detectar a degradação antes do incidente' — com menos alertas, não com mais."