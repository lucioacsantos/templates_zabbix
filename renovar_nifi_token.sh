#!/usr/bin/env bash
# renovar_nifi_token.sh — Renova o token do Apache NiFi e atualiza {$NIFI.TOKEN} no Zabbix.
#
# Fluxo:
#   1. Loga no NiFi (POST /access/token, form-encoded) — token expira em 8h (single-user).
#   2. Descobre o hostid/hostmacroid da macro no Zabbix via API.
#   3. Atualiza a macro (secret) com o novo token.
#
# Crontab: 0 */7 * * * /opt/zabbix-nifi/renovar_nifi_token.sh >> /var/log/nifi-token.log 2>&1
#
# Config em ENV_FILE (ex.: .env do projeto):
#   token_zabbix=<API token do Zabbix>
#   nifi_username=<usuario NiFi>
#   nifi_password=<senha NiFi>

set -euo pipefail

ZABBIX_API="http://localhost/api_jsonrpc.php"
NIFI_TOKEN_URL="https://localhost:8443/nifi-api/access/token"
ZABBIX_HOST_NAME="${ZABBIX_HOST_NAME:-nifi-local}"
ZABBIX_MACRO='{$NIFI.TOKEN}'
ENV_FILE="${ENV_FILE:-/home/lucio/Desenvolvimento/templates_zabbix/.env}"

log() { echo "[$(date '+%F %T')] $*"; }

[[ -r "$ENV_FILE" ]] || { log "ERRO: $ENV_FILE nao encontrado"; exit 1; }
set -a; source "$ENV_FILE"; set +a

api() {
  curl -s -X POST "$ZABBIX_API" \
    -H "Authorization: Bearer $token_zabbix" \
    -H "Content-Type: application/json-rpc" \
    -d "$1"
}

# 1) login no NiFi (201 + corpo = token)
NIFI_TOKEN=$(curl -sk -X POST "$NIFI_TOKEN_URL" \
  --data-urlencode "username=${nifi_username}" \
  --data-urlencode "password=${nifi_password}") || true
if [[ ${#NIFI_TOKEN} -lt 100 ]]; then
  log "ERRO: login NiFi falhou (token com ${#NIFI_TOKEN} chars)"
  exit 1
fi
log "Token NiFi obtido (${#NIFI_TOKEN} chars)"

# 2) resolver hostid
HOSTID=$(api "{\"jsonrpc\":\"2.0\",\"method\":\"host.get\",\"params\":{\"filter\":{\"host\":[\"$ZABBIX_HOST_NAME\"]},\"output\":[\"hostid\"]},\"id\":1}" \
  | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print(r[0]["hostid"] if r else "")') || true
[[ -n "$HOSTID" ]] || { log "ERRO: host '$ZABBIX_HOST_NAME' nao encontrado no Zabbix"; exit 1; }

# 3) localizar hostmacroid da macro
HOSTMACROID=$(api "{\"jsonrpc\":\"2.0\",\"method\":\"usermacro.get\",\"params\":{\"hostids\":[\"$HOSTID\"],\"output\":[\"hostmacroid\",\"macro\"]},\"id\":1}" \
  | python3 -c "
import json, sys
r = json.load(sys.stdin)['result']
for m in r:
    if m['macro'] == '$ZABBIX_MACRO':
        print(m['hostmacroid']); break
") || true
[[ -n "$HOSTMACROID" ]] || { log "ERRO: $ZABBIX_MACRO nao existe no host '$ZABBIX_HOST_NAME'"; exit 1; }

# 4) atualizar macro (valor secreto nunca logado)
UPD=$(api "{\"jsonrpc\":\"2.0\",\"method\":\"usermacro.update\",\"params\":{\"hostmacroid\":\"$HOSTMACROID\",\"value\":\"$NIFI_TOKEN\"},\"id\":1}")
if echo "$UPD" | grep -q '"result"'; then
  log "OK: $ZABBIX_MACRO atualizada (hostmacroid=$HOSTMACROID)"
else
  log "ERRO: usermacro.update: $UPD"
  exit 1
fi
