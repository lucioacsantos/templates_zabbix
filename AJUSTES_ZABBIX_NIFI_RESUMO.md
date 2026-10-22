# Zabbix × NiFi — o que alterar e como

**Chamado:** DBT-6131 · **Referência:** TO-BE AMCOM, Onda 0 (§1.1, 1.3, 1.4, 1.6) e Arq. de Referência §7.4

**Onde alterar:** no **template** *Apache NiFi API by JS* e nos sub-templates dele (*Data collection > Templates*).
Assim, todo host vinculado recebe a mesma configuração.

**Convenção:** `<T>` = nome do template onde a trigger fica. O botão **Add** do editor de expressão preenche esse nome.

---

## Resumo das alterações

| # | O que alterar | Por que (TO-BE) | Como alterar | Como conferir |
|---|---|---|---|---|
| 1 | Script do item **`nifi.storage.used_pct`** | Hoje mede a memória da JVM, não o disco (§1.1) | Template *…Cluster Resources* → *Items* → `nifi.storage.used_pct` → aba *Preprocessing* → apagar o JavaScript e colar o **Código 1** | Valor igual ao do NiFi em ☰ → *Summary* → *System Diagnostics* (HML ≈ 51%) |
| 2 | **Trigger de disco** | O TO-BE pede alerta a partir de 70%; hoje usa o limiar das filas (80%) | **a)** *Macros*: criar `{$NIFI.REPO_PCT.WARN}` = `70` e `{$NIFI.REPO_PCT.HIGH}` = `90`. **b)** Editar a trigger atual: Warning, `min(/<T>/nifi.storage.used_pct,10m)>={$NIFI.REPO_PCT.WARN}`. **c)** Criar trigger High: `min(/<T>/nifi.storage.used_pct,10m)>={$NIFI.REPO_PCT.HIGH}`. **d)** Na Warning, aba *Dependencies* → adicionar a High | O problema falso de "repositório acima de 80%" desaparece |
| 3 | Macro **`{$NIFI.HEAP_PCT}`** | O TO-BE pede alerta de memória em 80%; hoje está em 85% | Template → *Macros* → `{$NIFI.HEAP_PCT}` = `80` | — |
| 4 | Item **`nifi.cluster.threads_total`** | Hoje lê um campo que não existe e mostra 0 (§1.6) | Abrir o item → *Type*: **Dependent item** → *Master item*: `NiFi JVM: Status (raw)` → *Preprocessing*: trocar o JavaScript pelo **Código 2** | Valor ≈ 350 no HML |
| 5 | Item **`nifi.jvm.gc_pct`** | Hoje devolve 0 fixo (§1.6) | *Preprocessing*, nesta ordem: **1)** JavaScript = **Código 3** · **2)** *Change per second* · **3)** *Custom multiplier* = `0.1`. *Type of information*: Numeric (float). *Units*: `%` | Valor entre 0 e 5%, variando |
| 6 | Item **`nifi.api.bullets`** | Hoje lê o lugar errado da resposta e conta sempre 0 (§1.4) | *Preprocessing* → apagar o JavaScript e colar o **Código 4** | O valor passa a mostrar `sem_permissao` e a contar os erros reais |
| 7 | **Novo item:** `nifi.api.bullets.error` | Alerta de erro confiável. A trigger atual com `like` não reconhece de 2 a 9 erros | *Create item*: Name `NiFi: bulletins ERROR` · *Type*: Dependent item · *Master*: `nifi.api.bullets` · *Type of information*: Numeric (unsigned) · *Preprocessing*: JSONPath `$.error` | — |
| 8 | **Trigger de bulletins** | Idem | Criar trigger Average `last(/<T>/nifi.api.bullets.error)>={$NIFI.BULLETS_ERROR}`. **Desativar** a trigger antiga de bullets | — |
| 9 | **Novo item mestre:** `nifi.fluxos.status` | Detectar fluxo **parado** e **dentro de subgrupos** (§1.3) e filas em contrapressão (Ref. §7.4). Os itens atuais não fazem isso | Ver **Detalhe A** | Botão *Test* devolve uma lista com um bloco por fluxo |
| 10 | **Nova descoberta de fluxos**, com itens e triggers por fluxo | Idem, mais volume, fila e tempo de processamento por fluxo (§1.6) | Ver **Detalhes B, C e D** | Em *Latest data* aparecem itens `{nome do fluxo}: ...` |
| 11 | Macro **`{$NIFI.DEVE_RODAR}`** | O TO-BE alerta que, sem saber quais fluxos devem rodar, o alerta de parado vira ruído (§1.3) | Template → *Macros*: `{$NIFI.DEVE_RODAR}` = `0`. No **host** → *Macros*: uma linha por fluxo que deve rodar: `{$NIFI.DEVE_RODAR:"<ID do process group>"}` = `1` (lista enviada pelo Desenvolvimento) | O alerta de parado só aparece nesses fluxos |
| 12 | Macro **`{$NIFI.FLUXO.PROFUNDIDADE}`** | Definir o que conta como "fluxo" | Template → *Macros*: `{$NIFI.FLUXO.PROFUNDIDADE}` = `1` (grupos logo abaixo da raiz). Usar `2` no host onde os fluxos estão um nível abaixo | — |
| 13 | **Retenção** dos itens numéricos | Guardar a janela de observação e comparar com meses seguintes (§1.6) | Em cada item e protótipo numérico: *Trends* = `400d` (mínimo `90d`); *History* = `31d`. Itens "raw" (texto) continuam em `1d` | — |
| 14 | Item **`nifi.api.token`** | Hoje faz login no AD **a cada minuto** (1.440 vezes por dia); com a senha errada, a conta é bloqueada | *Update interval*: de `1m` para `1h` | — |
| 15 | **Aviso de falha na renovação do token** | Se o cron falhar, a coleta para e só aparece como "API indisponível" | **a)** Criar o item *Zabbix trapper*, Key `nifi.token.renovado`. **b)** No fim do playbook `renovar_nifi_token.yml`: `zabbix_sender -z <servidor-zabbix> -s <host> -k nifi.token.renovado -o 1`. **c)** Trigger High `nodata(/<T>/nifi.token.renovado,8h)=1` | O item recebe `1` a cada execução do playbook |
| 16 | **Renovação do token por host** | Cada NiFi emite o próprio token | O playbook precisa rodar para **cada** host (variável `zabbix_host_name`), um token por instância | — |
| 17 | **CPU, memória e disco da VM** | O TO-BE compara recurso alocado × utilizado (§1.6). O template só lê a API do NiFi | Instalar o **Zabbix agent 2** na VM e vincular o template padrão **Linux by Zabbix agent** (pular se a VM já tiver agente) | Em *Latest data* aparecem CPU, memória e partições |
| 18 | **Desativar** o que foi substituído (não excluir) | Evitar alertas duplicados e valores enganosos | Depois que os itens 9 e 10 estiverem funcionando: desativar as descobertas *Descoberta de Process Groups* e *Descoberta de filas por PG* e os itens `nifi.cluster.nodes` e `nifi.cluster.nodes_connected` (sempre `1` fixo) | — |
| 19 | **Permissões da conta no NiFi** | Mínimo privilégio | A conta precisa só de *view the user interface*, *view system diagnostics* e *view the component* no grupo raiz. **Não** precisa de acesso a `/controller`, ao contrário do que diz o README | — |

