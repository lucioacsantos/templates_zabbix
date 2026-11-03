# Diagramas Mermaid — Roteiro Executivo de 2 Slides
## NiFi + OpenShift/Thanos

> **Como usar:** cole cada bloco em `mermaid.live`, no preview do VS Code/GitLab ou exporte PNG/SVG para o slide. Cada gráfico tem fala de apoio correspondente ao roteiro.

---

# Tema 1 — NiFi

## SLIDE 1 — Problemáticas analisadas

### Gráfico A (principal) — Cadeia de falhas do monitoramento atual

```mermaid
flowchart LR
    NIFI["Plataforma NiFi<br/>fluxos de dados"] --> MON["Monitoramento atual<br/>19 desvios do TO-BE"]
    MON --> P1["Disco medido como<br/>memória JVM"]
    MON --> P2["Fluxo parado em subgrupos<br/>sem alerta"]
    MON --> P3["35 falsos positivos<br/>só na homologação"]
    MON --> P4["Login no AD 1.440x/dia<br/>risco de bloqueio da conta"]
    MON --> P5["Token expira sem aviso<br/>coleta morre em breve"]
    P1 --> INC["Incidente sem alerta<br/>descoberto pelo usuário"]
    P2 --> INC
    P5 --> INC
    P3 --> FADIGA["Fadiga de alerta:<br/>time aprende a ignorar"]
    P4 --> BLOQ["Conta bloqueada<br/>no AD"]
```

> **Fala:** "Tudo que sai à direita deste desenho é o que a gerência sente hoje: incidente sem aviso e alerta em que não se confia."

### Gráfico B — Categorização dos 19 desvios do TO-BE

```mermaid
mindmap
  root((Desvios DBT 6131))
    Medição errada
      Disco mediu memória JVM
      GC e threads sempre zero
    Ruído
      35 falsos positivos
      Limiares fora do padrão
    Ponto cego
      Fluxo parado em subgrupos
      Erros do bulletin board perdidos
    Segurança
      Login 1.440x por dia no AD
      Token expira invisível
    Histórico
      Retenção curta
      Sem tendência de capacidade
```

---

## SLIDE 2 — Soluções implementadas

### Gráfico A (principal) — Arquitetura v3: da coleta ao alerta

```mermaid
flowchart TD
    subgraph NIFI["Plataforma NiFi"]
        API["API REST<br/>autenticação Bearer"]
    end
    subgraph AUT["Automação do token"]
        CRON["Playbook / cron<br/>renovar_nifi_token"]
    end
    subgraph ZBX["Zabbix — template v3"]
        MASTER["Template master<br/>Apache NiFi API by JS"]
        FLUX["Descoberta automática<br/>de fluxos"]
        METR["16 métricas por fluxo"]
        ALERT["5 alertas por fluxo"]
        RES["Cluster Resources:<br/>JVM - Storage - threads"]
        TRAP["Batimento do token<br/>8h sem sinal = High"]
    end
    MASTER -->|"consulta leve 1x/min"| FLUX
    FLUX --> METR
    FLUX --> ALERT
    MASTER --> RES
    MASTER -->|"coleta sem agente"| API
    CRON -->|"renova o token"| API
    CRON -->|"zabbix_sender"| TRAP
    TRAP --> MASTER
    MASTER --> OPER["Operação: alerta com<br/>causa, severidade e tag do fluxo"]
```

> **Fala:** "Sem agente no NiFi, sem custo de licença: o Zabbix consulta a API e a descoberta cria métricas e alertas sozinhos."

### Gráfico B — Anti-ruído: quem tem direito a alerta

```mermaid
flowchart TD
    A["Fluxo com processo<br/>parado ou inválido"] --> B{"Está na lista de<br/>fluxos que devem rodar?"}
    B -->|"Sim<br/>DEVE_RODAR igual a 1"| C["Alerta High<br/>tag com nome do fluxo"]
    B -->|"Não"| D["Sem alerta<br/>zero falso positivo"]
```

> **Fala:** "É este filtro simples que mata os falsos positivos: alerta só para o que precisa rodar — lista enviada pelo Desenvolvimento."

