# Roteiro Técnico de Implantação — Arquitetura TO-BE
### CCEE · Assessment Apache NiFi · Projeto 6748

> **O que é este documento.** O plano de execução da arquitetura-alvo. Enquanto o relatório executivo explica
> *o que* e *por quê*, aqui está o *como*: configuração, comando, critério de aceite e ordem.
>
> **Acompanha:** `CCEE - Apache NiFi - Arquitetura TO-BE.drawio` e
> `CCEE - Apache NiFi - Arquitetura TO-BE - Relatorio Executivo.docx`.
>
> **Para quem.** Quem vai executar: desenvolvedores das squads, operação (OMIS), infraestrutura e a
> responsabilidade de Plataforma. Serve também de checklist de acompanhamento onda a onda.
>
> **Convenção.** Cada tarefa tem `[quem]`, esforço estimado e **critério de aceite** — a condição objetiva que
> permite marcar como concluída. Tarefa sem critério de aceite não entra no plano.

---

## Índice

| Onda | Tema | Prazo | Seção |
|---|---|---|---|
| **0** | Fundação e visibilidade | 0–30 dias | 1 |
| **1** | Governança e padrão | 30–90 dias | 2 |
| **2** | Esteira e segredos | 60–120 dias | 3 |
| **3** | Disponibilidade e migração | 90–180 dias | 4 |
| **4** | Otimização contínua | contínuo | 5 |
| — | Ferramentas de produtividade — API e MCP (transversal) | contínuo | 5.1 |
| — | Anexos: comandos, checklists e armadilhas | — | A–D |

---

## Onda 0 — Fundação e visibilidade
### 0 a 30 dias · nenhum fluxo é alterado · tudo é configuração

> **Por que primeiro.** Tudo o que vem depois precisa de dado para ser dimensionado e verificado. E esta onda,
> sozinha, já elimina o pior sintoma do diagnóstico: a descoberta de incidente por reclamação.

### 1.1 Monitoração de recurso — a menor ação de maior retorno

`[infraestrutura + plataforma]` · **esforço: 2 h**

Três Reporting Tasks por instância, em **Controller Settings → Reporting Tasks**. Sem código, sem alterar fluxo.

| Task | Configuração |
|---|---|
| `MonitorDiskUsage` ×3 | Uma por repositório. *Threshold* inicial: 70%. Informar o diretório e um nome amigável que identifique o repositório. |
| `MonitorMemory` | Pool de heap. *Threshold* inicial: 80%. |

**Critério de aceite:** provocar artificialmente a condição em DEV e confirmar que o *bulletin* aparece.

### 1.2 Exposição de métricas

`[infraestrutura + plataforma]` · **esforço: 4 h**

`PrometheusReportingTask` nas cinco instâncias. Definir porta padrão e liberar no firewall para o coletor.

**Decisão a tomar antes:** quem consome o endpoint. Em ordem de preferência, para não criar stack nova:

1. **Zabbix** — já monitora infraestrutura e todos os bancos; verificar se absorve o formato Prometheus.
2. **Dynatrace** — já em ajuste para o NiFi; vale rever se APDEX é a métrica adequada, ponto que a própria
   gestão de infraestrutura levantou no Discovery.
3. **Prometheus dedicado** — se nenhum dos dois absorver sem custo de licença.

**Critério de aceite:** o endpoint responde nas cinco instâncias e o consumidor escolhido está armazenando série temporal.

### 1.3 Alerta de fluxo parado — o que a operação pediu

`[plataforma]` · **esforço: 8 h**

A operação pediu, no Discovery, que o status de fluxo parado fosse exposto por API. **Ele já está.**

```bash
TOKEN=$(curl -sk -X POST "$BASE/access/token" -d "username=$USER" -d "password=$PASS")
AUTH="Authorization: Bearer $TOKEN"

curl -sk -H "$AUTH" "$BASE/process-groups/$PG_ID" | jq '{
  nome:          .component.name,
  rodando:       .runningCount,
  parados:       .stoppedCount,
  invalidos:     .invalidCount,
  desabilitados: .disabledCount
}'
```

Regra de alerta: em qualquer process group marcado como produtivo no catálogo,
`stoppedCount > 0` **ou** `invalidCount > 0`.

