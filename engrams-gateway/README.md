# Engrams Gateway

Um único container: **MCP Engrams corre interno** (stdio, processo filho) e **só o proxy HTTP fica exposto** (porta 8001).

- Sem supergateway, sem ligação SSE entre proxy e MCP.
- O proxy fala com o engrams-mcp por stdin/stdout (um processo, uma fila).
- Cursor e Claude ligam a `http://localhost:8001/sse`.

## Uso

```bash
docker compose up -d engrams-gateway
```

Configuração MCP: `"url": "http://localhost:8001/sse"`.

## Variáveis

- `PROXY_PORT` (default 8001)
- `WORKSPACE_DIR` (default /data/engrams) — passado ao engrams-mcp para o SQLite
