FROM python:3.12-slim

# Install Node.js (for supergateway) and curl
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager/runner)
RUN pip install uv

# Pre-install engrams-mcp as uv tool (avoids download on every start)
RUN uv tool install engrams-mcp

# Ensure uv tool bin is in PATH
ENV PATH="/root/.local/bin:$PATH"

# Install supergateway globally (converts stdio MCP → SSE)
RUN npm install -g supergateway

# Directory for Engrams SQLite persistence
RUN mkdir -p /data/engrams

WORKDIR /app

EXPOSE 8000

ENV WORKSPACE_DIR=/data/engrams

# engrams-mcp --mode stdio runs as a pure stdio MCP server (no HTTP server).
# Supergateway wraps it and exposes SSE on port 8000.
CMD ["supergateway", \
     "--stdio", "engrams-mcp --mode stdio", \
     "--port", "8000", \
     "--ssePath", "/sse", \
     "--messagePath", "/message"]