> **Cuidado.** Há fluxos legitimamente parados — sazonais, desativados, em manutenção. O alerta só funciona
> com o catálogo (1.5) indicando quais devem estar rodando. Sem isso, gera ruído e é desligado na primeira semana.

**Critério de aceite:** parar um fluxo em HML e receber o alerta em menos de 5 minutos.

### 1.4 Exportação de bulletins

`[plataforma]` · **esforço: 4 h**

`SiteToSiteBulletinReportingTask` para exportar os avisos que hoje desaparecem da tela sem deixar rastro.
Filtrar por nível `ERROR` no destino, não na origem — o histórico completo tem valor em análise posterior.

**Critério de aceite:** um erro provocado em DEV chega ao destino configurado.

### 1.5 Catálogo automático v1 — o NiFi observando o NiFi

`[plataforma]` · **esforço: 16 h**

Um fluxo NiFi que consulta a própria REST API e publica o inventário.

**Parte automática** — obtida da API:

| Campo | Endpoint |
|---|---|
| Process group, caminho, hierarquia | `/flow/process-groups/{id}` |
| Componentes rodando / parados / inválidos | `/process-groups/{id}` |
| Versão corrente e estado de versionamento | `/versions/process-groups/{id}` |
| Filas e contrapressão | `/flow/process-groups/{id}/status?recursive=true` |

**Parte manual** — tabela pequena, mantida à mão, com o que a API não sabe:
`dono` · `criticidade` · `SLA` · `janela de manutenção` · `deve estar rodando (S/N)`

> O estado de versionamento resolve, de quebra, a **detecção de deriva**: qualquer process group em estado
> diferente de *up to date* é alteração local não commitada. Hoje isso só se descobre no momento do deploy.

**Critério de aceite:** inventário publicado e atualizado automaticamente, com dono preenchido para 100% dos
fluxos produtivos.

### 1.6 Início do baseline

`[infraestrutura + plataforma]` · **esforço: contínuo por 30 dias**

**Janela mínima de 30 dias, cobrindo pelo menos um fechamento contábil.** Este critério é específico da CCEE:
os fluxos são disparados por evento contábil e por calendário mensal — consolidação de montantes, liberação de
evento contábil, relatórios em MS12 e MS21. Uma janela de duas semanas mede o vale, não o pico.

Coletar: FlowFiles e bytes por fluxo (média e pico) · profundidade máxima de fila · duração de tarefa por
processador · heap, GC e threads · ocupação e crescimento de cada repositório · recurso alocado *versus*
utilizado nas cinco VMs.

**Critério de aceite:** série de 30 dias completa, com pelo menos um pico de fechamento capturado.

### 1.7 Registro das regras vigentes

`[arquitetura + plataforma]` · **esforço: 8 h**

Documentar as regras que já existem, mas só oralmente. Uma página por regra:
**decisão · data · motivo · escopo · exceções conhecidas · quem revisa**.

Mínimo para começar:

- Veto ao DB Link — incluindo o caso em produção, que precisa de decisão: regularizar ou remover
- Restrição de persistência em banco — declarar o escopo real, hoje ambíguo
- Processadores bloqueados (`ExecuteScript`, `PutFile`)
- Ausência de procedures e objetos em banco
- Premissa de trafegar APIs pelo Hub

**Critério de aceite:** as cinco regras registradas e publicadas em local acessível a todas as squads.

### Fechamento da Onda 0

- [ ] Os quatro alertas ativos e testados
- [ ] Baseline correndo há 30 dias, com um fechamento capturado
- [ ] Catálogo publicado, com dono em 100% dos fluxos produtivos
- [ ] Regras vigentes registradas
- [ ] **Nenhum fluxo produtivo foi alterado**

---

## Onda 1 — Governança e padrão
### 30 a 90 dias · depende da Onda 0 para o catálogo

> **Por que antes da esteira.** Automatizar um processo que ninguém segue apenas automatiza o desvio.

### 2.1 Chapter de NiFi

`[plataforma + todas as squads]` · **esforço: 2 h quinzenais**

Fórum quinzenal. Composição: um representante por squad que opera fluxos, mais arquitetura, infraestrutura e
operação. **Modelo já existente na casa:** o fórum semanal de Java.

