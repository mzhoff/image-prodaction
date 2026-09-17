import assert from 'node:assert/strict';
import test from 'node:test';
import { retainDocumentExitSave, waitForDocumentExitSave } from './document-exit-tasks';

test('reopening waits for the previous editor final save, without blocking other documents', async () => {
  let finish!: (revision: number) => void;
  retainDocumentExitSave('a', new Promise<number>((resolve) => { finish = resolve; }));
  let ready = false;
  const opening = waitForDocumentExitSave('a').then(() => { ready = true; });
  await waitForDocumentExitSave('b');
  assert.equal(ready, false);
  finish(4);
  await opening;
  assert.equal(ready, true);
});

test('a failed exit save does not prevent reopening for local recovery', async () => {
  retainDocumentExitSave('failed', Promise.reject(new Error('offline')));
  await waitForDocumentExitSave('failed');
  await waitForDocumentExitSave('failed');
});
