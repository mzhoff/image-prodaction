import assert from 'node:assert/strict';
import test from 'node:test';
import { claimCreationMessage, clearCreationMessage, queueCreationMessage, readCreationMessage } from './created-document-message';
const scope = { userId: 'owner', workspaceId: 'workspace', kind: 'storyboard' as const, documentId: 'story' };

test('first Send hands its prompt to exactly one runtime, including repeated effects', () => {
  queueCreationMessage(scope, 'История о путешествии');
  assert.equal(claimCreationMessage(scope)?.prompt, 'История о путешествии');
  assert.equal(claimCreationMessage(scope), undefined);
  assert.equal(readCreationMessage(scope)?.state, 'claimed');
  clearCreationMessage(scope); assert.equal(readCreationMessage(scope), undefined);
});
test('first-message handoff is scoped to user, workspace, document and kind', () => {
  queueCreationMessage(scope, 'Private draft');
  for (const other of [{ userId: 'other' }, { workspaceId: 'other' }, { documentId: 'other' }, { kind: 'timeline' as const }]) {
    assert.equal(readCreationMessage({ ...scope, ...other }), undefined);
  }
  clearCreationMessage(scope);
});
test('a reload recovers the draft but never authorizes another automatic paid turn', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const stored = JSON.stringify({ prompt: 'Potentially already sent', state: 'queued', createdAt: Date.now() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { sessionStorage: { getItem: () => stored, removeItem() {} } } });
  const recovered = { ...scope, documentId: 'reloaded' };
  try {
    assert.equal(readCreationMessage(recovered)?.prompt, 'Potentially already sent');
    assert.equal(claimCreationMessage(recovered), undefined);
    clearCreationMessage(recovered);
  } finally { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); }
});
