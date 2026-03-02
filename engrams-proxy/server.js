/**
 * Proxy engrams-mcp: UMA ligação ao backend, vários clientes.
 *
 * O proxy abre uma única vez GET /sse para o engrams-mcp (supergateway).
 * Todos os clientes (Cursor, Claude, etc.) falam só com o proxy; o proxy
 * reencaminha pedidos para essa ligação e devolve respostas.
 *
 * Endpoints para clientes:
 *   GET  /sse       — abre SSE no proxy; recebe evento endpoint com /messages?sessionId=...
 *   POST /sse       — Streamable HTTP (resposta no body)
 *   POST /message   — JSON-RPC
 *   POST /messages  — JSON-RPC (SDK MCP)
 */

import express from 'express';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const PORT = parseInt(process.env.PROXY_PORT || '8001', 10);
const BACKEND = process.env.ENGRAMS_BACKEND_URL || 'http://engrams-mcp:8000';
const SSE_URL = `${BACKEND}/sse`;
const MESSAGE_URL = `${BACKEND}/message`;

const app = express();
app.use(express.json());

// --- Estado: uma ligação ao backend, muitos clientes no proxy ---
/** sessionId do backend (uma ligação GET /sse) */
let backendSessionId = null;
/** Promise da ligação em curso; evita abrir duas ao mesmo tempo */
let backendConnectPromise = null;
/** Clientes com SSE aberto: sessionId (proxy) -> { res } */
const clients = new Map();
/** Respostas pendentes: requestId -> { resolve, timeout } */
const pending = new Map();

const WAIT_SESSION_MS = 15000;
const REQUEST_TIMEOUT_MS = 60000;
const BACKEND_CONNECT_RETRIES = 5;
const BACKEND_CONNECT_DELAY_MS = 2000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getRequestId(body) {
  if (body == null) return undefined;
  if (typeof body.id !== 'undefined') return body.id;
  if (body.params?.requestId != null) return body.params.requestId;
  return undefined;
}

/**
 * Abre a única ligação SSE ao backend. Só corre uma vez (ou após queda).
 * Chamadas concorrentes esperam na mesma promise.
 */
function connectBackend() {
  if (backendSessionId) return Promise.resolve(backendSessionId);
  if (backendConnectPromise) return backendConnectPromise;

  backendConnectPromise = (async () => {
    let lastErr;
    for (let attempt = 1; attempt <= BACKEND_CONNECT_RETRIES; attempt++) {
      try {
        log(`Connecting to backend ${SSE_URL} (attempt ${attempt}/${BACKEND_CONNECT_RETRIES})`);
        const res = await fetch(SSE_URL, {
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
        });

        if (!res.ok) {
          throw new Error(`Backend SSE ${res.status}`);
        }
        const body = res.body;
        if (!body) throw new Error('No backend body');

        let buffer = '';
        const onLine = (line) => {
          if (!line.startsWith('data:')) return;
          const raw = line.slice(5).trim();
          if (!raw) return;
          try {
            const msg = JSON.parse(raw);
            if (msg.endpoint != null) {
              const url = typeof msg.endpoint === 'string' ? msg.endpoint : msg.endpoint?.url ?? msg.endpoint;
              if (url) {
                try {
                  const u = new URL(url);
                  backendSessionId = u.searchParams.get('sessionId') || null;
                } catch (_) {}
              }
              if (!backendSessionId && msg.sessionId) backendSessionId = msg.sessionId;
              if (backendSessionId) log(`Backend sessionId: ${backendSessionId}`);
            }
            const id = msg.id ?? msg.result?.id;
            if (id != null && pending.has(id)) {
              const entry = pending.get(id);
              pending.delete(id);
              if (entry.timeout) clearTimeout(entry.timeout);
              entry.resolve(msg);
            }
          } catch (_) {}
        };

        (async () => {
          try {
            for await (const chunk of body) {
              buffer += chunk.toString();
              const lines = buffer.split(/\n/);
              buffer = lines.pop() || '';
              for (const line of lines) onLine(line);
            }
          } catch (err) {
            log(`Backend stream closed: ${err.message} (code: ${err.code || 'n/a'})`);
            backendSessionId = null;
            backendConnectPromise = null;
            // Não reconectar: o supergateway não liberta o transport ao fechar a ligação.
            // Uma segunda GET /sse causa "Already connected" e crash do container.
            // Recuperação: reiniciar o container engrams-mcp; o próximo pedido ao proxy fará nova ligação.
          }
        })();

        for (let i = 0; i < 150; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (backendSessionId) return backendSessionId;
        }
        backendConnectPromise = null;
        throw new Error('Timeout waiting for backend sessionId');
      } catch (err) {
        lastErr = err;
        log(`Backend connect attempt ${attempt} failed: ${err.message}`);
        if (attempt < BACKEND_CONNECT_RETRIES) {
          await new Promise((r) => setTimeout(r, BACKEND_CONNECT_DELAY_MS));
        }
      }
    }
    backendConnectPromise = null;
    throw lastErr || new Error('Backend unavailable');
  })();

  return backendConnectPromise;
}

