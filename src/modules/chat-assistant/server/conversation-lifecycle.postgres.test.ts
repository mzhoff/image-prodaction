import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { chatConversations } from '@prodactionpro/chat-persistence-drizzle/schema';
import { createTextMessage } from '@prodactionpro/chat-domain';
import * as schema from '@/shared/db/schema';
import { user } from '@/shared/db/schema/auth';
import { workspace, membership } from '@/shared/db/schema/workspace';
import { document } from '@/shared/db/schema/document';
import { storyProject } from '@/shared/db/schema/story-project';
import { storyTimeline } from '@/shared/db/schema/story-timeline';
import { createStorySnapshot, settingsForFormat } from '@/modules/story-projects/core/story-presets';
import { createHomeConversation, restoreHomeConversation } from './home-conversation-service';
import { ensureDocumentConversation, findDocumentConversation } from './document-conversation-service';
import { findTimelineConversation, restoreTimelineConversation } from './timeline-conversation';
import { listDocumentAssistantActivity, recordDocumentAssistantActivity } from './document-activity-service';
import { getChatConversationInfrastructure } from './conversation-infrastructure';
import { listProductionChats } from './production-chat-service';

test('PostgreSQL: documents and activities exist independently; only submitted conversations reach the sidebar', { skip: !process.env.STORIES_TEST_DATABASE_URL }, async () => {
  const { findStoryConversation, restoreStoryConversation } = await import('./story-conversation');
  const pool = new Pool({ connectionString: process.env.STORIES_TEST_DATABASE_URL });
  const db = drizzle(pool, { schema });
  const globals = globalThis as typeof globalThis & { imageProdactionDb?: typeof db; imageProdactionPool?: Pool };
  const previousDb = globals.imageProdactionDb, previousPool = globals.imageProdactionPool;
  const rollback = new Error('rollback_lifecycle_fixture');
  try { await db.transaction(async (tx) => {
    globals.imageProdactionDb = tx as unknown as typeof db; globals.imageProdactionPool = pool;
    const owner = randomUUID(), ws = randomUUID(), flow = randomUUID(), story = randomUUID(), timeline = randomUUID();
    const principal = { productId: 'image-production', userId: owner, tenantId: ws };
    await tx.insert(user).values({ id: owner, name: 'Conversation lifecycle QA', termsAcceptedAt: new Date(), termsVersion: 'test' });
    await tx.insert(workspace).values({ id: ws, name: 'Lifecycle QA', createdByUserId: owner });
    await tx.insert(membership).values({ workspaceId: ws, userId: owner, role: 'owner' });
    await tx.insert(document).values({ id: flow, name: 'Independent Flow', workspaceId: ws, createdByUserId: owner });
    await tx.insert(storyProject).values({ id: story, name: 'Independent Story', workspaceId: ws, createdByUserId: owner, snapshot: createStorySnapshot(settingsForFormat('shorts')) });
    await tx.insert(storyTimeline).values({ id: timeline, name: 'Independent Timeline', workspaceId: ws, createdByUserId: owner,
      snapshot: { schemaVersion: 1, aspectRatio: '16:9', frameRate: 24, clips: [] } });
    const conversations = () => tx.select().from(chatConversations).where(eq(chatConversations.userId, owner));
    for (let visit = 0; visit < 2; visit++) {
      assert.equal(await restoreHomeConversation(principal), undefined);
      assert.equal(await findDocumentConversation(principal, flow), undefined);
      assert.equal(await findStoryConversation(principal, story), undefined);
      assert.equal(await findTimelineConversation(principal, timeline), undefined);
    }
    await recordDocumentAssistantActivity(principal, { documentId: flow, kind: 'image-generated', nodeId: 'fixture-node' });
    assert.equal((await listDocumentAssistantActivity(principal, flow)).length, 1);
    assert.deepEqual(await conversations(), [], 'opening documents or recording a node result must not create chats');
    const homeId = `home:${randomUUID()}`;
    const home = await createHomeConversation(principal, homeId);
    assert.equal((await createHomeConversation(principal, homeId)).id, home.id);
    const flowChat = await ensureDocumentConversation(principal, flow);
    assert.equal(await ensureDocumentConversation(principal, flow), flowChat);
    const storyChat = await restoreStoryConversation(principal, story);
    const timelineChat = await restoreTimelineConversation(principal, timeline);
    assert.equal(await findStoryConversation(principal, story), storyChat);
    assert.equal(await findTimelineConversation(principal, timeline), timelineChat);
    assert.equal((await conversations()).length, 4);
    await listDocumentAssistantActivity(principal, flow);
    assert.deepEqual(await listProductionChats(principal, {}, tx), [], 'even named or assistant-only preparations stay hidden');
    const { store } = getChatConversationInfrastructure();
    for (const conversationId of [home.id, flowChat, storyChat, timelineChat]) {
      await store.appendMessage(createTextMessage({ conversationId, role: 'user', content: 'Обсудим свет для рекламного ролика' }));
    }
    const chats = await listProductionChats(principal, {}, tx);
    assert.equal(chats.length, 4);
    assert.ok(chats.every((chat) => chat.title === 'Обсудим свет для рекламного ролика'));
    assert.equal(chats.find((chat) => chat.id === home.id)?.artifactName, undefined, 'a text chat needs no document');
    assert.equal((await store.listMessages(flowChat)).filter((message) => message.role === 'assistant').length, 1, 'document events survive delayed binding');
    await assert.rejects(findTimelineConversation({ ...principal, tenantId: randomUUID() }, timeline));
    await assert.rejects(findStoryConversation({ ...principal, tenantId: randomUUID() }, story));
    await assert.rejects(findDocumentConversation({ ...principal, tenantId: randomUUID() }, flow));
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; }
  finally { globals.imageProdactionDb = previousDb; globals.imageProdactionPool = previousPool; await pool.end(); }
});
