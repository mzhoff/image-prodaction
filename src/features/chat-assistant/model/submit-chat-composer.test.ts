import assert from 'node:assert/strict';
import test from 'node:test';
import { submitAndClearChatComposer } from './submit-chat-composer.ts';

test('clears attachment previews immediately after runtime accepts the submission', async () => {
  const events: string[] = [];
  let resolveTurn!: () => void;
  const turn = new Promise<void>((resolve) => { resolveTurn = resolve; });

  const submitted = submitAndClearChatComposer({
    attachments: [{ attachmentId: 'att-1' }],
    clearAfterSend: async () => { events.push('clear'); },
    submit: async (attachments) => {
      events.push(`submit:${attachments[0]?.attachmentId}`);
      await turn;
      events.push('response');
    },
  });

  await new Promise<void>((resolve) => { queueMicrotask(resolve); });
  assert.deepEqual(events, ['submit:att-1', 'clear']);

  resolveTurn();
  await submitted;
  assert.deepEqual(events, ['submit:att-1', 'clear', 'response']);
});
