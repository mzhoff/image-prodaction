import type { ConversationStore } from '@prodactionpro/chat-application';
import { chatActionSelectionSchema } from '@prodactionpro/chat-domain';
import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { assertChatResourceAccess } from '@prodactionpro/chat-server-core';
import { DESIGN_ELEMENT_SELECTION_TOOL } from '../contracts/design-element-selection';
import { createDesignElementSelection } from './design-element-selection-service';

// Only the current user turn answers this interaction. A later, new brief is
// allowed to open a new questionnaire; old choices never authorize a write.
export async function readDesignSelectionContinuation(store: ConversationStore, context: ToolExecutionContext) {
  const conversation = await store.findById(context.conversationId);
  if (!conversation) return undefined;
  assertChatResourceAccess(context, conversation);
  const messages = await store.listMessages(context.conversationId);
  const latestUser = messages.findLast((message) => message.role === 'user');
  const action = chatActionSelectionSchema.safeParse(latestUser?.metadata?.selectedAction);
  if (!action.success || action.data.type !== 'submit') return undefined;
  const payload = action.data.payload;
  if (payload?.kind !== 'design-element-selection' || payload.version !== 1
    || typeof payload.interactionId !== 'string') return undefined;
  const question = await store.findToolCall(payload.interactionId);
  if (!question || question.conversationId !== context.conversationId
    || question.toolName !== DESIGN_ELEMENT_SELECTION_TOOL || question.status !== 'completed'
    || (action.data.source.messageId !== question.id && action.data.source.messageId !== question.messageId)
    || question.output?.action !== 'select-design-elements') return undefined;
  const original = createDesignElementSelection(question.output, question.id);
  const selectedIds = Array.isArray(payload.selectedElementIds) ? payload.selectedElementIds : [];
  const selectedElements = original.elements.filter((element) => selectedIds.includes(element.id));
  return {
    action: 'design-elements-selected', version: 1, interactionId: question.id,
    baseImageStrategy: payload.baseImageStrategy === 'layered' ? 'layered' : 'single-image',
    textStrategy: payload.textStrategy === 'separate' ? 'separate' : 'embedded',
    selectedElementIds: selectedElements.map((element) => element.id), selectedElements,
    customElements: Array.isArray(payload.customElements)
      ? payload.customElements.filter((value): value is string => typeof value === 'string').slice(0, 8).map((value) => value.slice(0, 80))
      : [],
    nextStep: 'The user has already submitted this choice. Do not ask again or wait for another form. Prepare one pipeline_build or pipeline_update proposal from these choices and the original brief. The usual preview/approval is still required before changing the graph.',
  };
}
