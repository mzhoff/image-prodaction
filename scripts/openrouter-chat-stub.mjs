import { createServer } from 'node:http';

const host = process.env.OPENROUTER_STUB_HOST?.trim() || '127.0.0.1';
const port = Number.parseInt(process.env.OPENROUTER_STUB_PORT ?? '4010', 10);
const expectedToken = process.env.OPENROUTER_STUB_TOKEN?.trim() || 'ci-chat-stub-key';
const responseText = process.env.OPENROUTER_STUB_RESPONSE?.trim() || 'CHATMODULE_CI_OK';
const maxRequestBytes = 1_000_000;

if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  console.error('OPENROUTER_STUB_PORT must be a valid TCP port.');
  process.exit(2);
}

let completionCount = 0;
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { completionCount, status: 'ok' });
    return;
  }

  if (request.method !== 'POST' || request.url !== '/chat/completions') {
    sendJson(response, 404, { error: { message: 'Not found', type: 'invalid_request_error' } });
    return;
  }

  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    sendJson(response, 401, { error: { message: 'Unauthorized', type: 'authentication_error' } });
    return;
  }

  try {
    const body = await readJsonBody(request);
    if (!isOpenRouterToolRequest(body)) {
      sendJson(response, 400, {
        error: { message: 'Expected a tool-capable chat completion request', type: 'invalid_request_error' },
      });
      return;
    }

    completionCount += 1;
    sendJson(response, 200, {
      choices: [{
        finish_reason: 'stop',
        index: 0,
        message: {
          content: responseText,
          role: 'assistant',
        },
      }],
      created: Math.floor(Date.now() / 1_000),
      id: `chatcmpl-stub-${completionCount}`,
      model: body.model,
      object: 'chat.completion',
      provider: 'codex-local-stub',
      usage: {
        completion_tokens: 1,
        cost: 0,
        prompt_tokens: 1,
        total_tokens: 2,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body';
    sendJson(response, 400, { error: { message, type: 'invalid_request_error' } });
  }
});

server.on('clientError', (_error, socket) => {
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(port, host, () => {
  console.log(`OpenRouter chat stub is ready at http://${host}:${port}.`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function readJsonBody(request) {
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxRequestBytes) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function isOpenRouterToolRequest(value) {
  if (!value || typeof value !== 'object') return false;
  return typeof value.model === 'string'
    && Array.isArray(value.messages)
    && value.messages.length > 0
    && Array.isArray(value.tools);
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}