---

## Detalhe A — Item mestre (alteração 9)

Template *Apache NiFi API by JS* → *Items* → *Create item*:

| Campo | Valor |
|---|---|
| Name | `NiFi: status dos fluxos` |
| Type | HTTP agent |
| Key | `nifi.fluxos.status` |
| Type of information | Text |
| URL | `{$NIFI.URL}/flow/process-groups/root/status?recursive=true` |
| Headers | `Authorization` = `Bearer {$NIFI.TOKEN}` |
| Timeout | `60s` |
| Update interval | `1m` |
| History | `1d` |
| Preprocessing | *JavaScript*: colar **todo** o arquivo `preprocessamento_fluxos.js` (anexo) |

Criar também a trigger High `nodata(/<T>/nifi.fluxos.status,5m)=1`, com o nome *NiFi: coleta dos fluxos parou*.

## Detalhe B — Regra de descoberta (alteração 10)

*Discovery rules* → *Create discovery rule*:

| Campo | Valor |
|---|---|
| Name | `NiFi: descoberta de fluxos` |
| Type | Dependent item |
| Master item | `NiFi: status dos fluxos` |
| Key | `nifi.fluxos.descoberta` |
| Aba *LLD macros* | `{#FLUXO_ID}` = `$.id` · `{#FLUXO}` = `$.nome` |

