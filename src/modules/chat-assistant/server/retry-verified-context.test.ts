import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryConversationStore,
  ToolCallingChatAgent,
  type VerifiedContextResolverInput,
} from '@prodactionpro/chat-application';
import type {
  AgentToolDefinition,
  ToolCallingLanguageModelGateway,
  ToolCallingLanguageModelInput,
} from '@prodactionpro/chat-connectors';
import { createTextMessage, type ChatContextSelectors } from '@prodactionpro/chat-domain';
import { CHAT_EVENT_TYPES } from '@prodactionpro/chat-protocol';
import { ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';

const CONVERSATION_ID = 'conversation-retry-context';
const MODEL = 'openai/gpt-5.4-nano';
const ORIGINAL_TURN_ID = 'turn-original';
const PRINCIPAL: ChatPrincipal = {
  productId: 'image-production',
  tenantId: 'workspace-1',
  userId: 'user-1',
};
const SELECTORS: ChatContextSelectors = {
  document: {
    id: 'document-1',
    revision: '41',
  },
  route: '/documents/document-1',
  selection: {
    ids: ['node-1', 'section-1'],
    textHash: 'selection-hash',
  },
};
const TEST_TOOL: AgentToolDefinition = {
  description: 'A no-op tool required by the agent contract.',
  inputSchema: {
    additionalProperties: false,
    properties: {},
    type: 'object',
  },
  name: 'context_probe',
  riskLevel: 'read',
};

test('Retry restores stored selectors and rebuilds context from the current host-verified revision', async () => {
  const store = await createRetryableConversation();
  const resolverCalls: VerifiedContextResolverInput[] = [];
  const modelCalls: ToolCallingLanguageModelInput[] = [];
  let promptContext: Record<string, unknown> | undefined;
  const agent = createAgent(store, {
    gateway: createGateway(modelCalls),
    verifiedContextResolver: (input) => {
      resolverCalls.push(input);
      return {
        document: {
          id: input.selectors?.document?.id,
          revision: 42,
          selectorRevisionMatches: false,
        },
        route: input.selectors?.route,
        workspaceId: input.principal.tenantId,
      };
    },
    systemPromptBuilder: (context) => {
      promptContext = context;
      return 'Use only server-verified context.';
    },
  });

  const events = await collectEvents(agent.retryTurn(createRetryRequest('retry-current'), {
    principal: PRINCIPAL,
  }));

  assert.equal(resolverCalls.length, 1);
  assert.deepEqual(resolverCalls[0]?.selectors, SELECTORS);
  assert.deepEqual(resolverCalls[0]?.principal, PRINCIPAL);
  assert.deepEqual(promptContext, {
    document: {
      id: 'document-1',
      revision: 42,
      selectorRevisionMatches: false,
    },
    route: '/documents/document-1',
    workspaceId: 'workspace-1',
  });
  assert.equal(modelCalls.length, 1);
  assert.equal(events.at(-1)?.type, CHAT_EVENT_TYPES.runCompleted);
});

test('Retry fails closed when the host resolver rejects a now-revoked workspace membership', async () => {
  const store = await createRetryableConversation();
  const resolverCalls: VerifiedContextResolverInput[] = [];
  const modelCalls: ToolCallingLanguageModelInput[] = [];
  const agent = createAgent(store, {
    gateway: createGateway(modelCalls),
    verifiedContextResolver: (input) => {
      resolverCalls.push(input);
      throw new ChatAccessError('Workspace membership is no longer valid.', 'forbidden');
    },
  });

  const events = await collectEvents(agent.retryTurn(createRetryRequest('retry-revoked'), {
    principal: PRINCIPAL,
  }));
  const failure = events.find((event) => event.type === CHAT_EVENT_TYPES.error);

  assert.equal(resolverCalls.length, 1);
  assert.deepEqual(resolverCalls[0]?.selectors, SELECTORS);
  assert.equal(modelCalls.length, 0);
  assert.ok(failure);
  assert.equal(readEventField(failure.data, 'code'), 'CHAT_FORBIDDEN');
  assert.equal(readEventField(failure.data, 'category'), 'authorization');
  assert.equal(readEventField(failure.data, 'retryable'), false);
});

async function createRetryableConversation() {
  const store = new InMemoryConversationStore();
  await store.create({
    id: CONVERSATION_ID,
    mode: 'knowledge-base',
    productId: PRINCIPAL.productId,
    tenantId: PRINCIPAL.tenantId,
    userId: PRINCIPAL.userId,
  });
  const claim = await store.claimAgentTurn({
    conversationId: CONVERSATION_ID,
    id: ORIGINAL_TURN_ID,
    productId: PRINCIPAL.productId,
    requestId: 'request-original',
    tenantId: PRINCIPAL.tenantId,
    userId: PRINCIPAL.userId,
  });
  assert.equal(claim.outcome, 'claimed');

  const message = createTextMessage({
    content: 'Inspect the selected graph elements.',
    conversationId: CONVERSATION_ID,
    role: 'user',
  });
  message.metadata = {
    contextSelectors: SELECTORS,
    mode: 'knowledge-base',
    model: MODEL,
    requestId: 'request-original',
    turnId: ORIGINAL_TURN_ID,
  };
  await store.appendMessage(message);
  await store.failAgentTurn(ORIGINAL_TURN_ID, {
    errorCategory: 'provider',
    errorCode: 'CHAT_PROVIDER_UNAVAILABLE',
    executionState: 'read-only',
    retryable: true,
    status: 'failed',
  });
  return store;
}

function createAgent(
  store: InMemoryConversationStore,
  input: {
    gateway: ToolCallingLanguageModelGateway;
    systemPromptBuilder?: (context: Record<string, unknown> | undefined) => string;
    verifiedContextResolver: (input: VerifiedContextResolverInput) => Record<string, unknown>;
  },
) {
  return new ToolCallingChatAgent(store, {
    agent: { tools: [TEST_TOOL] },
    allowedModelIdsByMode: { 'knowledge-base': [MODEL] },
    defaultModel: MODEL,
    systemPromptBuilder: ({ requestContext }) => input.systemPromptBuilder?.(requestContext),
    toolCallingLanguageModelGateway: input.gateway,
    verifiedContextResolver: input.verifiedContextResolver,
  });
}

function createGateway(calls: ToolCallingLanguageModelInput[]): ToolCallingLanguageModelGateway {
  return {
    async completeWithTools(input) {
      calls.push(input);
      return {
        content: 'Verified retry completed.',
        model: MODEL,
        provider: 'test',
        toolCalls: [],
      };
    },
  };
}

function createRetryRequest(idempotencyKey: string) {
  return {
    idempotencyKey,
    originalTurnId: ORIGINAL_TURN_ID,
    retryOfTurnId: ORIGINAL_TURN_ID,
  };
}

async function collectEvents<T>(events: AsyncIterable<T>) {
  const collected: T[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function readEventField(value: unknown, key: string) {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}
