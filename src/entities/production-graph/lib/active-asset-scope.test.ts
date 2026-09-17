import assert from 'node:assert/strict';
import test from 'node:test';
import { activateAssetScope, getActiveAssetScope, getActiveAssetScopeSnapshot, subscribeActiveAssetScope } from './remote-asset.ts';

test('asset scope readiness is observable and stale cleanup cannot clear the next document scope', () => {
  const snapshots: unknown[] = [];
  const unsubscribe = subscribeActiveAssetScope(() => snapshots.push(getActiveAssetScopeSnapshot()));
  const first = activateAssetScope({ workspaceId: 'workspace', documentId: 'first' });
  const stable = getActiveAssetScopeSnapshot();
  assert.equal(getActiveAssetScopeSnapshot(), stable);
  const second = activateAssetScope({ workspaceId: 'workspace', documentId: 'second' });
  first();
  assert.equal(getActiveAssetScope()?.documentId, 'second');
  assert.equal(snapshots.length, 2);
  second();
  assert.equal(getActiveAssetScope(), undefined);
  assert.equal(snapshots.length, 3);
  unsubscribe();
});