/**
 * Envia JSON-RPC ao backend (usa a ligação única). Resposta via SSE ou body.
 */
async function forwardToBackend(body) {
  const sid = await connectBackend();
  const id = getRequestId(body);
  const url = `${MESSAGE_URL}?sessionId=${encodeURIComponent(sid)}`;

  let waitSse = null;
  if (id != null) {
    waitSse = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (pending.delete(id)) reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeout });
    });
  }

  const postRes = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await postRes.text();

  if (waitSse != null) {
    try {
      return await Promise.race([
        waitSse,
        new Promise((_, rej) => setTimeout(() => rej(new Error('Request timeout')), REQUEST_TIMEOUT_MS)),
      ]);
    } catch (e) {
      if (text && postRes.ok) {
        try {
          return JSON.parse(text);
        } catch (_) {}
      }
      throw e;
    }
  }

  if (!postRes.ok) throw new Error(`Backend ${postRes.status}: ${text}`);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { raw: text };
  }
}

// --- Rotas (meio-campo: clientes só falam com o proxy) ---

app.get('/', (_, res) => {
  res.json({
    name: 'engrams-proxy',
    status: 'ok',
    backend: backendSessionId ? 'connected' : 'connecting',
    sse: '/sse',
    message: '/message',
    messages: '/messages',
  });
});

app.get('/health', (_, res) => {
  res.json({ status: 'ok', backend: !!backendSessionId });
});

app.get('/sse', (req, res) => {
  const sessionId = randomUUID();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.set(sessionId, { res });
  res.write(`event: endpoint\ndata: /messages?sessionId=${sessionId}\n\n`);

  req.on('close', () => {
    clients.delete(sessionId);
    log(`Client disconnected: ${sessionId}`);
  });
  log(`Client connected: ${sessionId}`);
});

app.post('/sse', async (req, res) => {
  try {
    const result = await forwardToBackend(req.body);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  } catch (e) {
    log(`POST /sse error: ${e.message}`);
    res.status(502).json({ error: { code: -32603, message: e.message } });
  }
});

function handlePostMessage(req, res) {
  const sessionId = req.query.sessionId;
  if (sessionId && !clients.has(sessionId)) {
    return res.status(400).send('No transport found for sessionId');
  }
  (async () => {
    try {
      const result = await forwardToBackend(req.body);
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json(result);
    } catch (e) {
      log(`POST /message(s) error: ${e.message}`);
      res.status(502).json({ error: { code: -32603, message: e.message } });
    }
  })();
}

app.post('/message', handlePostMessage);
app.post('/messages', handlePostMessage);

app.listen(PORT, '0.0.0.0', () => {
  log(`Proxy listening on ${PORT}; backend: ${BACKEND}`);
  // Uma única ligação ao backend assim que o proxy sobe
  connectBackend().then(() => log('Backend connected (single connection)')).catch((e) => log(`Backend connect: ${e.message}`));
});
