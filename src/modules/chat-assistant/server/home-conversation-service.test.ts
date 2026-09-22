import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryConversationStore } from '@prodactionpro/chat-application';
import { requireHomeConversation } from './home-conversation-service';

const principal = { productId: 'image-production', tenantId: 'workspace', userId: 'user' };
const conversationId = 'home:existing';
type Dependencies = NonNullable<Parameters<typeof requireHomeConversation>[2]>;

async function fixture() {
  const store = new InMemoryConversationStore();
  const conversation = await store.create({ ...principal, id: conversationId, mode: 'image-generation' });
  let memberships = 0;
  const dependencies: Dependencies = {
    async bindingExists(actor, id) { assert.deepEqual(actor, principal); assert.equal(id, conversationId); return true; },
    async membership(userId, workspaceId) { assert.equal(userId, principal.userId); assert.equal(workspaceId, principal.tenantId); memberships += 1; },
    async conversation(id) { assert.equal(id, conversationId); return conversation; },
  };
  return { conversation, dependencies, memberships: () => memberships };
}

test('A failed Home conversation remains restorable with its existing ID and error status', async () => {
  const f = await fixture();
  f.conversation.status = 'error';
  const restored = await requireHomeConversation(principal, conversationId, f.dependencies);
  assert.equal(restored, f.conversation);
  assert.equal(restored.status, 'error');
  assert.equal(restored.id, conversationId);
  assert.equal(f.memberships(), 1);
  f.conversation.status = 'active';
  assert.equal((await requireHomeConversation(principal, conversationId, f.dependencies)).id, conversationId);
});

test('An archived or deleted Home conversation is still unavailable', async () => {
  const f = await fixture();
  f.conversation.status = 'archived';
  await assert.rejects(() => requireHomeConversation(principal, conversationId, f.dependencies), /недоступен/);
  f.dependencies.conversation = async () => null;
  await assert.rejects(() => requireHomeConversation(principal, conversationId, f.dependencies), /недоступен/);
});

test('Recoverable error does not weaken Home binding, membership or conversation ownership checks', async () => {
  const f = await fixture();
  f.conversation.status = 'error';
  for (const foreign of [{ userId: 'other' }, { tenantId: 'other' }, { productId: 'other' }]) {
    f.dependencies.conversation = async () => ({ ...f.conversation, ...foreign });
    await assert.rejects(() => requireHomeConversation(principal, conversationId, f.dependencies), /another/);
  }
  f.dependencies.conversation = async () => f.conversation;
  f.dependencies.bindingExists = async () => false;
  await assert.rejects(() => requireHomeConversation(principal, conversationId, f.dependencies), /недоступен/);
  f.dependencies.bindingExists = async () => true;
  f.dependencies.membership = async () => { throw new Error('Membership revoked'); };
  await assert.rejects(() => requireHomeConversation(principal, conversationId, f.dependencies), /Membership revoked/);
});
