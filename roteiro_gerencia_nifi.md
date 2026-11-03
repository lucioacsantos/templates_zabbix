# Roteiro de Apresentação — Gerência Executiva
## Monitoramento Avançado do Apache NiFi no Zabbix (Template v3 — DBT-6131)

| Campo | Valor |
|---|---|
| **Público** | Gerência executiva (TI / Negócio) |
| **Duração** | 20 min (16 min apresentação + 4 min Q&A) |
| **Objetivo** | Aprovar a implantação do template v3 (homologação em HML → produção) e formalizar a lista de fluxos críticos |
| **Referência** | Chamado DBT-6131 · TO-BE AMCOM Onda 0 (§1.1, 1.3, 1.4, 1.6) · Arquitetura de Referência §7.4 |
| **Base** | `template_nifi_api_v3-ajustes_AMCOM.yaml`, `AJUSTES_ZABBIX_NIFI_RESUMO.md` (19 alterações) |

---

## Mensagem-chave (repetir no início e no fim)

> **"Cada fluxo parado do NiFi é um dado que deixa de fluir para o negócio. Hoje a gente descobre isso tarde — ou por reclamação do usuário. Com este template, detectamos antes, com menos ruído e com histórico para planejamento."**

---

## SLIDE 1 — Contexto (2 min)

**O que dizer:**
- O NiFi é a plataforma que move os dados da companhia (ingestão, integração e distribuição entre sistemas).
- O monitoramento atual no Zabbix existe, mas uma auditoria técnica alinhada ao TO-BE AMCOM (chamado DBT-6131) identificou **19 desvios** entre o que está implantado e o que a arquitetura exige.
- A v3 do template corrige todos os 19 pontos, sem alterar o NiFi e sem instalar agente na plataforma:

**Dado de apoio:** 19 alterações homologadas · template 100% via API REST (Bearer token) · requer Zabbix Server/Proxy ≥ 7.4.

---

## SLIDE 2 — O problema em linguagem de negócio (3 min)

**O que dizer (pontos de dor):**
1. **Medição errada:** o alerta de "disco quase cheio" media, na verdade, a memória da JVM — risco de a plataforma parar de gravar dados sem aviso.
2. **Ruído:** 35 falsos positivos registrados só na homologação (portas sem conexão lidas como falha) — alertas que a equipe aprende a ignorar.
3. **Ponto cego:** fluxo parado **dentro de subgrupos** não gerava alerta; contadores de threads e erros retornavam sempre zero.
4. **Risco de continuidade:** o monitoramento fazia login no AD **1.440 vezes por dia** — praxe para bloqueio da conta e morte silenciosa da coleta; e a renovação do token (válido ~8h) falhava invisivelmente.
5. **Sem memória:** retenção curta impedia comparar meses e planejar capacidade.

**Frase de efeito:** *"Ninguém sabia se o fluxo parou porque a carga aumentou, se porque quebrou — ou se simplesmente não avisou."*

---

## SLIDE 3 — A solução: o que o template v3 entrega (4 min)

**O que dizer (arquitetura da entrega):**
- Template master + sub-templates (**Cluster Resources** — JVM/Storage/cluster e **Counters**), todos sem agente, autenticados por token com macros do tipo **secreta** (nunca expostas na interface).
- **Descoberta automática de fluxos**: uma chamada recursiva à API detecta todos os Process Groups e cria, sozinha, **16 métricas por fluxo** (volume em 5 min, filas, threads, processador mais lento, versionamento) e **5 alertas por fluxo**.

**Correções que eliminam risco:**
| Antes | Depois |
|---|---|
| Disco dos repositórios medido errado | Métrica real, com alertas em **70% (Warning)** e **90% (High)** |
| Login no AD 1.440×/dia | **1×/hora** (diagnóstico) → −98% de tentativas |
| Token vence sem aviso | Renovação automática (playbook/cron) + "batimento" no Zabbix; se faltar por 8h → **alerta High antes da coleta morrer** |
| Heap alertando em 85% | **80%**, conforme TO-BE |
| GC e threads sempre zero | Valores reais, com tendência de 400 dias |
| Erros do bulletin board perdidos | Contador numérico confiável + alerta |

**Governança:** componentes antigos ficam **desativados (não excluídos)** até a homologação — reversível a qualquer momento; conta usa privilégio mínimo (apenas leitura).

