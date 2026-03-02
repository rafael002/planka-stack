#!/usr/bin/env bash
# Consultar a base Engrams pelo host (esta pasta está no host).
# Uso:
#   ./query.sh              → abre sqlite3 interativo
#   ./query.sh "SELECT ..." → executa a query e sai

cd "$(dirname "$0")"
DB="context.db"

if [[ ! -f "$DB" ]]; then
  echo "Ainda não existe $DB (o Engrams cria quando o MCP for usado)."
  exit 1
fi

if [[ -n "$1" ]]; then
  sqlite3 "$DB" "$1"
else
  sqlite3 "$DB"
fi
