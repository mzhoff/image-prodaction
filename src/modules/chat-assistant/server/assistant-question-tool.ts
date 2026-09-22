import type { ConversationStore } from '@prodactionpro/chat-application';
import type { ToolCallRequest, ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { chatActionSelectionSchema } from '@prodactionpro/chat-domain';
import { assertChatResourceAccess } from '@prodactionpro/chat-server-core';
import { assistantQuestionSchema, assistantQuestionResultSchema, readAssistantAnswer } from '@/shared/assistant/model/assistant-question';
import { ASSISTANT_QUESTION_TOOL, readLegacyExtractQuestion } from '../contracts/assistant-question';

export async function readAssistantQuestionContinuation(store: ConversationStore, context: ToolExecutionContext) {
  const conversation = await store.findById(context.conversationId);
  if (!conversation) return undefined;
  assertChatResourceAccess(context, conversation);
  const messages = await store.listMessages(context.conversationId);
  const latestUser = messages.findLast((message) => message.role === 'user');
  const selection = chatActionSelectionSchema.safeParse(latestUser?.metadata?.selectedAction);
  const answer = selection.success ? readAssistantAnswer(selection.data) : undefined;
  if (!answer || !selection.success || !latestUser) return undefined;
  const before = messages.slice(0, messages.indexOf(latestUser));
  const previousUser = before.findLastIndex((message) => message.role === 'user');
  const turn = before.slice(previousUser + 1);
  let question;
  if (answer.interactionId.startsWith('legacy-extract:')) {
    const source = turn.find((message) => `legacy-extract:${message.id}` === answer.interactionId
      && selection.data.source.messageId === message.id);
    if (source) question = readLegacyExtractQuestion(source, messages);
  } else {
    const tool = await store.findToolCall(answer.interactionId);
    if (!tool || tool.conversationId !== context.conversationId || tool.toolName !== ASSISTANT_QUESTION_TOOL
      || tool.status !== 'completed' || tool.id !== selection.data.source.messageId
      || tool.messageId !== before[previousUser]?.id) return undefined;
    const parsed = assistantQuestionResultSchema.safeParse(tool.output);
    if (parsed.success && parsed.data.interactionId === tool.id) question = parsed.data;
  }
  if (!question || question.options[answer.choice]?.label !== answer.answer) return undefined;
  return {
    action: 'assistant-question-answered', interactionId: question.interactionId,
    question: question.question, intentSummary: question.intentSummary, choice: answer.choice,
    ...question.options[answer.choice],
    nextStep: 'The user answered the clarification. Use the original brief and existing attachments. Prepare pipeline_build or pipeline_update NOW in this turn; do not ask another optional question. Preserve the normal graph preview/approval and paid-operation boundaries.',
  };
}

export async function callAssistantQuestion(request: ToolCallRequest, context: ToolExecutionContext, store?: ConversationStore) {
  const answer = store ? await readAssistantQuestionContinuation(store, context) : undefined;
  if (answer) return { ok: true, output: answer };
  const parsed = assistantQuestionSchema.safeParse(request.input);
  if (!parsed.success || new Set(parsed.data.options.map((option) => option.label.toLocaleLowerCase())).size !== 2) {
    return { ok: false, safeError: { code: 'INVALID_ASSISTANT_QUESTION',
      message: 'Нужен один вопрос, исходная задача и два разных варианта ответа.', retryable: true } };
  }
  return { ok: true, output: { action: 'assistant-question', interactionId: context.toolCallId, ...parsed.data } };
}
