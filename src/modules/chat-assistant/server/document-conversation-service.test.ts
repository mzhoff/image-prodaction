import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBoundConversationContextSelectors } from './document-conversation-service.ts';

test('restores the complete persisted selectors for one matching binding', () => {
  assert.deepEqual(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1'],
    latestUserMessageMetadata: {
      contextSelectors: {
        document: { id: 'document-1', revision: '42' },
        route: '/projects/document-1',
        selection: { ids: ['node-1', 'node-2'] },
      },
    },
  }), {
    document: { id: 'document-1', revision: '42' },
    route: '/projects/document-1',
    selection: { ids: ['node-1', 'node-2'] },
  });
});

test('preserves an unsaved revision so write tools continue to fail closed', () => {
  assert.deepEqual(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1'],
    latestUserMessageMetadata: {
      contextSelectors: {
        document: { id: 'document-1', revision: 'unsaved:42:local-change' },
      },
    },
  }), {
    document: { id: 'document-1', revision: 'unsaved:42:local-change' },
  });
});

test('rejects missing and ambiguous conversation bindings', () => {
  const latestUserMessageMetadata = {
    contextSelectors: { document: { id: 'document-1', revision: '42' } },
  };

  assert.equal(resolveBoundConversationContextSelectors({
    bindingDocumentIds: [],
    latestUserMessageMetadata,
  }), undefined);
  assert.equal(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1', 'document-2'],
    latestUserMessageMetadata,
  }), undefined);
});

test('rejects missing, malformed, and mismatched persisted selectors', () => {
  assert.equal(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1'],
    latestUserMessageMetadata: undefined,
  }), undefined);
  assert.equal(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1'],
    latestUserMessageMetadata: {
      contextSelectors: { document: { id: '', revision: '42' } },
    },
  }), undefined);
  assert.equal(resolveBoundConversationContextSelectors({
    bindingDocumentIds: ['document-1'],
    latestUserMessageMetadata: {
      contextSelectors: { document: { id: 'document-2', revision: '42' } },
    },
  }), undefined);
});
