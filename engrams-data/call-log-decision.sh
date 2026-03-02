#!/usr/bin/env bash
# Envia uma chamada MCP (tools/call) para o Engrams via SSE.
# Requer: engrams-gateway a correr (docker compose up -d engrams-gateway).
#
# O transporte SSE (supergateway) exige sessionId: é preciso primeiro abrir GET /sse
# para obter um sessionId e depois enviar POST /message?sessionId=<id>.
# No Cursor isso é feito ao conectar o servidor "engrams" em mcp.json.
#
# Uso:
#   SESSION_ID=<id> ./call-log-decision.sh [summary] [rationale]
#   (Para obter SESSION_ID: conectar a GET /sse e ler o sessionId no primeiro evento/URL.)
#   Ou usar o Cursor com o MCP Engrams ligado e chamar a ferramenta log_decision a partir da UI.

set -e
BASE_URL="${ENGRAMS_SSE_URL:-http://localhost:8001}"
SESSION_ID="${SESSION_ID:-}"
SUMMARY="${1:-Projeto Planka: memória Engrams via SSE}"
RATIONALE="${2:-Teste de gravação pelo endpoint /message (supergateway).}"

# O container usa WORKSPACE_DIR=/data/engrams; o servidor pode aceitar este workspace_id
WORKSPACE_ID="${WORKSPACE_ID:-/data/engrams}"

if [[ -z "$SESSION_ID" ]]; then
  echo "Aviso: SESSION_ID não definido. O endpoint /message exige sessionId (obtido ao conectar a GET /sse)."
  echo "Defina SESSION_ID=... ou use o Cursor com o MCP Engrams para gravar."
  echo ""
fi

if command -v jq >/dev/null 2>&1; then
  JSON=$(jq -n \
    --arg wid "$WORKSPACE_ID" \
    --arg sum "$SUMMARY" \
    --arg rat "$RATIONALE" \
    --arg id "call-$(date +%s)" \
    '{ jsonrpc: "2.0", id: $id, method: "tools/call", params: { name: "log_decision", arguments: { workspace_id: $wid, summary: $sum, rationale: $rat } } }')
else
  # Fallback: evitar aspas no texto
  SUMMARY_ESC=$(echo "$SUMMARY" | sed 's/"/\\"/g')
  RATIONALE_ESC=$(echo "$RATIONALE" | sed 's/"/\\"/g')
  JSON="{\"jsonrpc\":\"2.0\",\"id\":\"call-$(date +%s)\",\"method\":\"tools/call\",\"params\":{\"name\":\"log_decision\",\"arguments\":{\"workspace_id\":\"$WORKSPACE_ID\",\"summary\":\"$SUMMARY_ESC\",\"rationale\":\"$RATIONALE_ESC\"}}}"
fi

echo "Request (summary): $SUMMARY"

if [[ -n "$SESSION_ID" ]]; then
  MESSAGE_URL="$BASE_URL/message?sessionId=$SESSION_ID"
else
  MESSAGE_URL="$BASE_URL/message"
fi
echo "POST $MESSAGE_URL"
echo ""

RESP=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$JSON" \
  "$MESSAGE_URL")

echo "Response: $RESP"

if echo "$RESP" | grep -q '"error"'; then
  echo "Chamada falhou (ver mensagem acima)."
  exit 1
fi

echo "Chamada enviada. Verificar: ./query.sh \"SELECT * FROM decisions ORDER BY id DESC LIMIT 3;\""
exit 0
