import { z } from 'zod';
import type { ChatActionSelection, ChatMessage, QuickRepliesBlock } from '@prodactionpro/chat-domain';

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(5).max(600),
  intentSummary: z.string().trim().min(5).max(1200),
  options: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    description: z.string().trim().max(240),
  }).strict()).length(2),
}).strict();
export const assistantQuestionResultSchema = assistantQuestionSchema.extend({
  action: z.literal('assistant-question'), interactionId: z.string().min(1).max(200),
});
export type AssistantQuestion = z.infer<typeof assistantQuestionResultSchema>;
export const assistantAnswerSchema = z.object({
  kind: z.literal('assistant-answer'), interactionId: z.string().min(1).max(200),
  choice: z.number().int().min(0).max(1), answer: z.string().trim().min(1).max(100),
  question: z.string().trim().min(5).max(600), intentSummary: z.string().trim().min(5).max(1200),
  description: z.string().trim().max(240),
}).strict();

export function questionReplies(question: AssistantQuestion, showQuestion = true): QuickRepliesBlock {
  return {
    type: 'quick-replies', ...(showQuestion ? { title: question.question } : {}),
    actions: question.options.map((option, choice) => ({
      id: `assistant-answer:${question.interactionId}:${choice}`, type: 'submit', label: option.label,
      message: option.label,
      payload: { kind: 'assistant-answer', interactionId: question.interactionId, choice, answer: option.label,
        description: option.description, question: question.question, intentSummary: question.intentSummary },
    })),
  };
}

export function readAssistantAnswer(selection?: ChatActionSelection) {
  if (selection?.type !== 'submit') return undefined;
  const parsed = assistantAnswerSchema.safeParse(selection.payload);
  return parsed.success ? parsed.data : undefined;
}

export function questionProgress(question: AssistantQuestion, messages: ChatMessage[], sourceMessageId?: string) {
  const origin = messages.findIndex((message) => message.id === sourceMessageId);
  const later = origin < 0 ? messages : messages.slice(origin + 1);
  const reply = later.find((message) => message.role === 'user');
  const parsed = assistantAnswerSchema.safeParse((reply?.metadata?.selectedAction as ChatActionSelection | undefined)?.payload);
  const answer = parsed.success && parsed.data.interactionId === question.interactionId
    && parsed.data.answer === question.options[parsed.data.choice]?.label ? parsed.data.answer : undefined;
  return { answer, closed: Boolean(reply) };
}
