# Survey AAP — Execução de Sintéticos Dynatrace sob Demanda

Configure este survey no Job Template do Ansible Automation Platform
para o playbook `dynatrace_sinteticos_sob_demanda.yml`.

---

## Campos do Survey

### 1. `dynatrace_environment_id` — **Obrigatório**

| Campo           | Valor                                      |
|-----------------|--------------------------------------------|
| Prompt          | ID do ambiente Dynatrace                   |
| Descrição       | Identificador do tenant (ex.: `abc12345`). Encontrado na URL: `https://<id>.live.dynatrace.com` |
| Tipo de resposta| Texto                                      |
| Obrigatório     | Sim                                        |
| Valor padrão    | *(vazio)*                                  |

---

### 2. `dynatrace_api_token` — **Obrigatório**

| Campo           | Valor                                                   |
|-----------------|---------------------------------------------------------|
| Prompt          | Token de API do Dynatrace                               |
| Descrição       | Token com escopos `syntheticExecutions.write` e `syntheticExecutions.read`. **Recomendado:** use Credencial Customizada no AAP em vez de survey (veja nota abaixo). |
| Tipo de resposta| Senha (mascarado)                                       |
| Obrigatório     | Sim                                                     |
| Valor padrão    | *(vazio)*                                               |

> **Nota sobre segurança:** Prefira injetar o token via **Credencial Customizada** no AAP
> (tipo "Custom Credential Type") com injeção em variável de ambiente ou extra_vars.
> O campo de survey tipo "senha" é aceitável para ambientes menos críticos.

---

### 3. `synthetic_monitor_ids` — **Obrigatório**

| Campo           | Valor                                                   |
|-----------------|---------------------------------------------------------|
| Prompt          | IDs dos monitores sintéticos                            |
| Descrição       | Um ou mais IDs separados por vírgula. Exemplos: `HTTP_CHECK-AAA111` ou `HTTP_CHECK-AAA111,SYNTHETIC_TEST-BBB222,HTTP_CHECK-CCC333` |
| Tipo de resposta| Texto (área de texto para múltiplos)                    |
| Obrigatório     | Sim                                                     |
| Valor padrão    | *(vazio)*                                               |
| Validação regex | `^[\w\-]+(,[\w\-]+)*$`                                  |

---

### 4. `synthetic_locations` — *Opcional*

| Campo           | Valor                                                   |
|-----------------|---------------------------------------------------------|
| Prompt          | Locais de execução (opcional)                           |
| Descrição       | IDs de locais separados por vírgula. Se vazio, usa os locais padrão de cada monitor. Ex.: `SYNTHETIC_LOCATION-9BB04DAEBA71B8CA,SYNTHETIC_LOCATION-ACCA399FAA1194DD` |
| Tipo de resposta| Texto                                                   |
| Obrigatório     | Não                                                     |
| Valor padrão    | *(vazio)*                                               |

---

### 5. `processing_mode` — *Opcional*

| Campo           | Valor                                                           |
|-----------------|-----------------------------------------------------------------|
| Prompt          | Modo de processamento                                           |
| Descrição       | Define como os resultados são tratados pelo Dynatrace           |
| Tipo de resposta| Lista multipla escolha (uma opção)                              |
| Obrigatório     | Não                                                             |
| Opções          | `STANDARD` / `DISABLE_PROBLEM_DETECTION` / `EXECUTIONS_DETAILS_ONLY` |
| Valor padrão    | `STANDARD`                                                      |

**Significado das opções:**
- `STANDARD` — Comportamento normal; problemas são detectados e alertas gerados.
- `DISABLE_PROBLEM_DETECTION` — Executa sem criar problemas/alertas (útil para testes).
- `EXECUTIONS_DETAILS_ONLY` — Apenas coleta resultados sem processamento adicional.

---

### 6. `fail_on_performance_issue` — *Opcional*

| Campo           | Valor                              |
|-----------------|------------------------------------|
| Prompt          | Falhar em problema de performance? |
| Descrição       | Se marcado, a execução falha quando há degradação de performance |
| Tipo de resposta| Booleano (checkbox)                |
| Obrigatório     | Não                                |
| Valor padrão    | `false`                            |

---

### 7. `stop_on_problem` — *Opcional*

| Campo           | Valor                                |
|-----------------|--------------------------------------|
| Prompt          | Parar se ocorrer problema?           |
| Descrição       | Se marcado, não agendará execuções se houver problema ativo |
| Tipo de resposta| Booleano (checkbox)                  |
| Obrigatório     | Não                                  |
| Valor padrão    | `false`                              |

---

### 8. `poll_interval_seconds` — *Opcional*

| Campo           | Valor                                |
|-----------------|--------------------------------------|
| Prompt          | Intervalo de polling (segundos)      |
| Descrição       | Tempo entre verificações do status do batch |
| Tipo de resposta| Inteiro                              |
| Obrigatório     | Não                                  |
| Valor padrão    | `10`                                 |
| Mínimo / Máximo | 5 / 60                               |

---

### 9. `poll_max_attempts` — *Opcional*

| Campo           | Valor                                     |
|-----------------|-------------------------------------------|
| Prompt          | Número máximo de tentativas de polling    |
| Descrição       | O playbook aguarda até `poll_max_attempts × poll_interval_seconds` segundos pelo resultado |
| Tipo de resposta| Inteiro                                   |
| Obrigatório     | Não                                       |
| Valor padrão    | `30`                                      |
| Mínimo / Máximo | 5 / 120                                   |

---

## Credencial Customizada (recomendado para o token)

Crie um **Custom Credential Type** no AAP para injetar o token de forma segura:

### Input configuration (YAML)
```yaml
fields:
  - id: dynatrace_api_token
    type: string
    label: Dynatrace API Token
    secret: true
  - id: dynatrace_environment_id
    type: string
    label: Dynatrace Environment ID
required:
  - dynatrace_api_token
  - dynatrace_environment_id
```

### Injector configuration (YAML)
```yaml
extra_vars:
  dynatrace_api_token: '{{ dynatrace_api_token }}'
  dynatrace_environment_id: '{{ dynatrace_environment_id }}'
```

Usando a credencial customizada, remova `dynatrace_api_token` e
`dynatrace_environment_id` do survey, mantendo apenas os campos de
seleção de monitores e opções de execução.

---

## Escopos de token necessários no Dynatrace

Acesse: **Settings → Integration → Dynatrace API → Generate Token**

| Escopo                      | Operação                        |
|-----------------------------|---------------------------------|
| `syntheticExecutions.write` | Disparar batch (POST)           |
| `syntheticExecutions.read`  | Consultar status do batch (GET) |

---

## Exemplo de execução via CLI (fora do AAP)

```bash
ansible-playbook dynatrace_sinteticos_sob_demanda.yml \
  -e "dynatrace_environment_id=abc12345" \
  -e "dynatrace_api_token=dt0c01.XXXX.YYYY" \
  -e "synthetic_monitor_ids=HTTP_CHECK-AAA111,SYNTHETIC_TEST-BBB222" \
  -e "processing_mode=DISABLE_PROBLEM_DETECTION" \
  -e "poll_interval_seconds=15" \
  -e "poll_max_attempts=20"
```
