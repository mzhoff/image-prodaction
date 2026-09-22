import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceSwitchDestination } from './workspace-switch-destination';

test('workspace switching discards the old workspace document identifiers', () => {
  for (const [source, target] of [
    ['/stories/story-id', '/stories'], ['/stories/timelines/timeline-id', '/stories'],
    ['/folders/folder-id', '/folders'], ['/chats/chat-id', '/chats'],
    ['/projects/flow-id', '/flows'], ['/editor/flow-id', '/flows'],
    ['/library/asset-id', '/library'],
  ]) assert.equal(workspaceSwitchDestination(source), target);
});

test('workspace switching keeps the current collection and falls back to Flows', () => {
  for (const route of ['/', '/stories', '/folders', '/chats', '/library', '/usage', '/flows']) {
    assert.equal(workspaceSwitchDestination(route), route);
  }
  assert.equal(workspaceSwitchDestination(null), '/');
  assert.equal(workspaceSwitchDestination('/stories-other'), '/flows');
  assert.equal(workspaceSwitchDestination('/settings/providers'), '/flows');
});
