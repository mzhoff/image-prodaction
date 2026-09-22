import assert from 'node:assert/strict';
import test from 'node:test';
import { sectionGuideForRoute, sectionGuideStorageKey } from './section-guide';

test('resolves collection, creation and document routes to their own guide', () => {
  const cases = [
    ['/usage', null, null, 'usage'], ['/', null, null, 'home'], ['/create', 'storyboard', null, 'stories'],
    ['/', 'storyboard', null, 'stories'], ['/create', 'flow', null, 'canvas'], ['/create', 'timeline', null, 'timeline'],
    ['/stories/timelines/document-1', null, null, 'timeline'], ['/stories', null, 'timeline', 'timeline'],
    ['/stories/document-1', null, null, 'stories'], ['/library/subjects', null, null, 'library'],
    ['/folders/project-1', null, null, 'projects'], ['/chats/chat-1', null, null, 'chats'],
    ['/projects/flow-1', null, null, 'canvas'], ['/settings/providers', null, null, 'settings'],
    ['/flows', null, null, 'flows'], ['/pipelines', null, null, 'flows'], ['/playground', null, null, 'playground'],
    ['/unknown', null, null, null],
  ] as const;
  for (const [path, mode, view, expected] of cases) assert.equal(sectionGuideForRoute(path, mode, view), expected, path);
});

test('first-visit state cannot leak between accounts, sections or guide revisions', () => {
  const first = sectionGuideStorageKey('alice', 'usage', 1);
  assert.notEqual(first, sectionGuideStorageKey('bob', 'usage', 1));
  assert.notEqual(first, sectionGuideStorageKey('alice', 'home', 1));
  assert.notEqual(first, sectionGuideStorageKey('alice', 'usage', 2));
  assert.notEqual(sectionGuideStorageKey('a:b', 'usage'), sectionGuideStorageKey('a%3Ab', 'usage'));
  assert.notEqual(sectionGuideStorageKey('alice', 'flows'), sectionGuideStorageKey('alice', 'playground'));
  assert.notEqual(sectionGuideStorageKey('alice', 'flows'), sectionGuideStorageKey('alice', 'canvas'));
});