Pauta fixa: fluxos novos previstos · incidentes desde o último encontro · evolução da biblioteca · decisões
pendentes · uma apresentação técnica curta rotativa entre as squads.

**Critério de aceite:** três encontros realizados com ata e decisões registradas.

### 2.2 Matriz de responsabilidade

`[gestão + plataforma]` · **esforço: 8 h + ciclo de aprovação**

A matriz está na aba 6 do diagrama. O trabalho aqui é **aprovar e publicar**, não redesenhar.

Ponto de atenção: a matriz depende de uma decisão organizacional que não é técnica — a separação entre
capacidade de projeto e de sustentação. Hoje a mesma célula faz as duas coisas, e é isso que produz a
assimetria entre responsabilidade e autoridade.

**Critério de aceite:** matriz aprovada pela gestão e publicada.

### 2.3 Revisão de permissionamento

`[infraestrutura + OMIS]` · **esforço: 16 h**

| Política | De | Para |
|---|---|---|
| `view the component` | Só a própria célula | **Todos os desenvolvedores, em todo o parque** |
| `modify the component` | Squad dona | Squad dona *(sem mudança)* |
| `operate` em PRD | Só OMIS | **Squad dona** |
| `view the data` | Restrito | Dono do fluxo, por sensibilidade |
| Administração | OMIS e infra | *(sem mudança)* |

Implementação via grupos do Active Directory, já integrados. Criar grupo `NIFI_DEV_LEITURA_GERAL` e
grupos `NIFI_OPERA_<CELULA>`.

> **Como apresentar à infraestrutura.** A proposta **reduz** o risco de governança: separa *operar* de
> *administrar*, elimina a necessidade de permissão temporária ad-hoc — concessão pontual e sem rastro — e
> torna a ação rastreável por identidade. A promoção continua exclusiva da operação.

**Critério de aceite:** uma squad consegue parar, iniciar e inspecionar fila do próprio fluxo em produção,
sem acionar o OMIS, e a ação aparece no log de auditoria.

### 2.4 Biblioteca de componentes v1

`[plataforma]` · **esforço: 40 h**

Três componentes na primeira versão, na ordem de retorno:

**`PG_LOG_CORPORATIVO`** — Input Port recebendo os atributos padrão, `PutSyslog` para o Log Insight no formato
definido pela arquitetura. Substitui 339 cópias.

**`PG_TRATA_ERRO`** — Input Port → `RetryFlowFile` (máx. 3–5, penalize on retry) → sucesso volta ao chamador;
`retries_exceeded` → DLQ observável → log.

**`PG_NOTIFICA`** — Input Port → roteia por atributo entre e-mail, evento Kafka e Plataforma de Integração.

**Controller Services por domínio** — declarados no process group raiz de cada célula: pool JDBC por instância
Oracle, readers e writers, **um** provedor OAuth2 por tenant (hoje são 55 para o mesmo tenant), cache.

> **Sobre o alcance real do reuso.** O NiFi não tem biblioteca nativa. Input Port é reuso real, mas só dentro
> da mesma instância. Process Group versionado é uma cópia por ponto, com propagação por comando. Controller
> Service herdado é reuso real em tempo de execução. **O ganho é uma definição única com propagação
> controlada** — não um componente compartilhado entre instâncias.

**Critério de aceite:** um fluxo novo construído usando os três componentes, em DEV, sem duplicar nada.

### 2.5 Convenção de nomenclatura

`[plataforma + Chapter]` · **esforço: 4 h**

| Elemento | Padrão | Exemplo |
|---|---|---|
| Process Group | `<CÉLULA>_<DOMÍNIO>_<Função>` | `CMED_EXPM_ConsultaMedicao` |
| Processador | Verbo + objeto, descrevendo intenção | `Consultar medição por ponto` |
| Controller Service | `<TIPO>_<ALVO>` | `DBCP_PDB02` · `OAUTH2_MSGRAPH` |
| Parameter Context | `<CÉLULA>-<FLUXO>` | `CMED-EXPM` |

> **O Parameter Context não carrega ambiente no nome.** O ambiente é a instância onde ele existe — é isso que
> permite promover o mesmo artefato sem edição.

**Critério de aceite:** convenção aprovada no Chapter e aplicada em todo fluxo novo.

