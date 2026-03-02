#!/usr/bin/env bash
# Remove containers antigos, build e sobe engrams-gateway.
set -e
cd "$(dirname "$0")/.."

echo "Parar e remover engrams-mcp e engrams-proxy (se existirem)..."
docker stop engrams-mcp engrams-proxy 2>/dev/null || true
docker rm engrams-mcp engrams-proxy 2>/dev/null || true

echo "Build engrams-gateway (pode demorar vários minutos)..."
docker compose build engrams-gateway

echo "Subir engrams-gateway..."
docker compose up -d engrams-gateway

echo "Feito. Proxy em http://localhost:8001/sse"
docker ps --filter name=engrams-gateway
