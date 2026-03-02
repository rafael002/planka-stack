# Backup antes da migração para HTTP (engrams-mcp)

- **Dockerfile.bak** – Dockerfile original (stdio + supergateway)
- **mcp.json.bak** – conteúdo de `.cursor/mcp.json` e `.mcp.json` (SSE em localhost:8000/sse)

Para reverter: copiar `Dockerfile.bak` para `Dockerfile` e reconstruir a imagem.
