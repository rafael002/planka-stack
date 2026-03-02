# Regra para Claude Code quando Engrams está em Docker (uso global)

Se adicionaste o Engrams ao Claude Code com scope user (`claude mcp add --transport sse --scope user engrams http://localhost:8001/sse`) e as chamadas falham com **Invalid request parameters**, copia a seguinte regra para o teu **~/.claude/CLAUDE.md** (ou para o CLAUDE.md de cada projeto onde uses o Engrams):

---

When using the Engrams MCP server at http://localhost:8001/sse (Docker, via proxy), the server runs inside a container and only has access to the path /data/engrams. In **every** Engrams tool call (get_product_context, get_active_context, get_decisions, log_decision, get_project_briefing, etc.), you MUST pass **workspace_id="/data/engrams"**. Do not use the current working directory path — the server cannot resolve host paths. Using any other workspace_id will result in "Invalid request parameters" (-32602).

For get_project_briefing, the **level** parameter must be exactly one of: "executive", "overview", "detailed", "comprehensive".

---

Assim o Claude Code passa a usar sempre o workspace_id correto quando falar com o Engrams em Docker, em qualquer projeto.
