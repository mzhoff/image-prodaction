import type { ChatMessage, ToolCallRecord } from '@prodactionpro/chat-domain';
import { ASSISTANT_QUESTION_TOOL, readLegacyExtractQuestion } from '@/modules/chat-assistant/contracts/assistant-question';
import { questionProgress, questionReplies } from '@/shared/assistant/model/assistant-question';

export function presentAssistantQuestions(messages: ChatMessage[], tools: ToolCallRecord[]) {
  return messages.map((message) => {
    const question = readLegacyExtractQuestion(message, messages);
    if (!question || message.blocks.some((block) => block.type === 'quick-replies')) return message;
    const index = messages.findIndex((item) => item.id === message.id);
    const origin = messages.slice(0, index).findLast((item) => item.role === 'user');
    if (tools.some((tool) => tool.toolName === ASSISTANT_QUESTION_TOOL && (tool.messageId === origin?.id || tool.messageId === message.id))) return message;
    const progress = questionProgress(question, messages, message.id);
    if (progress.closed && !progress.answer) return message;
    return { ...message, blocks: [...message.blocks, progress.answer
      ? { type: 'text' as const, content: `Выбрано: ${progress.answer}` } : questionReplies(question, false)] };
  });
}

export function presentAssistantQuestionTools(messages: ChatMessage[], tools: ToolCallRecord[]) {
  return tools.map((tool) => {
    if (tool.toolName !== ASSISTANT_QUESTION_TOOL) return tool;
    const origin = messages.findIndex((message) => message.id === tool.messageId);
    if (origin < 0 || messages[origin].role !== 'user') return tool;
    const nextUser = messages.findIndex((message, index) => index > origin && message.role === 'user');
    const reply = messages.slice(origin + 1, nextUser < 0 ? undefined : nextUser).findLast((message) => message.role === 'assistant');
    return { ...tool, messageId: reply?.id };
  });
}