### 2.6 Flow Analysis Rules em modo observação

`[plataforma]` · **esforço: 24 h**

Em **Controller Settings → Flow Analysis Rules**. Começar pelas nativas:

- `RestrictBackpressureSettings` — faixa aceitável por criticidade
- `DisallowComponentType` — substitui o bloqueio manual de `ExecuteScript` e `PutFile` por regra declarada e auditável

Regras customizadas, como extensão, quando as nativas estiverem em regime: nomenclatura · `failure` conectado ·
Controller Service não declarado abaixo do nível de domínio · uso do componente de log da biblioteca.

> **Modo observação primeiro.** O objetivo inicial é **medir o tamanho da dívida**, não bloquear ninguém.
> Vira gate só na Onda 2, e só depois de a dívida estar mapeada e priorizada.

**Critério de aceite:** relatório de violações por célula, apresentado no Chapter.

### 2.7 Eliminação da deriva

`[squads + OMIS]` · **esforço: variável, conforme o volume encontrado**

Usando o catálogo (1.5), listar todo process group em estado diferente de *up to date*. Para cada um, o dono
decide: **commitar** a alteração local ou **descartá-la**.

> **Este item é pré-requisito da Onda 2.** Enquanto houver deriva, o repositório não é fonte confiável da
> verdade — e o rollback da esteira não pode ser considerado seguro.

**Critério de aceite:** zero process groups produtivos com alteração local não commitada, verificado pelo catálogo.

### Fechamento da Onda 1

- [ ] Chapter em operação, com três encontros realizados
- [ ] Matriz de responsabilidade aprovada e publicada
- [ ] Squad dona operando o próprio fluxo em produção
- [ ] Biblioteca v1 disponível e usada em fluxo novo
- [ ] Convenção aprovada
- [ ] Violações mapeadas e priorizadas
- [ ] **Deriva zerada**

---

## Onda 2 — Esteira e segredos
### 60 a 120 dias · depende da Onda 1

### 3.1 Versionamento em Git

`[plataforma + infraestrutura]` · **esforço: 24 h**

Configurar o **Git Flow Registry Client** apontando para o Bitbucket corporativo. A CCEE já opera o Bitbucket e
já tem credencial OAuth2 configurada nos fluxos.

Estratégia de migração: manter o NiFi Registry ativo durante a transição, migrar por célula, desativar ao final.

**Ganhos simultâneos:** elimina o ponto único de falha do Registry · cria histórico auditável · viabiliza
**revisão por pull request**, hoje impossível pela restrição de visibilidade — que a Onda 1 já terá removido.

**Critério de aceite:** um fluxo versionado em Git, com histórico visível e um pull request revisado por par
de outra squad.

### 3.2 Saneamento dos Parameter Contexts

`[squads + plataforma]` · **esforço: 24 h**

Hoje os contextos carregam configuração de três ambientes simultaneamente — tópicos `-dev` e `-hml` lado a lado,
`tipo_ambiente = HML` em fluxo produtivo, URLs de três bancos.

Alvo: **um contexto por fluxo, com o mesmo conjunto de chaves em todos os ambientes**, e valores distintos por
instância. O contexto existe no destino e não viaja com o artefato.

**Critério de aceite:** para cada fluxo migrado, os contextos de DEV, HML e PRD têm exatamente as mesmas chaves
e valores diferentes.

### 3.3 Parameter Providers e cofre

`[plataforma + segurança]` · **esforço: 24 h + decisão de cofre**

Decisão prévia: **HashiCorp Vault** ou **AWS Secrets Manager** — a CCEE já opera AWS.

```
1. Criar o Parameter Provider apontando para o cofre
2. Fetch Parameters
3. Mapear para o Parameter Context
4. Os parâmetros passam a ser somente leitura no NiFi
5. Rotação de credencial deixa de exigir alteração no NiFi
```

**Critério de aceite:** nenhum valor sensível digitado em Parameter Context; rotação de uma credencial
executada sem tocar no NiFi.

### 3.4 Migração das contas pessoais de banco

`[squads + DBA]` · **esforço: 16 h**

Seis logins de pessoas físicas em uso como usuário de banco, além de um pool cujo nome contém o nome de uma pessoa.

