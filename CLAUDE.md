# =============================================================
# MCP STRATEGY — Planka + Engrams
# Lido automaticamente pelo Claude Code CLI a partir da raiz do projeto.
# Aplica-se também a qualquer agente que use estes MCPs.
# =============================================================

# CRITICAL: Begin EVERY response with the status of both MCPs:
#   [PLANKA_ACTIVE | ENGRAMS_ACTIVE]
#   [PLANKA_INACTIVE | ENGRAMS_ACTIVE]
#   [PLANKA_ACTIVE | ENGRAMS_INACTIVE]
#   [PLANKA_INACTIVE | ENGRAMS_INACTIVE]

# =============================================================
# ENGRAMS — Memória persistente
# =============================================================
# workspace_id: SEMPRE usar workspace_id="/data/engrams" em todas as chamadas Engrams
# quando o servidor corre em Docker (proxy localhost:8001). Nunca usar o path do host.

# SECTION DIRECTORY (fetch full detail on demand):
#   GOVERNANCE  → get_custom_data("engrams_strategy","governance")
#   POST_TASK   → get_custom_data("engrams_strategy","post_task")
#   QUALITY     → get_custom_data("engrams_strategy","quality")
#   POST_TASK_SETUP → get_custom_data("engrams_strategy","post_task_setup")

# =============================================================
# PLANKA — Gestão de tarefas
# =============================================================
# MCP disponível em http://localhost:3001/sse
# Usar SEMPRE que existirem tarefas, features, bugs ou trabalho a rastrear.

# =============================================================
# INIT — Executar no início de cada sessão
# =============================================================

INIT (run at session start — call both checks in parallel):

  CHECK ENGRAMS:
    1. Determinar workspace: procurar context.db em ACTUAL_WORKSPACE_ID/engrams-data/engrams/
       Se encontrado → LOAD_EXISTING. Senão → NEW_SETUP.
    LOAD_EXISTING — chamar em paralelo (workspace_id="/data/engrams"):
      get_product_context, get_active_context, get_decisions(limit=5),
      get_progress(limit=5), get_system_patterns(limit=5),
      get_recent_activity_summary(hours_ago=24, limit_per_type=3)
      Se sucesso → [ENGRAMS_ACTIVE]. Se falhar → [ENGRAMS_INACTIVE].
    NEW_SETUP:
      Informar utilizador; perguntar "Inicializar base Engrams? [Sim/Não]".
      Se Sim → fetch POST_TASK_SETUP. Se Não → [ENGRAMS_INACTIVE].

  CHECK PLANKA:
    Tentar listar os boards disponíveis (ex.: get_boards ou equivalente).
    Se sucesso → [PLANKA_ACTIVE], mostrar boards disponíveis ao utilizador.
    Se falhar  → [PLANKA_INACTIVE], informar que o container pode não estar a correr.

# =============================================================
# USO PROATIVO — regras sempre activas
# =============================================================

PLANKA PROACTIVE USAGE (quando [PLANKA_ACTIVE]):
  CRIAR CARD — sempre que o utilizador mencionar uma tarefa nova, feature, bug ou
    melhoria. Perguntar em qual board/lista criar se não for óbvio.
  MOVER CARD — ao começar a trabalhar numa tarefa: mover para "In Progress" (ou equivalente).
    Ao concluir: mover para "Done" (ou equivalente).
  COMENTAR — ao terminar uma tarefa significativa, adicionar um comentário ao card
    com um resumo do que foi feito.
  CONSULTAR — no início da sessão, se [PLANKA_ACTIVE], verificar se há cards
    "In Progress" do agente para continuar trabalho pendente.

ENGRAMS PROACTIVE LOGGING (quando [ENGRAMS_ACTIVE]):
  log_decision    → decisões estratégicas/arquiteturais ("Usar X para Y")
  log_progress    → conclusão de tarefas, correções, alterações de código
  update_active_context → quando o foco muda ou surgem bloqueios
  SYNC COM PLANKA → ao criar um card no Planka, guardar o card_id no log_progress
    do Engrams para rastreabilidade cruzada.

# =============================================================
# NOTAS
# =============================================================
# - Os containers têm de estar a correr: docker compose up -d
# - Se [PLANKA_INACTIVE] ou [ENGRAMS_INACTIVE], informar o utilizador e sugerir:
#     docker compose up -d planka-mcp engrams-gateway
# - Nunca bloquear o fluxo por causa de um MCP inativo; continuar com o que estiver disponível.
