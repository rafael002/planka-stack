# Engrams proxy

Intermediário que mantém **uma única** ligação SSE ao `engrams-mcp` e encaminha os pedidos de vários clientes (Cursor, Claude Code, etc.).

Assim evita-se o erro "Already connected to a transport" e os restarts do container quando mais do que um cliente tenta ligar ao engrams ao mesmo tempo.

## Como funciona

- **engrams-mcp** (porta 8000): continua a aceitar só uma ligação SSE (supergateway).
- **engrams-proxy** (porta 8001): é o único cliente dessa ligação; expõe GET `/sse`, POST `/sse` (Streamable HTTP), POST `/message` e POST `/messages` (SDK MCP usa `/messages`).

Os clientes (Cursor, Claude) ligam a **http://localhost:8001/sse** em vez de 8000.

## Uso

```bash
docker compose up -d engrams-mcp engrams-proxy
```

Configuração MCP: usar `"url": "http://localhost:8001/sse"` para o servidor engrams.

## Variáveis

- `PROXY_PORT` (default 8001)
- `ENGRAMS_BACKEND_URL` (default `http://engrams-mcp:8000`)
- `PROXY_PUBLIC_URL` (default `http://localhost:8001`) — usado no evento SSE `endpoint` enviado aos clientes

## Testar o proxy (curl)

Com os containers a correr:

```bash
# Saúde
curl -s http://localhost:8001/health

# Obter sessionId (GET /sse; interromper com Ctrl+C após ver o evento endpoint)
curl -sN http://localhost:8001/sse
# Esperado: linha "event: endpoint" e "data: /messages?sessionId=..."

# POST (usar um sessionId obtido acima)
curl -s -X POST "http://localhost:8001/messages?sessionId=SEU_SESSION_ID" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Se o Cursor continuar a falhar, verificar o log do MCP no Cursor (Output → "MCP" ou "user-engrams") e partilhar a mensagem de erro exata.