A convenção correta **já existe na casa** — usuário de aplicação e usuário NiFi correspondente por sistema.
O trabalho é formalizar em registro, criar as contas de serviço faltantes, migrar os pools e renomear.

**Critério de aceite:** zero logins de pessoa física em Parameter Context ou Controller Service.

### 3.5 Pipeline de promoção

`[plataforma + infraestrutura]` · **esforço: 40 h**

Esqueleto em **Anexo B**. Os sete gates em **Anexo C**.

**Critério de aceite:** uma promoção completa de HML para PRD, executada pela esteira, sem edição manual de
parâmetro, com rollback testado.

### Fechamento da Onda 2

- [ ] Fluxos versionados em Git, com revisão por pull request
- [ ] Contextos saneados, mesmas chaves em todos os ambientes
- [ ] Segredos em cofre, nenhum digitado
- [ ] Contas pessoais de banco eliminadas
- [ ] Pipeline com os sete gates em operação
- [ ] **Rollback testado e documentado**

---

## Onda 3 — Disponibilidade e migração
### 90 a 180 dias · depende das Ondas 0 e 2

### 4.1 Separação de discos

`[infraestrutura]` · **esforço: 8 h por VM + janela**

| Volume | Conteúdo | Critério |
|---|---|---|
| `/opt/nifi` | SO e aplicação | — |
| `/data/flowfile` | FlowFile Repository | Menor volume, **menor latência disponível** |
| `/data/content` | Content Repository | Maior capacidade — dimensionar com o baseline |
| `/data/provenance` | Provenance Repository | Dimensionar por retenção |
| `/var/log/nifi` | Log da aplicação | — |

Ajustar `nifi.flowfile.repository.directory`, `nifi.content.repository.directory.default` e
`nifi.provenance.repository.directory.default`. **Exige parada e migração do conteúdo existente.**

> **Faça antes do cluster.** Não faz sentido triplicar nós mantendo a contenção de I/O em cada um.

**Critério de aceite:** os três repositórios em volumes distintos nas cinco VMs, com `MonitorDiskUsage`
apontando para cada um.

### 4.2 Cluster no ambiente compartilhado

`[infraestrutura + plataforma]` · **esforço: 80 h**

**Pré-requisitos:** ensemble ZooKeeper de 3 VMs pequenas (2 vCPU / 4 GB), fora do OpenShift · TLS mútuo entre
nós, com certificados e processo de renovação · discos separados (4.1) concluído.

Propriedades essenciais:

```properties
nifi.cluster.is.node=true
nifi.cluster.node.address=<fqdn-do-no>
nifi.cluster.node.protocol.port=11443
nifi.cluster.flow.election.max.wait.time=5 mins
nifi.cluster.flow.election.max.candidates=3
nifi.zookeeper.connect.string=zk1:2181,zk2:2181,zk3:2181
nifi.zookeeper.root.node=/nifi
nifi.state.management.provider.cluster=zk-provider
```

**Disciplina obrigatória — marcar `Primary Node Only`** em toda fonte que lista recurso externo, sob pena de
duplicar dado: `GenerateFlowFile` de agendamento, `ListFile`, `ListSFTP`, `ListS3`, consultas incrementais com
estado. **Consumidores Kafka não** — o protocolo já distribui partições entre os membros do grupo.

> **A objeção da CCEE, endereçada.** O cluster foi descartado porque, com um nó fora, não era possível alterar
> o fluxo. Três fatos mudam a conclusão: o bloqueio atinge a **edição**, não a **execução**; um nó
> **formalmente desconectado** não bloqueia alteração, enquanto um **silenciosamente inacessível** bloqueia — e
> a detecção agora é automática pela Onda 0; e existe **disconnect + offload** para manutenção planejada.

**Procedimento de manutenção planejada:**

```
1. UI → Cluster → nó → Disconnect
2. UI → Cluster → nó → Offload      (drena as filas para os demais)
3. Aguardar conclusão
4. Manutenção
5. UI → Cluster → nó → Connect
```

**Critério de aceite:** derrubar um nó em horário de operação e demonstrar que o processamento continua e que
o fluxo permanece editável após o disconnect.

### 4.3 DR de aplicação

`[infraestrutura + plataforma]` · **esforço: 24 h**

