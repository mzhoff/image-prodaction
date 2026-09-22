import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { chatConversations as conversations, chatMessages } from '@prodactionpro/chat-persistence-drizzle/schema';
import { ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import { membership } from '@/shared/db/schema/workspace';
import { getDb } from '@/shared/db/client';
import { document } from '@/shared/db/schema/document';
import { storyProject } from '@/shared/db/schema/story-project';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import type { ProductionChatChange, ProductionChatSummary } from '../contracts/production-chats';
import { productionChat } from './production-chat-schema';
import { chatDocumentConversation } from './document-conversation-schema';
import { timelineIdFromConversation } from './timeline-conversation';
import { conversationDisplayTitle, startedConversation } from './production-chat-visibility';

export type ProductionChatDatabase = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update' | 'transaction'>;
type Database = ProductionChatDatabase;
export const chatOwner = (principal: ChatPrincipal) => and(eq(conversations.productId, principal.productId),
  eq(conversations.tenantId, principal.tenantId!), eq(conversations.userId, principal.userId));

export async function requireProductionChat(principal: ChatPrincipal, id: string, db: Database = getDb()) {
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) throw new ChatAccessError('Чат недоступен.', 'forbidden');
  await requireChatMembership(principal, db);
  const [row] = await db.select().from(conversations).where(and(chatOwner(principal), eq(conversations.id, id))).limit(1);
  if (!row) throw new ChatAccessError('Чат недоступен.', 'forbidden');
  return row;
}

export async function listProductionChats(principal: ChatPrincipal, options: { status?: string; folderId?: string; query?: string; limit?: number; offset?: number } = {}, db: Database = getDb()): Promise<ProductionChatSummary[]> {
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) throw new ChatAccessError('Выберите пространство.', 'forbidden');
  await requireChatMembership(principal, db);
  const status = options.status === 'archived' || options.status === 'deleted' ? options.status : 'active';
  const rows = await db.select({ conversation: conversations, details: productionChat, title: conversationDisplayTitle,
    lastMode: sql<string | null>`(select coalesce(${chatMessages.metadata}->>'homeComposerMode', ${chatMessages.metadata}->>'mode') from ${chatMessages}
      where ${chatMessages.conversationId} = ${conversations.id} and ${chatMessages.role} = 'user'
      order by ${chatMessages.createdAt} desc, ${chatMessages.id} desc limit 1)`,
    documentId: document.id, documentName: document.name, documentFolder: document.folderId,
    storyId: sql<string | null>`sb.storyboard_id`, storyName: storyProject.name, storyFolder: storyProject.folderId,
  }).from(conversations).leftJoin(productionChat, eq(productionChat.conversationId, conversations.id))
    .leftJoin(chatDocumentConversation, eq(chatDocumentConversation.conversationId, conversations.id))
    .leftJoin(document, and(eq(document.id, chatDocumentConversation.documentId), eq(document.workspaceId, principal.tenantId)))
    .leftJoin(sql`story_chat_conversation sb`, sql`sb.conversation_id = ${conversations.id}`)
    .leftJoin(storyProject, and(sql`${storyProject.id} = sb.storyboard_id`, eq(storyProject.workspaceId, principal.tenantId)))
    .where(and(chatOwner(principal), startedConversation, status === 'active' ? or(isNull(productionChat.status), eq(productionChat.status, status)) : eq(productionChat.status, status),
      options.folderId ? sql`(case when ${document.id} is not null then ${document.folderId} when ${storyProject.id} is not null then ${storyProject.folderId} else ${productionChat.folderId} end) = ${options.folderId}::uuid` : undefined,
      options.query ? ilike(conversationDisplayTitle, `%${options.query.replace(/[\\%_]/g, '\\$&')}%`) : undefined))
    .orderBy(desc(sql`greatest(${conversations.updatedAt}, ${productionChat.updatedAt})`), desc(conversations.id)).limit(options.limit ?? 200).offset(options.offset ?? 0);
  return rows.map(({ conversation: c, details: d, title, lastMode, documentId, documentName, documentFolder, storyId, storyName, storyFolder }) => {
    const timelineId = timelineIdFromConversation(c.id);
    const kind = storyId ? 'storyboard' : documentId ? 'flow' : c.id.startsWith('home:') ? 'home' : 'assistant';
    return { id: c.id, title, status: d?.status ?? 'active',
      folderId: documentId ? documentFolder : storyId ? storyFolder : d?.folderId ?? null, kind,
      workflowKind: timelineId ? 'timeline' : storyId ? 'storyboard' : documentId ? 'flow' : lastMode === 'video' ? 'video' : (lastMode ?? c.mode) === 'image-generation' ? 'image' : 'text',
      href: timelineId ? `/create?type=timeline&document=${timelineId}` : storyId ? `/?create=storyboard&story=${storyId}` : documentId ? `/projects/${documentId}?assistant=1` : c.id.startsWith('home:')
        ? `/?create=${lastMode === 'video' ? 'video' : (lastMode ?? c.mode) === 'general-chat' ? 'text' : 'image'}&chat=${encodeURIComponent(c.id)}` : `/chats/${encodeURIComponent(c.id)}`,
      updatedAt: new Date(Math.max(c.updatedAt.getTime(), d?.updatedAt.getTime() ?? 0)).toISOString(),
      messageCount: c.messageCount, artifactName: storyName ?? documentName ?? undefined };
  });
}

