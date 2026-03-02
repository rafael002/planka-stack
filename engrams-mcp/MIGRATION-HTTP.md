# Migração engrams-mcp: SSE + supergateway → HTTP nativo

**Nota:** Revertido para SSE (supergateway) porque o modo HTTP do engrams-mcp devolvia 404 em `/mcp` no Cursor. Ver backup para restaurar HTTP no futuro.

## O que mudou (referência da migração não aplicada)

- **Antes:** `engrams-mcp --mode stdio` + supergateway (SSE em `/sse`, POST em `/message`). Uma única ligação SSE por processo; segunda ligação causava crash e restart do container.
- **Agora:** `engrams-mcp --mode http --port 8000` (FastMCP Streamable HTTP em `/mcp`). Suporta múltiplos clientes; sem supergateway.

## Backup

- `engrams-mcp/backup/Dockerfile.bak` – Dockerfile anterior
- `engrams-mcp/backup/mcp.json.bak` – config MCP anterior (SSE em :8000/sse)

## Teste no Cursor

1. Reconstruir e subir o container:
   ```bash
   docker compose build engrams-mcp
   docker compose up -d engrams-mcp
   ```
2. Verificar que está estável (sem restarts):
   ```bash
   docker ps | grep engrams
   docker logs engrams-mcp --tail 20
   ```
3. Reiniciar o Cursor (quit e abrir de novo).
4. No Cursor, verificar em Settings → MCP que **engrams** está "connected".
5. Numa conversa, pedir ao agente para chamar uma ferramenta Engrams (ex.: "Lista as decisões no Engrams" ou "Dá-me o project briefing executive do Engrams"). O agente deve usar `workspace_id="/data/engrams"`.

## Configurar no Claude Code

Se o teste no Cursor der certo, no Claude Code (`.claude.json` ou User MCPs) alterar o servidor **engrams** para:

- **Transport:** HTTP (em vez de SSE)
- **URL:** `http://localhost:8000/mcp`

Exemplo em `.claude.json` (em `mcpServers.engrams`):

```json
"engrams": {
  "type": "http",
  "url": "http://localhost:8000/mcp"
}
```

Manter a regra em `~/.claude/CLAUDE.md`: usar sempre `workspace_id="/data/engrams"` nas chamadas Engrams.
