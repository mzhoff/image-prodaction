import { createHash } from 'node:crypto';
import type { ConversationStore } from '@prodactionpro/chat-application';
import { assertChatResourceAccess, ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getTimeline } from '@/modules/story-projects/server/timeline-service';
import type { TimelineDocument } from '@/modules/story-projects/contracts/story-timeline';
import { isUuid } from '@/shared/lib/id';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { summarizeTimelineForAssistant } from '../core/timeline-system-prompt';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { isUniqueViolation } from './home-conversation-service';

interface Dependencies {
  timeline(userId: string, id: string): Promise<TimelineDocument>;
  store: Pick<ConversationStore, 'create' | 'findById'>;
}
const defaults = (): Dependencies => ({ timeline: getTimeline, store: getChatConversationInfrastructure().store });

/** The document selector is encoded in an owner-scoped ID; it never grants document access. */
export function timelineConversationId(principal: ChatPrincipal, timelineId: string) {
  return `timeline:${timelineId}:${createHash('sha256').update(JSON.stringify([
    principal.productId, principal.tenantId, principal.userId, timelineId,
  ])).digest('hex')}`;
}
export function timelineIdFromConversation(id: string): string | undefined {
  const parts = id.split(':');
  return parts.length === 3 && parts[0] === 'timeline' && isUuid(parts[1]) && /^[a-f0-9]{64}$/.test(parts[2]) ? parts[1] : undefined;
}
function assertPrincipal(principal: ChatPrincipal) {
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) throw new ChatAccessError('Монтаж недоступен.', 'forbidden');
}
async function accessibleTimeline(principal: ChatPrincipal, id: string, dependencies: Dependencies) {
  assertPrincipal(principal);
  const timeline = await dependencies.timeline(principal.userId, id);
  if (timeline.workspaceId !== principal.tenantId) throw new ChatAccessError('Монтаж недоступен в этом пространстве.', 'forbidden');
  return timeline;
}
export async function findTimelineConversation(principal: ChatPrincipal, timelineId: string, dependencies = defaults()) {
  await accessibleTimeline(principal, timelineId, dependencies);
  const id = timelineConversationId(principal, timelineId);
  if (!await dependencies.store.findById(id)) return undefined;
  await assertConversation(principal, id, dependencies);
  return id;
}
export async function restoreTimelineConversation(principal: ChatPrincipal, timelineId: string, dependencies = defaults()) {
  const timeline = await accessibleTimeline(principal, timelineId, dependencies);
  const id = timelineConversationId(principal, timelineId);
  const existing = await dependencies.store.findById(id);
  if (!existing) {
    try { await dependencies.store.create({ id, mode: 'general-chat', title: `Timeline · ${timeline.name}`,
      productId: principal.productId, tenantId: principal.tenantId, userId: principal.userId }); }
    catch (error) { if (!isUniqueViolation(error)) throw error; }
  }
  await assertConversation(principal, id, dependencies);
  return id;
}
async function assertConversation(principal: ChatPrincipal, id: string, dependencies: Dependencies) {
  const conversation = await dependencies.store.findById(id);
  if (!conversation || !['active', 'error'].includes(conversation.status)) throw new ChatAccessError('Разговор недоступен.', 'forbidden');
  assertChatResourceAccess(principal, conversation);
}
export async function verifiedTimelineContext(principal: ChatPrincipal, conversationId: string, dependencies?: Dependencies) {
  if (!conversationId.startsWith('timeline:')) return undefined;
  assertPrincipal(principal);
  const id = timelineIdFromConversation(conversationId);
  if (!id || timelineConversationId(principal, id) !== conversationId) throw new ChatAccessError('Разговор не привязан к вашему монтажу.', 'forbidden');
  const deps = dependencies ?? defaults();
  await assertConversation(principal, conversationId, deps);
  return summarizeTimelineForAssistant(await accessibleTimeline(principal, id, deps));
}
