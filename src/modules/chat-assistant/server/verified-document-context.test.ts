import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { readVerifiedDocumentContext } from './verified-document-context.ts';

test('accepts a server-verified document when only the browser selector revision is stale', () => {
  const context = createContext({
    document: {
      id: 'document-1',
      revision: 45,
      selectorRevisionMatches: false,
    },
  });

  assert.deepEqual(readVerifiedDocumentContext(context), {
    id: 'document-1',
    revision: 45,
  });
});

test('rejects missing or malformed server-verified document identity', () => {
  assert.throws(
    () => readVerifiedDocumentContext(createContext({})),
    /verified document context/u,
  );
  assert.throws(
    () => readVerifiedDocumentContext(createContext({ document: { id: 'document-1', revision: 1.5 } })),
    /verified document context/u,
  );
});

test('rejects a context whose latest graph changes exist only in the browser', () => {
  assert.throws(
    () => readVerifiedDocumentContext(createContext({
      document: {
        id: 'document-1',
        revision: 45,
        selectorHasUnsavedChanges: true,
        selectorRevisionMatches: false,
      },
    })),
    /verified document context/u,
  );
});

function createContext(verifiedContext: Record<string, unknown>): ToolExecutionContext {
  return {
    conversationId: 'conversation-test',
    productId: 'image-production',
    toolCallId: 'tool-test',
    userId: 'user-test',
    verifiedContext,
  };
}