Backup versionado, além do snapshot da VM: `flow.json.gz` · `nifi.properties` · `bootstrap.conf` ·
`authorizers.xml` · `login-identity-providers.xml` · `state-management.xml` · keystore e truststore ·
definição dos Parameter Contexts.

**Critério de aceite:** procedimento escrito de reconstrução a partir do zero, **executado em ambiente de teste
ao menos uma vez**. Um DR nunca executado é hipótese, não plano.

### 4.4 Kafka com criptografia

`[plataforma + mensageria]` · **esforço: 16 h + coordenação**

No `Kafka3ConnectionService` que a CCEE já usa: `security.protocol` de `PLAINTEXT` para `SSL` ou `SASL_SSL`,
com `SSL Context Service` e, se aplicável, `sasl.mechanism`.

> **Depende da mensageria.** A mudança no NiFi é de configuração, mas exige o listener correspondente
> habilitado no broker. Coordenar como uma única mudança nos dois lados, ambiente por ambiente.

**Critério de aceite:** os dois ambientes operando com criptografia em trânsito, sem regressão de throughput.

### 4.5 Migração dos fluxos legados

`[squads + OMIS]` · **esforço: variável — ~23 fluxos**

Por fluxo:

```
1. Inventariar: templates, variáveis, Event Driven, componentes descontinuados, CONTORNOS
2. Refatorar em DEV na versão de destino
3. Adotar os componentes da biblioteca no que for tocado
4. Homologar cenário feliz + cenários de erro
5. Promover pela esteira (Onda 2)
6. Observar por um ciclo completo de negócio
```

> **A armadilha da migração.** Separe **contorno por limitação real da versão** — que some com a migração — de
> **contorno por desconhecimento** — que **não some**, porque o mecanismo correto já existia. O caso do
> Correlation Attribute registrado internamente como "bug da 1.16.2" pertence à segunda categoria: o
> comportamento é idêntico na 2.x. Se o inventário confiar nesse rótulo, o item será dado como resolvido sem
> ter sido tocado.

**Critério de aceite:** parque legado desativado, com todos os fluxos migrados e contornos revisados.

### Fechamento da Onda 3

- [ ] Discos separados nas cinco VMs
- [ ] Cluster de 3 nós operando, com queda de nó demonstrada sem interrupção
- [ ] DR de aplicação documentado e testado
- [ ] Kafka com criptografia nos dois ambientes
- [ ] Parque legado desativado

---

## Onda 4 — Otimização contínua
### Regime permanente, conduzido pelo Chapter

**Modo Record nos fluxos de maior volume** — trecho a trecho, onde há `Split` seguido de manipulação item a
item. Migrar para `QueryRecord` / `UpdateRecord` / `PutDatabaseRecord`. Medir antes e depois.

**Flow Analysis Rules como gate bloqueante** — quando a dívida mapeada na Onda 1 estiver abaixo do limiar acordado.

**SLO por fluxo crítico** — latência fim a fim e taxa de sucesso, a partir das métricas da Onda 0.

**Ciclo de capacidade em regime** — revisão a cada ciclo contábil ou mudança relevante.

**Evolução da biblioteca** — `PG_STATUS_PROCESSAMENTO` e `PG_UPLOAD_ONEDRIVE` entram aqui, junto com a
refatoração progressiva do EXPC.

---

## Ferramentas de produtividade — API e MCP
### Transversal às Ondas 0, 2 e 4 — não é onda nova, é ferramental de apoio

**O que é.** O Apache NiFi já expõe praticamente toda a sua operação via REST API — criar processador, ligar
Controller Service, consultar bulletin, aplicar Parameter Context. O que falta não é capacidade, é uma camada
de conveniência sobre ela: um servidor **MCP** (*Model Context Protocol*) traduz essa API em funções nomeadas e
tipadas — `criar_processador`, `vincular_parameter_context`, `consultar_bulletins` — que tanto um script quanto
um assistente de IA conseguem chamar diretamente, sem montar chamada HTTP à mão nem decorar o esquema JSON de
cada endpoint. Não é produto novo nem substitui o NiFi: é um tradutor fino entre quem precisa operar a
plataforma em escala e a API que ela já expõe. Referência visual: aba 12 do diagrama.

