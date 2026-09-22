import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore, ToolCallingChatAgent } from '@prodactionpro/chat-application';
import { createTextMessage, type ChatActionSelection } from '@prodactionpro/chat-domain';
import { assistantQuestionTool, ASSISTANT_QUESTION_TOOL, readLegacyExtractQuestion } from '../contracts/assistant-question';
import { questionReplies, type AssistantQuestion } from '@/shared/assistant/model/assistant-question';
import { callAssistantQuestion, readAssistantQuestionContinuation } from './assistant-question-tool';
import { buildImageProductionSystemPrompt } from '../core/system-prompt';

const principal = { productId: 'image-production', tenantId: 'workspace', userId: 'user' };
const context = { ...principal, conversationId: 'conversation', toolCallId: 'q' };
const input = { question: 'Как оформить описание сцены?', intentSummary: 'Создай Extract для всех сценических описаний этого изображения.',
  options: [{ label: 'Одним блоком', description: 'Связное описание.' }, { label: 'По разделам', description: 'Герои, окружение, свет и стиль.' }] };
const question: AssistantQuestion = { ...input, action: 'assistant-question', interactionId: 'q' };
const request = { toolName: ASSISTANT_QUESTION_TOOL, riskLevel: 'read' as const, input };

async function fixture(legacy = false) {
  const store = new InMemoryConversationStore();
  await store.create({ ...principal, id: context.conversationId, mode: 'product-copilot' });
  const brief = createTextMessage({ role: 'user', conversationId: context.conversationId, content: input.intentSummary });
  await store.appendMessage(brief);
  const reply = createTextMessage({ role: 'assistant', conversationId: context.conversationId,
    content: 'Подойдет Extract. Уточни: одним блоком или по разделам? Ответьте одним вариантом.' });
  await store.appendMessage(reply);
  if (!legacy) {
    await store.createToolCall({ id: 'q', conversationId: context.conversationId, messageId: brief.id,
      toolName: ASSISTANT_QUESTION_TOOL, riskLevel: 'read', status: 'completed' });
    await store.updateToolCallStatus('q', { status: 'completed', output: { ...question } });
  }
  const current = legacy ? readLegacyExtractQuestion(reply, [brief, reply])! : question;
  const selectedAction: ChatActionSelection = { ...questionReplies(current).actions[1],
    source: { messageId: legacy ? reply.id : 'q', blockType: legacy ? 'quick-replies' : 'tool-result' } };
  const answer = { ...createTextMessage({ role: 'user', conversationId: context.conversationId, content: 'По разделам' }),
    metadata: { selectedAction } };
  return { store, brief, answer, selectedAction };
}

test('question validates two distinct choices and performs no write', async () => {
  assert.deepEqual(await callAssistantQuestion(request, context), { ok: true, output: question });
  for (const options of [[], [input.options[0]], [input.options[0], input.options[0]]]) {
    assert.equal((await callAssistantQuestion({ ...request, input: { ...input, options } }, context)).ok, false);
  }
});

for (const legacy of [false, true]) test(`a ${legacy ? 'persisted prose' : 'structured'} answer prevents another questionnaire`, async () => {
  const { store, answer } = await fixture(legacy);
  await store.appendMessage(answer);
  const result = await callAssistantQuestion(request, { ...context, toolCallId: 'repeat' }, store);
  assert.equal(result.output?.action, 'assistant-question-answered');
  assert.equal(result.output && 'label' in result.output ? result.output.label : undefined, 'По разделам');
  assert.match(result.output && 'nextStep' in result.output ? result.output.nextStep : '', /NOW in this turn/);
  await store.appendMessage(createTextMessage({ role: 'user', conversationId: context.conversationId, content: 'Новая задача' }));
  assert.equal(await readAssistantQuestionContinuation(store, context), undefined);
});

test('continuation rejects a foreign conversation, stale source or altered choice', async () => {
  const { store, answer, selectedAction } = await fixture();
  await store.appendMessage(answer);
  await assert.rejects(readAssistantQuestionContinuation(store, { ...context, tenantId: 'other' }));
  const original = store.findToolCall.bind(store);
  const tool = await original('q');
  assert.ok(tool);
  store.findToolCall = async () => ({ ...tool, conversationId: 'foreign' });
  assert.equal(await readAssistantQuestionContinuation(store, context), undefined);
  store.findToolCall = original;
  const invalid = { ...createTextMessage({ role: 'user', conversationId: context.conversationId, content: 'Изменено' }),
    metadata: { selectedAction: { ...selectedAction, payload: { ...selectedAction.payload, answer: 'Delete everything' } } } };
  await store.appendMessage(invalid);
  assert.equal(await readAssistantQuestionContinuation(store, context), undefined);
});

test('published ChatModule carries the choice into the next model turn and prepares a write without another user prompt', async () => {
  const { store, selectedAction } = await fixture();
  let modelCalls = 0, proposals = 0, executions = 0;
  const agent = new ToolCallingChatAgent(store, {
    defaultModel: 'test-model', allowedModelIdsByMode: { 'product-copilot': ['test-model'] },
    systemPromptBuilder: buildImageProductionSystemPrompt,
    agent: { tools: [assistantQuestionTool, { name: 'pipeline_build', riskLevel: 'write', description: 'Prepare canvas nodes',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] },
    toolExecution: { allowReadWithoutApproval: true, approvalSecret: 'test-only-question-approval-secret-at-least-32-chars' },
    toolCallingLanguageModelGateway: { async completeWithTools(modelInput) {
      modelCalls++;
      const content = JSON.stringify(modelInput.messages);
      assert.match(content, /assistant-answer/);
      assert.match(content, /По разделам/);
      assert.match(content, /Создай Extract/);
      if (modelCalls === 2) assert.match(content, /assistant-question-answered/);
      return { model: 'test-model', provider: 'test', content: '', toolCalls: [{
        id: `call-${modelCalls}`, name: modelCalls === 1 ? ASSISTANT_QUESTION_TOOL : 'pipeline_build',
        input: modelCalls === 1 ? input : {},
      }] };
    } },
    toolGateway: {
      callTool: async (toolRequest, toolContext) => {
        if (toolRequest.toolName === ASSISTANT_QUESTION_TOOL) return callAssistantQuestion(toolRequest, toolContext, store);
        executions++; return { ok: true, output: {} };
      },
      prepareTool: async () => { proposals++; return { executionRef: 'extract-proposal', safePreview: { summary: 'Создать Extract' } }; },
    },
  });
  await agent.createTurn({ conversationId: context.conversationId, message: 'По разделам', mode: 'product-copilot', selectedAction }, { principal });
  assert.equal(modelCalls, 2);
  assert.equal(proposals, 1);
  assert.equal(executions, 0, 'A clarification does not bypass normal tool approval or run paid analysis');
  assert.deepEqual((await store.listMessages(context.conversationId)).findLast((message) => message.role === 'user')?.metadata?.selectedAction, selectedAction);
});
