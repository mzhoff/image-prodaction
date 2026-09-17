import type { ChatMessage } from '@prodactionpro/chat-domain';
import type { DocumentAssistantActivity } from './document-assistant-activity';

export const DOCUMENT_ACTIVITY_MESSAGE_SOURCE = 'document-generation';
export const FOCUS_GENERATED_NODE_ACTION = 'focus-generated-node';
export const DOCUMENT_NODE_ACTION_TARGET = 'image-production.node';

/** Factual completion messages use the normal ChatModule history without an LLM call. */
export function documentActivityToChatMessage(
  activity: DocumentAssistantActivity,
  conversationId?: string,
): ChatMessage {
  return {
    id: `document-activity:${activity.id}`,
    conversationId,
    role: 'assistant',
    createdAt: activity.createdAt,
    blocks: [
      { type: 'text', content: `${activity.title}.\n${activity.subtitle}` },
      {
        type: 'quick-replies',
        actions: [{
          id: FOCUS_GENERATED_NODE_ACTION,
          type: 'navigate',
          label: 'Открыть ноду',
          target: DOCUMENT_NODE_ACTION_TARGET,
          params: { nodeId: activity.nodeId },
        }],
      },
    ],
    metadata: {
      source: DOCUMENT_ACTIVITY_MESSAGE_SOURCE,
      documentActivityId: activity.id,
      nodeId: activity.nodeId,
      animate: false,
    },
  };
}