**Já em uso neste próprio assessment — não é proposta teórica.** Os 9 documentos de análise individual de
fluxo e a síntese geral foram produzidos com evidência coletada ao vivo, achado a achado, contra as instâncias
1.16.2 e 2.7.2, por essa mesma camada de API/MCP — não por inspeção manual da interface gráfica. Os scripts de
evidência de cada achado estão versionados na pasta `06.API/` e podem ser reexecutados a qualquer momento para
reconfirmar o estado de um fluxo.

**Casos de uso:**

| Caso de uso | Função/mecanismo | O que resolve |
|---|---|---|
| Construção assistida de fluxo | Criação programática de Process Group, Processor, Connection e vínculo de Parameter Context | Monta o esqueleto padrão (biblioteca de componentes, seção 2.4) sem digitação manual repetida por processador |
| Aplicação de contexto no destino | Vínculo de Parameter Context por Process Group | É o passo hoje feito à mão na promoção (seção 3.5), onde ocorreram as falhas de credencial nos primeiros deploys da 2.7.2 |
| Auditoria e evidência de achado | Consulta de processador, Controller Service, bulletin e busca no fluxo via API ao vivo | Confirma o estado de um fluxo contra a instância viva, com script reexecutável, em vez de inspeção manual |
| Catálogo automático do parque | Listagem recursiva de Process Groups, instâncias e fluxos filhos | Insumo direto de "Catálogo automático v1" (seção 1.5) |
| Verificação de gate antes de promover | Consulta de estado de processador/Controller Service, com opção de habilitar/desabilitar por código | Confere programaticamente parte dos sete gates automáticos (seção 3.5) antes de autorizar a promoção |

**Ferramental — nada novo a adquirir.** REST API do NiFi (já embutida na instalação), **NiPyAPI** (cliente
Python de código aberto, já citado no ferramental da esteira, seção 3.5) e um **servidor MCP** como camada fina
sobre eles — código aberto, hospedado internamente, sem custo de licença. O investimento é de tempo de
engenharia, não de aquisição.

**Onde entra no roadmap.** Não é uma frente isolada: alimenta o "Catálogo automático v1" da Onda 0 (1.5),
acelera a verificação dos sete gates da esteira na Onda 2 (3.5) e, no regime permanente da Onda 4, passa a ser
o meio padrão de auditar conformidade de padrão e coletar evidência, em vez de inspeção manual recorrente.

**Critério de aceite:** ao menos um dos casos de uso acima (catálogo automático ou verificação de gate)
rodando em produção via API/MCP, sem intervenção manual na interface gráfica.

---

## Anexo A — Comandos de bolso

**Autenticação e diagnóstico**

```bash
BASE=https://nifi-flows.energia.org.br:8443/nifi-api
TOKEN=$(curl -sk -X POST "$BASE/access/token" -d "username=$USER" -d "password=$PASS")
AUTH="Authorization: Bearer $TOKEN"

# heap, threads, repositorios
curl -sk -H "$AUTH" "$BASE/system-diagnostics" | jq '.systemDiagnostics.aggregateSnapshot |
  {heap: .heapUtilization, threads: .totalThreads,
   ff: .flowFileRepositoryStorageUsage.utilization}'

# avisos de erro ativos
curl -sk -H "$AUTH" "$BASE/flow/bulletin-board" |
  jq -r '.bulletinBoard.bulletins[] | select(.bulletin.level=="ERROR")
         | "\(.bulletin.timestamp) | \(.bulletin.sourceName) | \(.bulletin.message)"'

# estado de versionamento — deteccao de deriva
curl -sk -H "$AUTH" "$BASE/versions/process-groups/$PG_ID" |
  jq '.versionControlInformation.state'
```

**Toolkit CLI — esteira**

```bash
cli.sh session set nifi.url https://nifi-flows.energia.org.br:8443

cli.sh registry list-flow-versions -f <flowId>
cli.sh nifi pg-import          -b <bucketId> -f <flowId> -fv <versao> -pgid <grupoPai>
cli.sh nifi pg-change-version  -pgid <pgId> -fv <versao>
cli.sh nifi pg-stop            -pgid <pgId>
cli.sh nifi enable-services    -pgid <pgId>
cli.sh nifi pg-start           -pgid <pgId>
cli.sh nifi pg-status          -pgid <pgId>
cli.sh nifi merge-param-context -pcid <contextId> -i contexto-prd.json
```

