import { createServer } from 'node:http';

const host = process.env.OPENROUTER_STUB_HOST?.trim() || '127.0.0.1';
const port = Number.parseInt(process.env.OPENROUTER_STUB_PORT ?? '4010', 10);
const expectedToken = process.env.OPENROUTER_STUB_TOKEN?.trim() || 'ci-chat-stub-key';
const responseText = process.env.OPENROUTER_STUB_RESPONSE?.trim() || 'CHATMODULE_CI_OK';
const expectedCatalogType = process.env.OPENROUTER_STUB_CATALOG_TYPE?.trim() || 'textPrompt';
const maxRequestBytes = 1_000_000;

if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  console.error('OPENROUTER_STUB_PORT must be a valid TCP port.');
  process.exit(2);
}

let completionCount = 0;
let catalogToolCallCount = 0;
let validatedCatalogResultCount = 0;
const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, {
      catalogToolCallCount,
      completionCount,
      status: 'ok',
      validatedCatalogResultCount,
    });
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

    const catalogToolResult = findToolResult(body.messages, 'node_catalog');
    if (catalogToolResult) {
      if (!isExpectedCatalogResult(catalogToolResult.content, expectedCatalogType)) {
        sendJson(response, 400, {
          error: {
            message: `Expected node_catalog to return only ${expectedCatalogType}`,
            type: 'invalid_request_error',
          },
        });
        return;
      }

      completionCount += 1;
      validatedCatalogResultCount += 1;
      sendCompletion(response, body.model, responseText, completionCount);
      return;
    }

    if (!hasToolDefinition(body.tools, 'node_catalog')
      || !readLatestUserText(body.messages).includes(`тип ${expectedCatalogType}`)) {
      sendJson(response, 400, {
        error: {
          message: `Expected an Ask AI prompt and the node_catalog tool for ${expectedCatalogType}`,
          type: 'invalid_request_error',
        },
      });
      return;
    }

    completionCount += 1;
    catalogToolCallCount += 1;
    sendJson(response, 200, {
      choices: [{
        finish_reason: 'tool_calls',
        index: 0,
        message: {
          content: '',
          role: 'assistant',
          tool_calls: [{
            function: {
              arguments: JSON.stringify({ query: expectedCatalogType }),
              name: 'node_catalog',
            },
            id: `call-node-catalog-${completionCount}`,
            type: 'function',
          }],
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

function findToolResult(messages, toolName) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'tool' && message.name === toolName) return message;
  }
  return null;
}

function hasToolDefinition(tools, toolName) {
  return tools.some((tool) => tool?.type === 'function' && tool.function?.name === toolName);
}

function isExpectedCatalogResult(content, expectedType) {
  if (typeof content !== 'string') return false;
  try {
    const parsed = JSON.parse(content);
    const catalog = parsed?.output;
    return parsed?.ok === true
      && catalog?.count === 1
      && Array.isArray(catalog.nodes)
      && catalog.nodes.length === 1
      && catalog.nodes[0]?.type === expectedType;
  } catch {
    return false;
  }
}

function readLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    if (typeof message.content === 'string') return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .filter((part) => part?.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n');
    }
  }
  return '';
}

function sendCompletion(response, model, content, requestNumber) {
  sendJson(response, 200, {
    choices: [{
      finish_reason: 'stop',
      index: 0,
      message: { content, role: 'assistant' },
    }],
    created: Math.floor(Date.now() / 1_000),
    id: `chatcmpl-stub-${requestNumber}`,
    model,
    object: 'chat.completion',
    provider: 'codex-local-stub',
    usage: {
      completion_tokens: 1,
      cost: 0,
      prompt_tokens: 1,
      total_tokens: 2,
    },
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}