## Detalhe C — Protótipos de item (alteração 10)

Dentro da regra → *Item prototypes*. Todos com *Type* = **Dependent item**, *Master item* =
`NiFi: status dos fluxos` e *Preprocessing* = **JSONPath** `$[?(@.id=='{#FLUXO_ID}')].<CAMPO>.first()`
(troque `<CAMPO>` pelo valor da tabela).

| Name | Key | `<CAMPO>` | Type of information |
|---|---|---|---|
| `{#FLUXO}: processadores parados` | `nifi.fluxo.parados[{#FLUXO_ID}]` | `stopped` | Numeric (unsigned) |
| `{#FLUXO}: processadores inválidos` | `nifi.fluxo.invalidos[{#FLUXO_ID}]` | `invalid` | Numeric (unsigned) |
| `{#FLUXO}: maior uso de fila (%)` | `nifi.fluxo.fila_uso[{#FLUXO_ID}]` | `max_uso_fila_pct` | Numeric (float) |
| `{#FLUXO}: filas em contrapressão` | `nifi.fluxo.contrapressao[{#FLUXO_ID}]` | `conexoes_contrapressao` | Numeric (unsigned) |
| `{#FLUXO}: FlowFiles em fila` | `nifi.fluxo.fila[{#FLUXO_ID}]` | `fila_flowfiles` | Numeric (unsigned) |
| `{#FLUXO}: bytes em fila` | `nifi.fluxo.fila_bytes[{#FLUXO_ID}]` | `fila_bytes` | Numeric (unsigned) |
| `{#FLUXO}: alterações não versionadas` | `nifi.fluxo.deriva[{#FLUXO_ID}]` | `pgs_com_deriva` | Numeric (unsigned) |
| `{#FLUXO}: FlowFiles recebidos (5 min)` | `nifi.fluxo.ff_in[{#FLUXO_ID}]` | `flowfiles_in_5min` | Numeric (unsigned) |
| `{#FLUXO}: FlowFiles enviados (5 min)` | `nifi.fluxo.ff_out[{#FLUXO_ID}]` | `flowfiles_out_5min` | Numeric (unsigned) |
| `{#FLUXO}: bytes recebidos (5 min)` | `nifi.fluxo.bytes_in[{#FLUXO_ID}]` | `bytes_in_5min` | Numeric (unsigned) |
| `{#FLUXO}: bytes enviados (5 min)` | `nifi.fluxo.bytes_out[{#FLUXO_ID}]` | `bytes_out_5min` | Numeric (unsigned) |
| `{#FLUXO}: threads ativas` | `nifi.fluxo.threads[{#FLUXO_ID}]` | `threads_ativas` | Numeric (unsigned) |
| `{#FLUXO}: tempo de processamento (ms, 5 min)` | `nifi.fluxo.tarefas_ms[{#FLUXO_ID}]` | `tarefas_ms_5min` | Numeric (unsigned) |
| `{#FLUXO}: processador mais lento (ms/tarefa)` | `nifi.fluxo.lento_ms[{#FLUXO_ID}]` | `proc_mais_lento_ms_por_tarefa` | Numeric (float) |
| `{#FLUXO}: processador mais lento (nome)` | `nifi.fluxo.lento_nome[{#FLUXO_ID}]` | `proc_mais_lento` | Character |
| `{#FLUXO}: versionamento` | `nifi.fluxo.versao[{#FLUXO_ID}]` | `versionamento` | Character |

