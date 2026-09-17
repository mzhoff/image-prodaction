import type { ChatActionSelection, ChatMessage } from '@prodactionpro/chat-domain';
import {
  DOCUMENT_ACTIVITY_MESSAGE_SOURCE,
  DOCUMENT_NODE_ACTION_TARGET,
  FOCUS_GENERATED_NODE_ACTION,
  documentActivityToChatMessage,
} from '@/modules/chat-assistant/contracts/document-activity-message';
import type { DocumentAssistantActivity } from '@/modules/chat-assistant/contracts/document-assistant-activity';

/** Merge live completion facts with persisted history, preserving a single chronological feed. */
export function mergeDocumentActivityMessages(
  messages: ChatMessage[],
  activities: DocumentAssistantActivity[],
  conversationId?: string,
): ChatMessage[] {
  if (!activities.length) return messages;
  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const activity of activities) {
    const message = documentActivityToChatMessage(activity, conversationId);
    if (!byId.has(message.id)) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Only a generated message's own navigation action may focus its node. */
export function getDocumentActivityActionNode(
  selection: ChatActionSelection,
  messages: ChatMessage[],
): string | undefined {
  if (selection.type !== 'navigate' || selection.id !== FOCUS_GENERATED_NODE_ACTION
    || selection.target !== DOCUMENT_NODE_ACTION_TARGET) return;
  const message = messages.find((item) => item.id === selection.source.messageId);
  if (!message || message.metadata?.source !== DOCUMENT_ACTIVITY_MESSAGE_SOURCE
    || message.id !== `document-activity:${message.metadata.documentActivityId}`) return;
  const nodeId = message.metadata.nodeId;
  return typeof nodeId === 'string' && selection.params?.nodeId === nodeId ? nodeId : undefined;
}