---

## SLIDE 4 — Cobertura de alertas (3 min)

**O que dizer:** "Cada alerta tem dono, severidade e significado de negócio pré-definidos."

| Severidade | Situação | Impacto de negócio |
|---|---|---|
| **High** | API do NiFi fora (3 min) / coleta de fluxos parou | Sem visibilidade — possível incidente mascarado |
| **High** | Fluxo crítico **parado ou inválido** (só para fluxos da lista) | Dado deixou de fluir |
| **High** | Fila em **contrapressão** (100%) | NiFi pausando upstream; atraso em cascata |
| **High** | Repositório **≥ 90%** | Risco de parada da plataforma |
| **High** | Renovação do token falhou (sem sinal 8h) | Coleta morrerá em breve — prevenção |
| **Warning** | Fila ≥ 80% · Heap ≥ 80% · Repositório ≥ 70% | Degradação antecipada — agir antes do incidente |
| **Average** | Erros (bulletin board) registrados | Sintoma interno a investigar |
| **Info** | Alteração não versionada no fluxo | Governança de mudança |

**Dado de apoio:** anti-ruído é explícito: o alerta de fluxo parado **só dispara para fluxos marcados com `{$NIFI.DEVE_RODAR}=1`** (lista que o Desenvolvimento envia) — é isso que mata os falsos positivos.

---

## SLIDE 5 — Benefícios esperados (2 min)

**O que dizer:**
- **Detecção precoce** (MTTD menor): 70% de disco e 80% de heap antes do impacto, não depois.
- **Redução de ruído:** lista de fluxos críticos + eliminação de 35 falsos positivos conhecidos = alerta em que se confia.
- **Previsibilidade:** 31 dias de detalhe + **400 dias de tendência** para justificar capacidade e investimentos com dados.
- **Segurança e conformidade:** menor privilégio, senhas/tokens secretos, aderência total à Arquitetura §7.4 e ao TO-BE AMCOM.
- **Custo marginal:** template interno, sem licença adicional; o único agente recomendado é o padrão Linux (Zabbix agent 2) para CPU/memória/disco da VM.

---

## SLIDE 6 — Próximos passos e decisões (2 min)

**Pedidos à gerência (objetivo da reunião):**
1. **Aprovar** a implantação em HML (homologação técnica ~2 semanas).
2. **Desenvolvimento:** enviar a lista de fluxos que devem rodar (IDs dos Process Groups) — insumo obrigatório do anti-ruído.
3. **Infraestrutura:** agendar playbook/cron de renovação do token (um por instância NiFi) e instalar Zabbix agent 2 + template *Linux by Zabbix agent* nas VMs.
4. **Critério de aceite:** valores batendo com a tela *System Diagnostics* do NiFi e zero alertas duplicados por 2 semanas → **go produção**.

---

## SLIDE 7 — Encerramento (1 min)

> **"Implantando este template, a gente troca 'descobrir o incidente pelo usuário' por 'detectar a degradação antes do incidente' — com menos alertas, não com mais."**

---

## Q&A — perguntas antecipadas

| Pergunta provável | Resposta |
|---|---|
| Quanto custa? | Template interno; sem licença. Esforço: homologação em HML + playbook de token já existente no repositório. |
| Impacto no NiFi? | Consultas leves à API (1 chamada mestre/min + system-diagnostics); nada executa dentro do NiFi; sem agente instalado na plataforma. |
| E se a API do NiFi cair? | Alerta High em 3 min; triggers evitam duplicidade e o diagnóstico do item de login (1×/h) ajuda a isolar token × rede. |
| E se o token expirar? | Playbook renova e envia "batimento" ao Zabbix; 8h sem batimento = alerta High **antes** de qualquer perda de coleta. |
| Por que o Zabbix (e não outra ferramenta)? | Plataforma corporativa padrão de monitoramento/notificação; integra centralizadamente ao mesmo operador e aos mesmos escalonamentos. |
| Quanto tempo de homologação? | ~2 semanas em HML com critérios de aceite objetivos; produção após 2 semanas sem ruído. |
| O que acontece com o monitoramento antigo? | Fica desativado (não excluído) e pode ser reativado/removido após a homologação — reversível. |