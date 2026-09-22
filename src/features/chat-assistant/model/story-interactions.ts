import type { ChatMessage, ToolCallRecord } from '@prodactionpro/chat-domain';
import { STORY_BLUEPRINT_PRESENTATION, STORY_QUESTION_TOOL, storyQuestionResultSchema, STORY_WRITING_TOOLS } from '@/modules/chat-assistant/contracts/story-authoring';

/** ChatModule stores a tool against its originating user message. Present story interactions under the coauthor's reply. */
export function presentStoryTools(messages: ChatMessage[], tools: ToolCallRecord[]) {
  return tools.map((tool) => {
    if (![...STORY_WRITING_TOOLS, STORY_QUESTION_TOOL].includes(tool.toolName)) return tool;
    const origin = messages.findIndex((message) => message.id === tool.messageId);
    if (origin < 0 || messages[origin].role !== 'user') return tool;
    const nextUser = messages.findIndex((message, index) => index > origin && message.role === 'user');
    const reply = messages.slice(origin + 1, nextUser < 0 ? undefined : nextUser).findLast((message) => message.role === 'assistant');
    return { ...tool, messageId: reply?.id };
  });
}

export function readStoryQuestion(value: unknown) {
  const parsed = storyQuestionResultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export function isStoryQuestionAnswered(messages: ChatMessage[], interactionId: string) {
  return messages.some((message) => {
    const action = message.metadata?.selectedAction;
    if (message.role !== 'user' || !action || typeof action !== 'object' || !('payload' in action)) return false;
    const payload = action.payload;
    return Boolean(payload && typeof payload === 'object' && 'kind' in payload && payload.kind === 'story-answer'
      && 'interactionId' in payload && payload.interactionId === interactionId);
  });
}
export function canAutoSaveStory(tool: ToolCallRecord, storyId: string, revision: number) {
  return STORY_WRITING_TOOLS.includes(tool.toolName) && tool.riskLevel === 'write'
    && tool.status === 'needs-confirmation' && tool.presentationType === STORY_BLUEPRINT_PRESENTATION
    && tool.safePreview?.submitAuthorized === true && tool.safePreview.storyId === storyId
    && tool.safePreview.expectedRevision === revision;
}
