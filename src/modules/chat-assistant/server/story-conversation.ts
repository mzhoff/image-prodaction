import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { chatConversations } from '@prodactionpro/chat-persistence-drizzle/schema';
import { assertChatResourceAccess, ChatAccessError, type ChatPrincipal } from '@prodactionpro/chat-server-core';
import { getDb } from '@/shared/db/client';
import { storyProject } from '@/shared/db/schema/story-project';
import { user } from '@/shared/db/schema/auth';
import { getStory } from '@/modules/story-projects/server/story-service';
import { characterPassportText, isCharacterReady } from '@/modules/story-projects/core/character-passport';
import { getSubjectProfile } from '@/entities/production-graph/server/subject-profile-service';
import { CHAT_ASSISTANT_PRODUCT_ID } from '../contracts/assistant-config';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { isUniqueViolation } from './home-conversation-service';

export const storyChatConversation = pgTable('story_chat_conversation', {
  conversationId: text('conversation_id').primaryKey().references(() => chatConversations.id, { onDelete: 'cascade' }),
  storyboardId: uuid('storyboard_id').notNull().references(() => storyProject.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [uniqueIndex('story_chat_conversation_storyboard_id_user_id_key').on(table.storyboardId, table.userId)]);

export const restoreStoryConversation = (principal: ChatPrincipal, storyboardId: string) => resolveStoryConversation(principal, storyboardId, true).then((id) => id!);
export const findStoryConversation = (principal: ChatPrincipal, storyboardId: string) => resolveStoryConversation(principal, storyboardId, false);

async function resolveStoryConversation(principal: ChatPrincipal, storyboardId: string, create: boolean) {
  const story = await getStory(principal.userId, storyboardId);
  if (story.workspaceId !== principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) throw new ChatAccessError('Раскадровка недоступна.', 'forbidden');
  const id = `story:${createHash('sha256').update(JSON.stringify([principal.productId, principal.tenantId, principal.userId, storyboardId])).digest('hex')}`;
  const { store } = getChatConversationInfrastructure();
  const existing = await store.findById(id);
  if (!existing && !create) return undefined;
  if (!create) {
    const [binding] = await getDb().select({ id: storyChatConversation.conversationId }).from(storyChatConversation)
      .where(and(eq(storyChatConversation.conversationId, id), eq(storyChatConversation.storyboardId, storyboardId), eq(storyChatConversation.userId, principal.userId))).limit(1);
    if (!binding) return undefined; // A retry of the first Send will finish an interrupted binding.
  }
  if (!existing) try { await store.create({ id, mode: 'general-chat', title: `Blueprint · ${story.name}`, productId: principal.productId, tenantId: principal.tenantId, userId: principal.userId }); }
  catch (error) { if (!isUniqueViolation(error)) throw error; }
  const conversation = await store.findById(id);
  if (!conversation || !['active', 'error'].includes(conversation.status)) throw new ChatAccessError('Разговор недоступен.', 'forbidden');
  assertChatResourceAccess(principal, conversation);
  if (create) await getDb().insert(storyChatConversation).values({ conversationId: id, storyboardId, userId: principal.userId }).onConflictDoNothing();
  return id;
}
export async function verifiedStoryContext(principal: ChatPrincipal, conversationId: string) {
  if (!conversationId.startsWith('story:')) return undefined;
  if (!principal.tenantId || principal.productId !== CHAT_ASSISTANT_PRODUCT_ID) throw new ChatAccessError('Раскадровка недоступна.', 'forbidden');
  const [binding] = await getDb().select().from(storyChatConversation).where(and(eq(storyChatConversation.conversationId, conversationId), eq(storyChatConversation.userId, principal.userId))).limit(1);
  if (!binding) throw new ChatAccessError('Разговор не привязан к раскадровке.', 'forbidden');
  const story = await getStory(principal.userId, binding.storyboardId);
  if (story.workspaceId !== principal.tenantId) throw new ChatAccessError('Раскадровка недоступна.', 'forbidden');
  const subjects = await Promise.all((story.snapshot.subjectIds ?? []).map(async (id) => {
    const subject = await getSubjectProfile(principal.userId, principal.tenantId!, id);
    return { id: subject.id, name: subject.name, passport: subject.passportText.slice(0, 12_000) };
  }));
  return { id: story.id, name: story.name, revision: story.revision, settings: story.snapshot.settings,
    characters: story.snapshot.characters?.map((character) => ({ id: character.id, revision: character.revision,
      passport: character.passport, text: characterPassportText(character.passport), ready: isCharacterReady(character, story.snapshot.blueprint.visualStyle),
      selectedReferenceId: character.selectedReference?.assetId })), charactersSkipped: story.snapshot.charactersSkipped,
    subjects,
    blueprint: Object.fromEntries(Object.entries(story.snapshot.blueprint).map(([key, value]) => [key, value.slice(0, 12_000)])),
    scenes: story.snapshot.scenes.slice(0, 20).map((scene) => ({ title: scene.title, description: scene.description.slice(0, 1000) })) };
}
