# Um único container: MCP Engrams (stdio, interno) + proxy HTTP (exposto).
# Não usa supergateway; o proxy fala com engrams-mcp por stdin/stdout.

FROM node:20-slim

# Python + uv para engrams-mcp
RUN apt-get update && apt-get install -y curl python3 python3-venv python3-pip && \
    python3 -m pip install --break-system-packages uv && \
    rm -rf /var/lib/apt/lists/*

# engrams-mcp como ferramenta (stdio)
RUN uv tool install engrams-mcp
ENV PATH="/root/.local/bin:$PATH"

RUN mkdir -p /data/engrams

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./

ENV WORKSPACE_DIR=/data/engrams
ENV PROXY_PORT=8001

EXPOSE 8001

# Só o proxy fica exposto; o MCP corre interno (child process stdio).
CMD ["node", "server.js"]
