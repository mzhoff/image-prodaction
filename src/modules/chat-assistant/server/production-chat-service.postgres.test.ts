import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, sql } from 'drizzle-orm';
import { Pool } from 'pg';
import { chatConversations, chatMessages } from '@prodactionpro/chat-persistence-drizzle/schema';
import type { ToolCallingLanguageModelInput } from '@prodactionpro/chat-connectors';
import * as schema from '@/shared/db/schema';
import { user } from '@/shared/db/schema/auth';
import { workspace, membership } from '@/shared/db/schema/workspace';
import { studioFolder } from '@/shared/db/schema/studio-folder';
import { document } from '@/shared/db/schema/document';
import { asset } from '@/shared/db/schema/asset';
import { generationJob } from '@/shared/db/schema/generation';
import { projectMediaConditions } from '@/modules/project-containers/server/project-media-query';
import { storyProject } from '@/shared/db/schema/story-project';
import { createStorySnapshot, settingsForFormat } from '@/modules/story-projects/core/story-presets';
import { productionChat } from './production-chat-schema';
import { chatDocumentConversation } from './document-conversation-schema';
import { assertProductionChatWritable, changeProductionChat, listProductionChats } from './production-chat-service';
import { withProductionChatTitle } from './production-chat-title';

test('PostgreSQL: private chat lifecycle, atomic artifact move, model title and manual rename race', { skip: !process.env.STORIES_TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.STORIES_TEST_DATABASE_URL }); const db = drizzle(pool, { schema });
  const rollback = new Error('rollback_chat_fixture');
  try { await db.transaction(async (tx) => {
    const owner = randomUUID(), other = randomUUID(), ws = randomUUID(), foreignWs = randomUUID(), folder = randomUUID(), foreignFolder = randomUUID(), flow = randomUUID(), story = randomUUID();
    const ids = ['home:', 'flow:', 'story:', 'foreign:'].map((prefix) => prefix + randomUUID());
    const principal = { productId: 'image-production', userId: owner, tenantId: ws };
    await tx.insert(user).values([owner, other].map((id) => ({ id, name: 'Production chats QA', termsAcceptedAt: new Date(), termsVersion: 'test' })));
    await tx.insert(workspace).values([{ id: ws, name: 'Own', createdByUserId: owner }, { id: foreignWs, name: 'Foreign', createdByUserId: other }]);
    await tx.insert(membership).values([{ workspaceId: ws, userId: owner, role: 'owner' }, { workspaceId: ws, userId: other, role: 'member' }]);
    await tx.insert(studioFolder).values([{ id: folder, name: 'Own project', workspaceId: ws, createdByUserId: owner }, { id: foreignFolder, name: 'Foreign project', workspaceId: foreignWs, createdByUserId: other }]);
    await tx.insert(document).values({ id: flow, name: 'Flow artifact', workspaceId: ws, createdByUserId: owner });
    await tx.insert(storyProject).values({ id: story, name: 'Storyboard artifact', workspaceId: ws, createdByUserId: owner, snapshot: createStorySnapshot(settingsForFormat('shorts')) });
    await tx.insert(chatConversations).values(ids.map((id, index) => ({ ...principal, userId: index === 3 ? other : owner, id, mode: 'general-chat', title: 'Initial' })));
    await tx.insert(chatDocumentConversation).values({ id: randomUUID(), documentId: flow, workspaceId: ws, userId: owner, conversationId: ids[1] });
    await tx.execute(sql`insert into story_chat_conversation(conversation_id, storyboard_id, user_id) values (${ids[2]},${story},${owner})`);
    assert.deepEqual(await listProductionChats(principal, {}, tx), [], 'documents without user messages are not chats');
    // A named, assistant-only conversation and an empty user bubble stay invisible, before pagination.
    const assistantOnly = `home:${randomUUID()}`, emptyUser = `home:${randomUUID()}`;
    await tx.insert(chatConversations).values([assistantOnly, emptyUser].map((id) => ({ ...principal, id, mode: 'general-chat', title: 'Document title' })));
    await tx.insert(productionChat).values({ conversationId: assistantOnly, title: 'Готовое изображение', titleSource: 'model' });
    await tx.insert(chatMessages).values([
      { id: randomUUID(), conversationId: assistantOnly, role: 'assistant', blocks: [{ type: 'text', content: 'Изображение готово' }] },
      { id: randomUUID(), conversationId: emptyUser, role: 'user', blocks: [{ type: 'text', content: '   ' }] },
    ]);
    assert.deepEqual(await listProductionChats(principal, {}, tx), []);
    await tx.insert(chatMessages).values(ids.map((conversationId) => ({ id: randomUUID(), conversationId, role: 'user',
      createdAt: new Date(Date.now() - 60_000), blocks: [{ type: 'text' as const, content: 'Собрать ролик для кофейни' }] })));
    assert.equal((await listProductionChats(principal, { query: 'кофейни' }, tx)).length, 3, 'legacy titles use the user intention, not a document placeholder');
    assert.ok((await listProductionChats(principal, {}, tx)).every((chat) => chat.title === 'Собрать ролик для кофейни'));
    assert.deepEqual((await listProductionChats(principal, {}, tx)).map((c) => c.id).sort(), ids.slice(0, 3).sort());
    const ordered = await listProductionChats(principal, {}, tx);
    assert.deepEqual((await listProductionChats(principal, { limit: 1, offset: 1 }, tx)).map((chat) => chat.id), [ordered[1].id]);
    const child = randomUUID(), grandchild = randomUUID();
    await tx.insert(studioFolder).values({ id: child, name: 'Nested', parentId: folder, workspaceId: ws, createdByUserId: owner });
    await tx.insert(studioFolder).values({ id: grandchild, name: 'Nested again', parentId: child, workspaceId: ws, createdByUserId: owner });
    await changeProductionChat(principal, ids[1], { action: 'move', folderId: grandchild }, tx);
    assert.equal((await listProductionChats(principal, { folderId: grandchild }, tx))[0].workflowKind, 'flow');
    assert.equal((await tx.select().from(document).where(eq(document.id, flow)))[0].folderId, grandchild);
    await assert.rejects(tx.transaction(async (savepoint) => {
      await savepoint.insert(studioFolder).values({ id: randomUUID(), name: 'Invalid parent', parentId: foreignFolder, workspaceId: ws, createdByUserId: owner });
    }), /parent|foreign|insert|update/i);
    await tx.update(chatConversations).set({ mode: 'image-generation' }).where(eq(chatConversations.id, ids[0]));
    await tx.insert(chatMessages).values({ id: randomUUID(), conversationId: ids[0], role: 'user', blocks: [], metadata: { mode: 'general-chat' } });
    assert.match((await listProductionChats(principal, {}, tx)).find((chat) => chat.id === ids[0])!.href, /create=text/);
    await tx.update(chatMessages).set({ metadata: { mode: 'general-chat', homeComposerMode: 'video' } }).where(eq(chatMessages.conversationId, ids[0]));
    assert.match((await listProductionChats(principal, {}, tx)).find((chat) => chat.id === ids[0])!.href, /create=video/);
    await assert.rejects(changeProductionChat(principal, ids[3], { action: 'delete' }, tx), /недоступен/);
    await assert.rejects(changeProductionChat(principal, ids[1], { action: 'move', folderId: foreignFolder }, tx), /проект/);
    for (const id of ids.slice(0, 3)) await changeProductionChat(principal, id, { action: 'move', folderId: folder }, tx);
    assert.equal((await listProductionChats(principal, { folderId: folder }, tx)).length, 3);
    assert.equal((await tx.select().from(document).where(eq(document.id, flow)))[0].folderId, folder);
    assert.equal((await tx.select().from(storyProject).where(eq(storyProject.id, story)))[0].revision, 1);
    // A result created after the chat was moved follows its project without copying the file.
    const job = randomUUID(), media = randomUUID();
    await tx.insert(generationJob).values({ id: job, workspaceId: ws, createdByUserId: owner, provider: 'test', modelId: 'test', operation: 'generate_image', idempotencyKey: job, status: 'succeeded' });
    await tx.insert(asset).values({ id: media, generationJobId: job, workspaceId: ws, createdByUserId: owner,
      bucket: 'test', storageKey: media, originalName: 'Test result', contentType: 'image/webp', byteSize: 10, checksumSha256: 'a'.repeat(64), status: 'ready', libraryVisible: true, origin: 'generated' });
    await tx.execute(sql`insert into home_chat_conversation(conversation_id, workspace_id, user_id) values(${ids[0]},${ws},${owner})`);
    await tx.execute(sql`insert into home_chat_generation(id, conversation_id, workspace_id, user_id, source_turn_id, source_message_id, tool_call_id, input, attachments, job_id, expires_at)
      values(${randomUUID()},${ids[0]},${ws},${owner},'test-turn','test-message','test-tool','{}'::jsonb,'[]'::jsonb,${job},now())`);
    const projectMedia = () => tx.select({ id: asset.id }).from(asset).where(and(...projectMediaConditions({ workspaceId: ws, folderId: folder, storyAssetIds: [] })));
    assert.deepEqual(await projectMedia(), [{ id: media }]);
    // Direct video jobs use the same chat ownership, without an image generation binding.
    await tx.execute(sql`delete from home_chat_generation where job_id = ${job}`);
    await tx.update(generationJob).set({ operation: 'generate_video', metadata: { source: 'home-chat', conversationId: ids[0] } }).where(eq(generationJob.id, job));
    assert.deepEqual(await projectMedia(), [{ id: media }]);
    await changeProductionChat(principal, ids[0], { action: 'move', folderId: null }, tx);
    assert.deepEqual(await projectMedia(), []);
    await changeProductionChat(principal, ids[0], { action: 'move', folderId: folder }, tx);
    await changeProductionChat(principal, ids[0], { action: 'archive' }, tx);
    assert.equal((await listProductionChats(principal, { status: 'archived' }, tx)).length, 1);
    await assert.rejects(assertProductionChatWritable(principal, ids[0], tx), /Восстановите/);
    await changeProductionChat(principal, ids[0], { action: 'delete' }, tx);
    assert.equal((await listProductionChats(principal, { status: 'deleted' }, tx)).length, 1);
    assert.equal((await tx.select().from(document).where(eq(document.id, flow))).length, 1);
    assert.deepEqual(await projectMedia(), [{ id: media }]);
    await changeProductionChat(principal, ids[0], { action: 'restore' }, tx);
    const input: ToolCallingLanguageModelInput = { model: 'test', tools: [], messages: [{ role: 'user', content: 'Создай ролик для кофейни' }] };
    let calls = 0;
    const named = withProductionChatTitle({ completeWithTools: async (received) => {
      calls++; assert.match(JSON.stringify(received.messages), /production_chat_title/);
      return { content: '<production_chat_title>Проморолик кофейни</production_chat_title>Ответ', provider: 'fake', model: 'test', toolCalls: [] };
    } }, principal, ids[0], tx);
    assert.equal((await named.completeWithTools(input)).content, 'Ответ'); assert.equal(calls, 1);
    assert.equal((await tx.select().from(productionChat).where(eq(productionChat.conversationId, ids[0])))[0].titleSource, 'model');
    const racing = withProductionChatTitle({ completeWithTools: async () => {
      await changeProductionChat(principal, ids[1], { action: 'rename', title: 'Моё название' }, tx);
      return { content: '<production_chat_title>Автоматическое название</production_chat_title>Ответ', provider: 'fake', model: 'test', toolCalls: [] };
    } }, principal, ids[1], tx);
    await racing.completeWithTools(input);
    assert.equal((await tx.select().from(productionChat).where(eq(productionChat.conversationId, ids[1])))[0].title, 'Моё название');
    await tx.delete(membership).where(and(eq(membership.userId, owner), eq(membership.workspaceId, ws)));
    await assert.rejects(listProductionChats(principal, {}, tx), /недоступен/);
    throw rollback;
  }); } catch (error) { if (error !== rollback) throw error; } finally { await pool.end(); }
});
