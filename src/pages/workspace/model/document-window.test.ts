import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocumentWindow, workspaceReturnHref } from './document-window';

const focused = (path: string) => { const url = new URL(path, 'https://workspace.local'); return isDocumentWindow(url.pathname, url.searchParams); };
test('document sessions focus the editor while catalogs and creation presets retain navigation', () => {
  for (const path of ['/create?type=storyboard', '/create?type=timeline&preset=empty', '/create?type=timeline&preset=promo', '/create?type=timeline&document=abc', '/stories/timelines/abc', '/create?type=storyboard&document=abc', '/stories/abc?view=blueprint', '/chats/abc', '/create?type=image', '/create?type=video', '/create?type=text', '/create?type=flow', '/?create=image']) assert.equal(focused(path), true, path);
  for (const path of ['/', '/create?type=timeline', '/stories?view=timeline', '/chats', '/flows', '/playground', '/playground?endpoint=test', '/folders/abc', '/library']) assert.equal(focused(path), false, path);
});
test('return link retains the source screen and its filters, with a safe Home fallback', () => {
  for (const path of ['/create?type=timeline&folderId=abc', '/stories?view=timeline', '/folders/abc?view=list', '/library?q=music']) assert.equal(workspaceReturnHref(path), path);
  for (const path of [null, '', 'javascript:alert(1)', '//example.com', '/\\example.com', '/login', '/stories/timelines/abc', '/create?type=timeline&document=abc', '/create?type=image']) assert.equal(workspaceReturnHref(path), '/');
});
