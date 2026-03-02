# Planka Stack — Planka + MCP + Engrams

Stack completo para gestão de projetos com IA, pronto a replicar via Docker Compose.

## O que inclui

| Serviço | Imagem | Porta | Descrição |
|---------|--------|-------|-----------|
| `postgres` | `postgres:16-alpine` | — | Base de dados do Planka |
| `planka` | `ghcr.io/plankanban/planka:latest` | `80` | Planka (kanban board) |
| `planka-mcp` | `chmald/planka-mcp:latest` | `3001` | MCP server para o Planka |
| `engrams-gateway` | build local | `8001` | MCP Engrams (stdio interno) + proxy SSE exposto |

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Docker Engine + Compose)
- [Claude Code CLI](https://claude.ai/claude-code) e/ou [Cursor](https://www.cursor.com/) para usar os MCPs
- `git`, `openssl` (para gerar `SECRET_KEY`)

## Início rápido

```bash
# 1. Clonar o repositório
git clone <repo-url>
cd planka

# 2. Criar ficheiro de ambiente a partir do exemplo
cp .env.example .env

# 3. Preencher .env com os teus valores:
#    - SECRET_KEY: openssl rand -hex 64
#    - MCP_AGENT_PASSWORD: password forte
vim .env   # ou nano .env, code .env, etc.

# 4. Subir todos os serviços
docker compose up -d

# 5. Aguardar ~30s e abrir o Planka
open http://localhost   # macOS
# ou aceder a http://localhost no browser
```

O utilizador admin do Planka é criado automaticamente com as credenciais `MCP_AGENT_EMAIL` / `MCP_AGENT_PASSWORD` definidas no `.env`.

## MCPs

### Claude Code

O ficheiro `.mcp.json` na raiz já configura os dois servidores MCP para o Claude Code:

```json
{
  "mcpServers": {
    "planka": { "type": "sse", "url": "http://localhost:3001/sse" },
    "engrams": { "type": "sse", "url": "http://localhost:8001/sse" }
  }
}
```

Basta iniciar o `claude` na raiz do projeto — os MCPs são carregados automaticamente.

### Cursor

O ficheiro `.cursor/mcp.json` configura os mesmos servidores para o Cursor. Após subir os containers, reinicia o Cursor para carregar os servidores.

### Adicionar Engrams globalmente (todos os projetos)

```bash
claude mcp add --transport sse --scope user engrams http://localhost:8001/sse
```

## Engrams

O [Engrams MCP](https://github.com/dmarx/engrams) fornece memória persistente para agentes de IA.

- **Container:** `engrams-gateway` — lança `engrams-mcp` em stdio internamente e expõe um proxy SSE em `localhost:8001`.
- **Dados:** guardados em `./engrams-data/engrams/` (bind mount → `/data/engrams` dentro do container).
- **workspace_id:** em todas as chamadas Engrams usa sempre `workspace_id="/data/engrams"` (o container não resolve paths do host).

### Scripts úteis (na pasta `engrams-data/`)

```bash
# Consultar a base SQLite pelo host
./engrams-data/query.sh ".tables"
./engrams-data/query.sh "SELECT * FROM decisions ORDER BY id DESC LIMIT 5;"

# Reconstruir e subir só o engrams-gateway
./engrams-gateway/up.sh
```

## Estrutura do repositório

```
planka/
├── docker-compose.yml          # Stack principal
├── .env.example                # Template de variáveis de ambiente
├── .mcp.json                   # MCPs para Claude Code
├── CLAUDE.md                   # Instruções para o Claude Code CLI
├── engrams-gateway/            # Imagem custom: MCP stdio + proxy SSE
│   ├── Dockerfile
│   ├── server.js
│   ├── package.json
│   └── up.sh
├── engrams-proxy/              # Implementação alternativa do proxy (referência)
├── engrams-mcp/                # Backup e notas de migração
├── engrams-data/               # Bind mount dos dados Engrams
│   ├── README.md               # Instruções de uso
│   ├── CLAUDE-engrams-docker.md
│   ├── call-log-decision.sh    # Gravar decisão via CLI
│   └── query.sh                # Consultar SQLite pelo host
└── .cursor/                    # Configuração MCP para Cursor
    ├── mcp.json
    └── README-MCP.md
```

## Replicar noutras máquinas

```bash
git clone <repo-url>
cd planka
cp .env.example .env
# editar .env (SECRET_KEY e passwords)
docker compose up -d
```

Os dados do Planka (postgres, avatars, attachments) ficam em volumes Docker nomeados — são locais à máquina. Para migrar dados existentes, exporta/importa os volumes manualmente.

Os dados do Engrams ficam em `./engrams-data/engrams/` — podes copiar esta pasta entre máquinas para preservar a memória.
