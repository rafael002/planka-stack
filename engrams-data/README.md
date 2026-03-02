# Engrams – dados no host

Esta pasta é um **bind mount**: o que o container `engrams-gateway` grava em `/data/engrams` aparece aqui. Ou seja, estás a ver os ficheiros **no host**.

## Consultar com SQLite (pelo host)

Requer `sqlite3` instalado (macOS costuma trazer).

```bash
# Entrar na pasta
cd engrams-data

# Abrir a base (modo interativo)
./query.sh

# Ou executar uma query direta
./query.sh ".tables"
./query.sh "SELECT * FROM decisions LIMIT 5;"
```

Se preferires sem o script:

```bash
cd engrams-data
sqlite3 context.db
```

O ficheiro `context.db` só aparece depois do Engrams MCP ter sido usado e criado a base.

## Erro "Invalid request parameters" (Claude Code / Cursor)

Se o cliente conseguir ligar ao Engrams mas as chamadas falharem com **Invalid request parameters (-32602)**, a causa é quase sempre o **workspace_id**.

O servidor corre **dentro do Docker** e só conhece o path **/data/engrams**. Se o Claude Code enviar o path do teu projeto no host (ex.: `/Users/ti/Projetos/game`), esse path não existe dentro do contentor e o servidor rejeita.

**Solução:** Em todas as chamadas às ferramentas Engrams, usar **workspace_id = "/data/engrams"**.

- No **CLAUDE.md** deste repo isso já está indicado; o agente deve passar `workspace_id="/data/engrams"` em todas as chamadas quando usar Engrams via Docker.
- Se usas o Claude Code **globalmente** (outros projetos), precisas da mesma regra: no CLAUDE.md desse projeto ou em `~/.claude/CLAUDE.md` escreve que, quando o Engrams for o servidor em Docker (proxy em localhost:8001), usar sempre `workspace_id="/data/engrams"`.

**get_project_briefing:** O parâmetro `level` deve ser exatamente um de: `executive`, `overview`, `detailed`, `comprehensive` (ex.: `level: "executive"` é válido).

---

## Servidor por SSE

O Engrams está configurado por **SSE** no Cursor (`.cursor/mcp.json`): um único container **engrams-gateway** expõe o proxy em `http://localhost:8001/sse`; o MCP corre interno (stdio).

Para gravar uma decisão a partir do host (com o container a correr):

```bash
cd engrams-data
./call-log-decision.sh "Resumo da decisão" "Motivo opcional"
```

Isto envia `tools/call` para `log_decision` ao endpoint `/message`. Depois podes confirmar com `./query.sh "SELECT * FROM decisions ORDER BY id DESC LIMIT 5;"`.

## Como o Claude Code grava

O **Claude Code** (CLI) grava no Engrams ao usar as ferramentas MCP. Fluxo:

1. **Configuração**  
   O projeto já tem `.mcp.json` na raiz com o servidor `engrams` (SSE em `http://localhost:8001/sse`, via proxy). O Claude Code lê este ficheiro quando invocado a partir da raiz do projeto.

2. **Container**  
   O servidor Engrams está no Docker. Antes de usar o Claude Code, sobe o contentor:
   ```bash
   docker compose up -d engrams-gateway
   ```

3. **Invocar o Claude Code**  
   Na raiz do projeto (onde está `.mcp.json` e `CLAUDE.md`):
   ```bash
   cd /caminho/para/planka
   claude
   ```
   O Claude Code conecta-se ao SSE ao proxy (engrams-gateway) e passa a ter acesso às ferramentas (por ex. `log_decision`, `log_progress`, `get_decisions`).

4. **Gravar**  
   - **Pedido explícito**: “Guarda no Engrams a decisão de usarmos Docker Compose para este projeto.” → o agente chama `log_decision` com `workspace_id` = diretório atual e os campos que preencheres.  
   - **Automático**: O `CLAUDE.md` instrui o agente a usar `log_decision` para decisões estratégicas e `log_progress` para tarefas/conclusões; com [ENGRAMS_ACTIVE], o agente pode gravar proativamente.

5. **workspace_id**  
   O agente deve usar o caminho absoluto do workspace (o diretório de onde corriste `claude`) como `workspace_id` em todas as chamadas Engrams. O servidor no container persiste em `/data/engrams` (mapeado para `./engrams-data/` no host), independentemente do `workspace_id` enviado.

Resumo: com `engrams-gateway` a correr e `claude` invocado na raiz do projeto, o Claude Code grava no Engrams sempre que chamar as ferramentas MCP (por pedido teu ou pelas regras do `CLAUDE.md`).

### Engrams no Claude Code globalmente (todos os projetos)

Para ter o servidor Engrams disponível em **qualquer** projeto (sem depender do `.mcp.json` de cada repo):

```bash
claude mcp add --transport sse --scope user engrams http://localhost:8001/sse
```

Isto grava a configuração em `~/.claude/` (scope user). O `engrams-mcp` continua a ser o container Docker: em qualquer pasta, ao correr `claude` o Engrams estará disponível **se** o container estiver a correr (`docker compose up -d engrams-gateway` a partir do repo onde está o `docker-compose.yml`, ou o mesmo URL noutra instância).

Nota: em alguns casos o scope user pode ser sobreposto por configuração de projeto; se num repo não vires o Engrams, usa o `.mcp.json` nesse projeto ou adiciona aí com `claude mcp add --transport sse engrams http://localhost:8001/sse`.
