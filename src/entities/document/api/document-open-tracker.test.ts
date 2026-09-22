import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocumentOpenTracker } from './document-open-tracker';

test('opening is reported only after hydration, never on selection, refetch or stale completion', () => {
  const payloads: unknown[][] = [];
  const tracker = createDocumentOpenTracker((...args) => { payloads.push(args); });
  assert.equal(tracker.select('private-document-a'), true);
  assert.deepEqual(payloads, []);
  tracker.loaded('private-document-a');
  tracker.loaded('private-document-a');
  assert.equal(tracker.select('private-document-a'), false);
  tracker.loaded('private-document-a');
  assert.deepEqual(payloads, [[]]);
  tracker.select('private-document-b');
  tracker.loaded('private-document-a');
  assert.deepEqual(payloads, [[]]);
  tracker.loaded('private-document-b');
  assert.deepEqual(payloads, [[], []], 'document identities must never enter the callback');
});

test('returning to a document is a new opening, including after an inaccessible selection', () => {
  let calls = 0;
  const tracker = createDocumentOpenTracker(() => { calls++; });
  tracker.select('a'); tracker.loaded('a');
  tracker.select('forbidden'); // The failed server load never calls loaded.
  tracker.select('a'); tracker.loaded('a');
  assert.equal(calls, 2);
  tracker.select(undefined);
  tracker.select('a'); tracker.loaded('a');
  assert.equal(calls, 3);
});
