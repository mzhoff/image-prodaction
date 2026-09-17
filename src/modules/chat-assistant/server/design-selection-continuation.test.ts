import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore, ToolCallingChatAgent } from '@prodactionpro/chat-application';
import { createTextMessage } from '@prodactionpro/chat-domain';
import { createDesignElementSelection } from './design-element-selection-service';
import { readDesignSelectionContinuation } from './design-selection-continuation';

const principal = { productId: 'image-production', tenantId: 'workspace', userId: 'user' };
const context = { ...principal, conversationId: 'conversation', toolCallId: 'repeat-question' };

async function fixture() {
  const store = new InMemoryConversationStore();
  await store.create({ ...principal, id: context.conversationId, mode: 'product-copilot' });
  const result = createDesignElementSelection({ intentSummary: 'Editable infographic', elements: [{ id: 'hero', kind: 'image', role: 'hero', label: 'Hero', observedContent: 'Person', referenceFrame: { x: 0.1, y: 0.2, width: 0.5, height: 0.6 } }] }, 'question');
  await store.createToolCall({ id: 'question', conversationId: context.conversationId, toolName: 'design_element_selection', riskLevel: 'read', status: 'completed', messageId: 'question-message' });
  await store.updateToolCallStatus('question', { status: 'completed', output: { ...result } });
  const submission = { message: 'Continue with my selected elements', payload: { kind: 'design-element-selection', version: 1, interactionId: result.interactionId, baseImageStrategy: 'layered', textStrategy: 'separate', selectedElementIds: ['hero'], selectedElements: result.elements, customElements: ['Caption'] } };
  const selectedAction = { id: 'selection', type: 'submit' as const, label: 'Continue', source: { messageId: 'question-message', blockType: 'tool-result' }, payload: { ...submission.payload } };
  const message = createTextMessage({ role: 'user', conversationId: context.conversationId, content: submission.message });
  message.metadata = { selectedAction };
  return { store, result, submission, selectedAction, message };
}

test('repeated questionnaire returns the stored choice, not a new form', async () => {
  const { store, message } = await fixture();
  await store.appendMessage(message);
  const selected = await readDesignSelectionContinuation(store, context);
  assert.equal(selected?.action, 'design-elements-selected');
  assert.deepEqual(selected?.selectedElementIds, ['hero']);
  assert.deepEqual(selected?.selectedElements[0].referenceFrame, { x: 0.1, y: 0.2, width: 0.5, height: 0.6 });
  assert.deepEqual(selected?.customElements, ['Caption']);
});

test('a new user brief can open a new questionnaire', async () => {
  const { store, message } = await fixture();
  await store.appendMessage(message);
  await store.appendMessage(createTextMessage({ role: 'user', conversationId: context.conversationId, content: 'A different design now' }));
  assert.equal(await readDesignSelectionContinuation(store, context), undefined);
});

test('selection recovery rejects another workspace and does not trust a foreign question', async () => {
  const { store, message } = await fixture();
  await store.appendMessage(message);
  await assert.rejects(readDesignSelectionContinuation(store, { ...context, tenantId: 'other' }));
  const question = await store.findToolCall('question');
  assert.ok(question);
  const originalLookup = store.findToolCall.bind(store);
  store.findToolCall = async (id) => id === 'question' ? { ...question, conversationId: 'other' } : originalLookup(id);
  assert.equal(await readDesignSelectionContinuation(store, context), undefined);
});

test('installed ChatModule preserves the form answer through persistence, model input and duplicate tool invocation', async () => {
  const { store, selectedAction, submission } = await fixture();
  const modelInputs: unknown[] = [];
  const agent = new ToolCallingChatAgent(store, {
    defaultModel: 'openai/gpt-5.4-nano',
    allowedModelIdsByMode: { 'product-copilot': ['openai/gpt-5.4-nano'] },
    agent: { tools: [{ name: 'design_element_selection', description: 'Read form', riskLevel: 'read', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] },
    toolCallingLanguageModelGateway: { async completeWithTools(input) {
      modelInputs.push(input.messages);
      return { model: 'openai/gpt-5.4-nano', provider: 'test', content: 'Choice received', toolCalls: [] };
    } },
  });
  await agent.createTurn({ conversationId: context.conversationId, message: submission.message, mode: 'product-copilot', selectedAction }, { principal });
  const snapshot = await store.listMessages(context.conversationId);
  assert.deepEqual(snapshot.findLast((message) => message.role === 'user')?.metadata?.selectedAction, selectedAction);
  assert.match(JSON.stringify(modelInputs), /referenceFrame/);
  assert.equal((await readDesignSelectionContinuation(store, context))?.action, 'design-elements-selected');
});