---

## Anexo B — Esqueleto do pipeline

```bash
#!/usr/bin/env bash
set -euo pipefail
# promove <flowId> versao <VER> para o process group <PGID>

# --- gate 1: origem sem alteracao local -------------------------------------
estado=$(cli.sh nifi pg-status -pgid "$PGID_ORIGEM" | grep -i 'version state' || true)
[[ "$estado" == *"UP_TO_DATE"* ]] || { echo "ERRO: alteracao local nao commitada"; exit 1; }

# --- gates 2 a 7: validacao do artefato -------------------------------------
./validar-artefato.sh "$FLOW_JSON"   # ver Anexo C

# --- parada, conforme o tipo de mudanca -------------------------------------
if [[ "$TIPO" == "B" || "$TIPO" == "C" ]]; then
  cli.sh nifi pg-stop -pgid "$PGID_CONSUMER"
  until [[ $(fila_pendente "$PGID") -eq 0 ]]; do sleep 10; done
  cli.sh nifi pg-stop -pgid "$PGID"
fi

# --- promocao ---------------------------------------------------------------
cli.sh nifi pg-change-version -pgid "$PGID" -fv "$VER"
cli.sh nifi enable-services   -pgid "$PGID"
cli.sh nifi pg-start          -pgid "$PGID"

# --- verificacao pos-deploy -------------------------------------------------
sleep 30
invalidos=$(curl -sk -H "$AUTH" "$BASE/process-groups/$PGID" | jq '.invalidCount')
[[ "$invalidos" -eq 0 ]] || { echo "ROLLBACK: $invalidos componentes invalidos"; \
  cli.sh nifi pg-change-version -pgid "$PGID" -fv "$VER_ANTERIOR"; exit 1; }
```

---

## Anexo C — Os sete gates

| # | Gate | Como verificar |
|---|---|---|
| 1 | Sem alteração local | `pg-status` do fluxo de origem em `UP_TO_DATE` |
| 2 | Sem segredo no artefato | Varredura do JSON exportado por padrão de senha, token e chave |
| 3 | `failure` tratado | Todo relacionamento de falha conectado ou auto-terminado |
| 4 | Contrapressão dimensionada | Nenhuma conexão de fluxo crítico com 10.000 / 1 GB |
| 5 | Contexto completo no destino | Comparar chaves referenciadas com as existentes no alvo |
| 6 | Serviços habilitáveis | `get-services` no destino, verificando estado |
| 7 | Conformidade de padrão | Flow Analysis Rules sem violação crítica |

Os gates 2, 3 e 4 são obteníveis por varredura do próprio JSON exportado — a mesma técnica usada neste
assessment para analisar os dez fluxos.

---

## Anexo D — Armadilhas conhecidas

**Alerta de fluxo parado sem catálogo** vira ruído e é desligado na primeira semana. Há fluxos legitimamente
parados; sem o campo "deve estar rodando", o alerta não distingue.

**Baseline curto demais.** Duas semanas medem o vale. Os picos da CCEE são contábeis e mensais.

**`Primary Node Only` esquecido** em fonte que lista recurso externo duplica dado silenciosamente. É o erro
mais caro de uma primeira adoção de cluster, porque o sintoma aparece longe da causa.

**Consumidor Kafka marcado como `Primary Node Only`** anula o paralelismo — o protocolo já distribui as
partições. É o erro oposto, e igualmente comum.

**Flow Analysis Rules como gate cedo demais** paralisa a entrega e queima o mecanismo politicamente.
Observação primeiro, sempre.

**`Output Batch Size` diferente de zero** impede o `fragment.count` de ser preenchido — e o `MergeContent` em
*Defragment* nunca fecha o bin. É a causa mais frequente de "tentei MergeContent e não funcionou".

**Correlation Attribute com `${...}`** nunca correlaciona: a propriedade espera o **nome** do atributo e não
interpreta Expression Language. Comportamento idêntico na 1.x e na 2.x — **não é bug de versão**.

**Migrar contorno junto com o fluxo.** Contorno adotado por desconhecimento não desaparece com a migração.

---

*AMcom · Assessment Apache NiFi · CCEE · Projeto 6748 · Agosto de 2026*
