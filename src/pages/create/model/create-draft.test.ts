import assert from 'node:assert/strict';
import test from 'node:test';
import { storyWriteSchema } from '@/modules/story-projects/contracts/story-project';
import { timelineWriteSchema } from '@/modules/story-projects/contracts/story-timeline';
import { creationPayload, creationUrl, newCreationDraft, submitCreation } from './create-draft';

test('choosing presets builds local drafts without a request or a document', () => {
  const draft = newCreationDraft();
  draft.story.format = 'shorts'; draft.story.aspectRatio = '9:16'; draft.story.targetDurationSeconds = 30;
  const { creationId, ...story } = creationPayload('storyboard', draft);
  assert.equal(creationId, draft.creationId);
  assert.equal(storyWriteSchema.parse(story).snapshot.settings.format, 'shorts');
  const { creationId: secondId, ...timeline } = creationPayload('timeline', { ...draft, ratio: '1:1', frameRate: 24 });
  assert.equal(secondId, creationId);
  assert.equal(timelineWriteSchema.parse(timeline).snapshot.frameRate, 24);
  assert.equal(timelineWriteSchema.parse(timeline).snapshot.aspectRatio, '1:1');
});
test('creation retries reuse the same ID and preserve the selected project', async () => {
  const original = globalThis.fetch; const requests: Record<string, unknown>[] = [];
  const draft = { ...newCreationDraft('folder'), name: 'My story', prompt: 'My idea' };
  globalThis.fetch = async (_url, init) => { requests.push(JSON.parse(String(init?.body))); return Response.json({ story: { id: draft.creationId } }); };
  try {
    await submitCreation('workspace', 'storyboard', draft); await submitCreation('workspace', 'storyboard', draft);
    assert.deepEqual(requests[0], requests[1]); assert.equal(requests[0].folderId, 'folder');
    assert.equal('prompt' in requests[0], false, 'the prompt belongs to the chat, not a fake script');
  } finally { globalThis.fetch = original; }
});
test('creation route retains a linked storyboard and project without inventing a document', () => {
  const url = new URL(creationUrl('timeline', { folderId: 'project', storyboardId: 'story' }), 'http://localhost');
  assert.equal(url.pathname, '/create'); assert.equal(url.searchParams.get('type'), 'timeline');
  assert.equal(url.searchParams.get('storyboardId'), 'story'); assert.equal(url.searchParams.has('document'), false);
});

test('a Flow opens without a prompt, keeps its folder and retries with the same identity', async (context) => {
  const draft = newCreationDraft('folder');
  const requests: unknown[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    assert.equal(url, '/api/projects');
    requests.push(JSON.parse(String(init?.body)));
    return Response.json({ project: { id: draft.creationId } });
  });
  assert.equal(await submitCreation('workspace', 'flow', draft), draft.creationId);
  await submitCreation('workspace', 'flow', draft);
  assert.deepEqual(requests, Array(2).fill({ creationId: draft.creationId, name: 'Новый Flow', folderId: 'folder', workspaceId: 'workspace' }));
});