export async function changeProductionChat(principal: ChatPrincipal, id: string, change: ProductionChatChange, db: Database = getDb()) {
  await requireProductionChat(principal, id, db);
  await db.transaction(async (tx) => {
    // Lock the conversation against competing rename/move actions; never alter its message history.
    await tx.select({ id: conversations.id }).from(conversations).where(and(chatOwner(principal), eq(conversations.id, id))).for('update');
    await tx.insert(productionChat).values({ conversationId: id }).onConflictDoNothing();
    if (change.action === 'move') {
      if (change.folderId) {
        const [folder] = await tx.select().from(studioFolder).where(and(eq(studioFolder.id, change.folderId), eq(studioFolder.workspaceId, principal.tenantId!))).for('share');
        if (!folder || folder.systemKey) throw new ChatAccessError('Выберите обычный проект в этом пространстве.', 'forbidden');
      }
      await tx.update(document).set({ folderId: change.folderId, revision: sql`${document.revision} + 1`, updatedAt: new Date() }).where(and(eq(document.workspaceId, principal.tenantId!),
        sql`${document.id} in (select document_id from ${chatDocumentConversation} where conversation_id = ${id})`));
      await tx.update(storyProject).set({ folderId: change.folderId, revision: sql`${storyProject.revision} + 1`, updatedAt: new Date() }).where(and(eq(storyProject.workspaceId, principal.tenantId!),
        sql`${storyProject.id} in (select storyboard_id from story_chat_conversation where conversation_id = ${id})`));
      await tx.update(productionChat).set({ folderId: change.folderId, updatedAt: new Date() }).where(eq(productionChat.conversationId, id));
    } else {
      await tx.update(productionChat).set({ ...(change.action === 'rename' ? { title: change.title, titleSource: 'user' as const }
        : { status: change.action === 'archive' ? 'archived' as const : change.action === 'delete' ? 'deleted' as const : 'active' as const }), updatedAt: new Date() }).where(eq(productionChat.conversationId, id));
    }
  });
}

export async function assertProductionChatWritable(principal: ChatPrincipal, id: string, db: Database = getDb()) {
  await requireProductionChat(principal, id, db);
  const [row] = await db.select().from(productionChat).where(eq(productionChat.conversationId, id));
  if (row && row.status !== 'active') throw new ChatAccessError('Восстановите чат через фильтр архива или корзины в боковом меню, чтобы продолжить разговор.', 'forbidden');
}

async function requireChatMembership(principal: ChatPrincipal, db: Database) {
  const [member] = await db.select({ role: membership.role }).from(membership)
    .where(and(eq(membership.userId, principal.userId), eq(membership.workspaceId, principal.tenantId!))).limit(1);
  if (!member || !['owner', 'admin', 'member'].includes(member.role)) throw new ChatAccessError('Чат недоступен.', 'forbidden');
}
