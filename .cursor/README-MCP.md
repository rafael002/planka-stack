# MCP neste projeto

- **planka**: `http://localhost:3001/sse` (container planka-mcp)
- **engrams**: `http://localhost:8001/sse` (engrams-gateway: MCP interno, só proxy exposto)

Antes de usar: `docker compose up -d planka-mcp engrams-gateway`.

Se alterares `.cursor/mcp.json`, **reinicia o Cursor** (quit e abrir de novo) para os servidores MCP serem recarregados.
