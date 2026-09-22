import type { AgentToolDefinition } from '@prodactionpro/chat-connectors';
import type { ChatMessage } from '@prodactionpro/chat-domain';
import { z } from 'zod';
import { assistantQuestionSchema, type AssistantQuestion } from '@/shared/assistant/model/assistant-question';

export const ASSISTANT_QUESTION_TOOL = 'assistant_ask_question';
export const assistantQuestionTool: AgentToolDefinition = {
  name: ASSISTANT_QUESTION_TOOL, riskLevel: 'read',
  description: 'Ask one necessary clarification with exactly two short, distinct one-click answers. Include the original user task in intentSummary. This does not change the graph or authorize execution. Wait for the answer after calling; do not repeat the question in prose. Once answered, continue the original task in that same turn using the selected option and existing attachments; do not ask another optional question.',
  inputSchema: z.toJSONSchema(assistantQuestionSchema, { target: 'draft-7' }),
};

/** Narrow compatibility for persisted Extract questions predating the interactive tool. */
export function readLegacyExtractQuestion(message: ChatMessage, messages: ChatMessage[]): AssistantQuestion | undefined {
  if (message.role !== 'assistant' || message.metadata?.runtimeError) return undefined;
  const text = message.blocks.flatMap((block) => block.type === 'text' || block.type === 'markdown' ? [block.content] : []).join('\n');
  if (!/(?:imageToText|Extract|извле[чк])/iu.test(text)
    || !/одним блоком/iu.test(text) || !/по разделам/iu.test(text)
    || !/(?:уточни|ответьте|выбер|вам нужно|как.*\?)/iu.test(text)) return undefined;
  const index = messages.findIndex((item) => item.id === message.id);
  const brief = messages.slice(0, index).findLast((item) => item.role === 'user');
  const intent = brief?.blocks.flatMap((block) => block.type === 'text' || block.type === 'markdown' ? [block.content] : []).join('\n').trim();
  if (!intent || !/(?:извле[чк]|extract|описан)/iu.test(intent)) return undefined;
  return {
    action: 'assistant-question', interactionId: `legacy-extract:${message.id}`,
    question: 'Как оформить описание сцены?', intentSummary: intent.slice(0, 1200),
    options: [
      { label: 'Одним блоком', description: 'Цельное описание всего, что видно в сцене.' },
      { label: 'По разделам', description: 'Герои, действия, окружение, композиция, свет и стиль отдельными разделами.' },
    ],
  };
}
