'use client';

import { useChatRuntimeState } from '@prodactionpro/chat-runtime-react';
import type { ChatToolRendererContext } from '@prodactionpro/chat-ui';
import { useAiAccessGate } from '@/features/ai-access/ui/ai-access-boundary';
import { assistantQuestionResultSchema, questionProgress } from '@/shared/assistant/model/assistant-question';
import { useAssistantAnswer } from '@/shared/assistant/model/use-assistant-answer';
import { AssistantQuestion } from '@/shared/assistant/ui/assistant-question';
import { prepareChatMessagesForPresentation } from '../model/chat-message-presentation';

export function AssistantQuestionToolCard({ safeResult, toolCall }: ChatToolRendererContext) {
  const state = useChatRuntimeState();
  const answer = useAssistantAnswer(useAiAccessGate());
  const parsed = assistantQuestionResultSchema.safeParse(safeResult);
  if (!parsed.success) return null;
  const original = state.pendingToolCalls.find((tool) => tool.id === toolCall.id);
  const progress = questionProgress(parsed.data, prepareChatMessagesForPresentation(state.messages), original?.messageId);
  return <div className="assistant-question-result"><AssistantQuestion question={parsed.data} sourceMessageId={toolCall.id} {...progress}
    busy={answer.sending || ['loading', 'submitting', 'streaming'].includes(state.phase)} error={answer.error}
    onAnswer={(selection) => { void answer.submit(selection); }} /></div>;
}
