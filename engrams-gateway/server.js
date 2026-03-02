/**
 * Engrams Gateway: MCP interno (stdio) + proxy HTTP exposto.
 *
 * Um único processo: lança engrams-mcp --mode stdio e comunica por stdin/stdout.
 * Expõe apenas o proxy (GET/POST /sse, POST /message, POST /messages) na porta 8001.
 * Vários clientes (Cursor, Claude) ligam ao proxy; o proxy faz fila e fala com o MCP por stdio.
 */

import express from 'express';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { createInterface } from 'readline';

const PORT = parseInt(process.env.PROXY_PORT || '8001', 10);
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '/data/engrams';
const PUBLIC_URL = process.env.PROXY_PUBLIC_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json());
app.use((req, _res, next) => { log(`${req.method} ${req.url}`); next(); });

const clients = new Map();
const pending = new Map();
const requestQueue = [];
let processing = false;
let mcpReady = false;
let mcpStderr = '';

const REQUEST_TIMEOUT_MS = 60000;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getRequestId(msg) {
  if (msg == null) return undefined;
  if (typeof msg.id !== 'undefined') return msg.id;
  if (msg.params?.requestId != null) return msg.params.requestId;
  return undefined;
}

// --- MCP em stdio (interno) ---
function startMcp() {
  log(`Spawning engrams-mcp --mode stdio (WORKSPACE_DIR=${WORKSPACE_DIR})`);
  const child = spawn('engrams-mcp', ['--mode', 'stdio'], {
    env: { ...process.env, WORKSPACE_DIR },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const id = msg.id ?? msg.result?.id;
      if (id != null && pending.has(id)) {
        const entry = pending.get(id);
        pending.delete(id);
        if (entry.timeout) clearTimeout(entry.timeout);
        entry.resolve(msg);
      }
      mcpReady = true;
    } catch (_) {}
  });

  child.stderr.on('data', (chunk) => {
    mcpStderr += chunk.toString();
  });

  child.on('error', (err) => {
    log(`MCP child error: ${err.message}`);
  });

  child.on('exit', (code, signal) => {
    log(`MCP child exit code=${code} signal=${signal}`);
    process.exit(code !== 0 ? code || 1 : 0);
  });

  return child;
}

const mcpChild = startMcp();

function sendToMcp(body) {
  return new Promise((resolve, reject) => {
    const id = getRequestId(body);
    if (id != null) {
      const timeout = setTimeout(() => {
        if (pending.delete(id)) reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timeout });
    }

    const line = JSON.stringify(body ?? {}) + '\n';
    mcpChild.stdin.write(line, (err) => {
      if (err) {
        if (id != null) pending.delete(id);
        return reject(err);
      }
      if (id == null) resolve({});
    });
  });
}

async function processQueue() {
  if (processing || requestQueue.length === 0) return;
  processing = true;
  const { body, resolve, reject } = requestQueue.shift();
  try {
    const result = await sendToMcp(body);
    resolve(result);
  } catch (e) {
    reject(e);
  } finally {
    processing = false;
    if (requestQueue.length > 0) setImmediate(processQueue);
  }
}

function forwardToMcp(body) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ body, resolve, reject });
    processQueue();
  });
}

// --- Rotas (só o proxy é exposto) ---

app.get('/', (_, res) => {
  res.json({
    name: 'engrams-gateway',
    status: 'ok',
    mcp: 'stdio (internal)',
    sse: '/sse',
    message: '/message',
    messages: '/messages',
  });
});

app.get('/health', (_, res) => {
  res.json({ status: 'ok', mcp: mcpReady });
});

// MCP OAuth 2.0 spec: 404 JSON em ambos os endpoints indica "sem autenticação necessária".
// Claude Code >= 2.1 verifica estes endpoints; HTML 404 não é parseável e causa falha.
app.get('/.well-known/oauth-protected-resource', (_, res) => {
  res.status(404).json({ error: 'not_found', message: 'This server does not require authorization' });
});

app.get('/.well-known/oauth-authorization-server', (_, res) => {
  res.status(404).json({ error: 'not_found', message: 'No OAuth authorization server configured' });
});

// /register retorna 404 para evitar que o Claude Code inicie fluxo OAuth (authorization_code
// abriria o browser em /authorize, que não existe, causando erro de página).
app.post('/register', (_, res) => {
  res.status(404).json({ error: 'not_found', message: 'This server does not require authorization' });
});

app.get('/sse', (req, res) => {
  const sessionId = randomUUID();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.set(sessionId, { res });
  res.write(`event: endpoint\ndata: ${PUBLIC_URL}/messages?sessionId=${sessionId}\n\n`);

  const pingInterval = setInterval(() => {
    if (res.writableEnded) { clearInterval(pingInterval); return; }
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(sessionId);
    log(`Client disconnected: ${sessionId}`);
  });
  log(`Client connected: ${sessionId}`);
});

app.post('/sse', async (req, res) => {
  try {
    const result = await forwardToMcp(req.body);
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result || {});
  } catch (e) {
    log(`POST /sse error: ${e.message}`);
    res.status(502).json({ error: { code: -32603, message: e.message } });
  }
});

function handlePostMessage(req, res) {
  const sessionId = req.query.sessionId;
  const client = sessionId ? clients.get(sessionId) : null;
  if (sessionId && !client) {
    return res.status(400).send('No transport found for sessionId');
  }
  // Acknowledge immediately per MCP SSE spec (2024-11-05)
  res.status(202).send('Accepted');
  (async () => {
    try {
      const result = await forwardToMcp(req.body);
      if (!result || Object.keys(result).length === 0) return; // notification — no response needed
      // Send response via SSE stream, as required by MCP SSE transport spec
      if (client) {
        client.res.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
      }
    } catch (e) {
      log(`POST /message(s) error: ${e.message}`);
      const errPayload = { jsonrpc: '2.0', id: req.body?.id ?? null, error: { code: -32603, message: e.message } };
      if (client) client.res.write(`event: message\ndata: ${JSON.stringify(errPayload)}\n\n`);
    }
  })();
}

app.post('/message', handlePostMessage);
app.post('/messages', handlePostMessage);

app.listen(PORT, '0.0.0.0', () => {
  log(`Gateway listening on ${PORT}; MCP internal (stdio)`);
});
