import assert from 'node:assert/strict';
import test from 'node:test';
import { createChatRuntime } from '@prodactionpro/chat-runtime-core';
import type { ChatTransport } from '@prodactionpro/chat-sdk';
import { clearWorkspaceAiAccess, reportWorkspaceAiAccessError } from '@/modules/chat-assistant/adapters/client/workspace-ai-access-store';
import { checkAiAccessBeforeSubmit } from './ai-access-gate';

test('known access refusals never create a turn, optimistic bubble or clear a draft', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0, turns = 0, invitations = 0;
  globalThis.fetch = (async () => { requests++; throw new Error('No network expected'); }) as typeof fetch;
  try {
    for (const code of ['CHAT_WORKSPACE_PROVIDER_REQUIRED', 'CHAT_WORKSPACE_BUDGET_REQUIRED', 'CHAT_MEMBER_BUDGET_EXHAUSTED', 'CHAT_MEMBER_AI_DISABLED']) {
      const runtime = createChatRuntime({ transport: { streamTurn: async () => { turns++; throw Error(); } } as unknown as ChatTransport, welcomeMessage: false });
      runtime.setInputValue('Сохраните мой замысел');
      reportWorkspaceAiAccessError('empty-workspace', { code });
      for (let click = 0; click < 2; click++) {
        if (await checkAiAccessBeforeSubmit('empty-workspace', () => invitations++)) await runtime.submit();
      }
      assert.equal(runtime.getSnapshot().inputValue, 'Сохраните мой замысел');
      assert.equal(runtime.getSnapshot().messages.length, 0);
      runtime.dispose();
    }
    assert.equal(requests, 0); assert.equal(turns, 0); assert.equal(invitations, 8);
  } finally { globalThis.fetch = originalFetch; clearWorkspaceAiAccess(); }
});

test('unknown connection failure asks to recheck without claiming that balance is zero', async () => {
  const originalFetch = globalThis.fetch;
  let invitation = 'not-called';
  globalThis.fetch = (async () => { throw Error('offline'); }) as typeof fetch;
  try {
    assert.equal(await checkAiAccessBeforeSubmit('unknown-workspace', (access) => { invitation = access?.status ?? 'unknown'; }), false);
    assert.equal(invitation, 'unknown');
  } finally { globalThis.fetch = originalFetch; clearWorkspaceAiAccess(); }
});