### Gráfico C — Escada de limiares: degradação antes do incidente

```mermaid
flowchart LR
    D["Disco do repositório"] -->|"70%"| W1["Warning<br/>agir com antecedência"]
    D -->|"90%"| H1["High: risco de parada"]
    HP["Heap da JVM"] -->|"80%"| W2["Warning"]
    F["Fila do fluxo"] -->|"80% do limite"| W3["Warning"]
    F -->|"100% contrapressão"| H2["High: upstream pausado"]
```

---

# Tema 2 — OpenShift / Thanos

## SLIDE 1 — Problemáticas analisadas

### Gráfico A (principal) — O incidente em rota direta para o usuário

```mermaid
flowchart LR
    APP["Aplicações<br/>por namespace"] --> FAL["Falhas atuais:<br/>5xx - OOMKill - disco cheio - throttling"]
    FAL --> USER["Usuário descobre primeiro"]
    USER --> CHAM["Chamado reativo<br/>sem causa nem contexto"]
    TQ["Fonte de métricas<br/>Thanos sem vigilância"] -.->|"se a fonte cair"| CEGO["Cegueira total:<br/>nem o plantão enxerga"]
```

> **Fala:** "Hoje o caminho é curto: a aplicação falha e o usuário descobre antes do plantão — e se a fonte sumir, nem isso o plantão sabe."

### Gráfico B — Lacunas por namespace

```mermaid
mindmap
  root((Lacunas OpenShift))
    Visibilidade
      Sem consumo vs quota
      Sem limits por área
    Reatividade
      5xx via usuário
      OOMKill descoberto tarde
    Performance
      Throttling invisível
      Sem latência p95
    Capacidade
      Sem tendência histórica
      Pedidos no feeling
    Fonte
      Thanos sem alerta dedicado
```

---

## SLIDE 2 — Soluções implementadas

### Gráfico A (principal) — Arquitetura: do namespace ao alerta

```mermaid
flowchart LR
    subgraph OCP["OpenShift"]
        NS["Namespaces ativos"] --> PROM["Prometheus<br/>métricas do cluster"]
    end
    subgraph ZBX["Zabbix — master template"]
        Z["Template OpenShift<br/>Thanos API by JS"]
        DESC["Auto-descoberta<br/>de namespaces a cada 1h"]
        M18["18 métricas<br/>por namespace"]
        M2["2 métricas<br/>por container"]
        AL["8 alertas por namespace:<br/>severidade - causa - ação"]
    end
    PROM --> TQ["Thanos Querier<br/>token somente leitura"]
    TQ -->|"consultas PromQL"| Z
    Z --> DESC --> M18
    DESC --> M2
    M18 --> AL
    TQ -.->|"API down: alerta High<br/>sem pontos cegos"| Z
```

> **Fala:** "O Zabbix aponta para o Thanos que já existe no cluster; todo namespace novo entra em monitoração sozinho, sem trabalho por equipe."

### Gráfico B — Sinais clássicos cobertos em cada namespace

```mermaid
flowchart TD
    GS["Sinais clássicos<br/>por namespace"] --> TR["Tráfego<br/>requisições por segundo"]
    GS --> ER["Erros<br/>5xx acima de 5%"]
    GS --> LA["Latência<br/>p95 das respostas"]
    GS --> SA["Saturação<br/>CPU e memória acima de 90% - disco acima de 85%"]
```

> **Fala:** "Os mesmos 4 sinais que a indústria usa para 'saúde de serviço' — agora por namespace, com alertas que já explicam causa e ação."

### Gráfico C — Ciclo de vida automático (zero manutenção)

```mermaid
flowchart LR
    NOVO["Namespace criado<br/>por uma equipe"] --> DISC["Descoberto em até 1h<br/>sem configuração manual"]
    DISC --> MONI["Monitorado:<br/>18 métricas + 8 alertas"]
    REM["Namespace removido"] --> CADUCA["Itens caducam em 30 dias<br/>zero lixo no Zabbix"]
```