FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV PROXY_PORT=8001
ENV ENGRAMS_BACKEND_URL=http://engrams-mcp:8000

EXPOSE 8001

CMD ["npm", "start"]