## Detalhe D — Protótipos de trigger (alteração 10)

Dentro da regra → *Trigger prototypes*:

| Name | Severity | Expression |
|---|---|---|
| `{#FLUXO}: processador parado` | High | `min(/<T>/nifi.fluxo.parados[{#FLUXO_ID}],2m)>0 and {$NIFI.DEVE_RODAR:"{#FLUXO_ID}"}=1` |
| `{#FLUXO}: processador inválido` | High | `min(/<T>/nifi.fluxo.invalidos[{#FLUXO_ID}],2m)>0 and {$NIFI.DEVE_RODAR:"{#FLUXO_ID}"}=1` |
| `{#FLUXO}: fila acima de 80%` | Warning | `min(/<T>/nifi.fluxo.fila_uso[{#FLUXO_ID}],5m)>=80` |
| `{#FLUXO}: fila em contrapressão` | High | `min(/<T>/nifi.fluxo.contrapressao[{#FLUXO_ID}],5m)>0` |
| `{#FLUXO}: alteração não versionada` | Information | `last(/<T>/nifi.fluxo.deriva[{#FLUXO_ID}])>0` |

**Por que as portas inválidas não geram alerta:** uma porta de saída sem conexão aparece como "inválida" no NiFi, mas
não indica falha. No HML foram 35 casos, todos falsos. O script conta essas portas à parte.

---

## Códigos para colar

**Código 1 — disco dos repositórios** (alteração 1)

```javascript
var b = JSON.parse(value);
var repos = [].concat(
  b.flowFileRepositoryStorageUsage ? [b.flowFileRepositoryStorageUsage] : [],
  b.contentRepositoryStorageUsage || [],
  b.provenanceRepositoryStorageUsage || []);
var max = 0;
repos.forEach(function (r) {
  var u = parseFloat(String(r.utilization || '0').replace('%', '').replace(',', '.'));
  if (r.totalSpaceBytes > 0) { u = 100 * r.usedSpaceBytes / r.totalSpaceBytes; }
  if (!isNaN(u) && u > max) { max = u; }
});
return Math.round(max * 100) / 100;
```

**Código 2 — threads** (alteração 4)

```javascript
return parseInt(JSON.parse(value).totalThreads, 10) || 0;
```

**Código 3 — tempo em GC** (alteração 5)

```javascript
var b = JSON.parse(value);
var total = 0;
(b.garbageCollection || []).forEach(function (g) { total += Number(g.collectionMillis) || 0; });
return total;
```

**Código 4 — bulletins** (alteração 6)

```javascript
var body = JSON.parse(value);
var lista = (body.bulletinBoard && body.bulletinBoard.bulletins) ? body.bulletinBoard.bulletins : [];
var warn = 0, err = 0, semPermissao = 0, last = '';
lista.forEach(function (e) {
  if (!e.bulletin) { semPermissao++; return; }
  var lvl = String(e.bulletin.level || '').toUpperCase();
  if (lvl === 'WARNING' || lvl === 'WARN') { warn++; }
  if (lvl === 'ERROR') {
    err++;
    if (!last) { last = (e.bulletin.sourceName || '') + ': ' + String(e.bulletin.message || '').substring(0, 200); }
  }
});
return JSON.stringify({ warn: warn, error: err, sem_permissao: semPermissao, last_error: last });
```

**Código 5 — status dos fluxos** (alteração 9): arquivo `preprocessamento_fluxos.js`, enviado junto.
