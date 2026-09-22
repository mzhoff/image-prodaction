import assert from 'node:assert/strict';
import test from 'node:test';
import { projectFileItems, projectTab } from './project-container-items';
import type { ProjectSummary } from '@/entities/workspace/model/types';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { ProjectMedia } from '@/modules/project-containers/contracts/project-contents';

const flow = (patch: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: 'flow', workspaceId: 'workspace', folderId: 'folder', name: 'Презентация', thumbnailUrl: '',
  thumbnailMode: 'auto', hasEverHadContent: true, favorite: false, status: 'active',
  createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z', ...patch,
});
const story: StorySummary = { id: 'story', workspaceId: 'workspace', folderId: 'folder', name: 'История',
  revision: 1, createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-21T10:00:00Z' };
const media: ProjectMedia = { id: 'image', workspaceId: 'workspace', name: 'Референс', kind: 'image',
  createdAt: '2026-09-21T11:00:00Z', contentUrl: '/content' };
const timeline = { ...story, id: 'timeline', storyboardId: null };
const input = { workspaceId: 'workspace', folderId: 'folder', flows: [flow()], stories: [story], timelines: [timeline], media: [media], search: '' };

test('all view contains one story document and preserves original flow editor URLs', () => {
  const result = projectFileItems({ ...input, tab: 'all' });
  assert.deepEqual(result.map((item) => item.id), ['image', 'story', 'timeline', 'flow']);
  assert.equal(result.find((item) => item.kind === 'flow')?.href, '/projects/flow');
  assert.equal(result.filter((item) => item.kind === 'story').length, 1);
});

test('timeline is its own file with an independent entry point', () => {
  assert.deepEqual(projectFileItems({ ...input, tab: 'timeline' }).map((item) => [item.id, item.href]), [
    ['timeline', '/stories/timelines/timeline'],
  ]);
});

test('folder and workspace boundary hide foreign, moved, and trashed files', () => {
  const result = projectFileItems({ ...input, tab: 'all',
    flows: [flow(), flow({ id: 'foreign', workspaceId: 'other' }), flow({ id: 'moved', folderId: 'other' }), flow({ id: 'trash', status: 'trash' })],
    stories: [story, { ...story, id: 'other-story', folderId: 'other' }],
    media: [media, { ...media, id: 'other-image', workspaceId: 'other' }],
  });
  assert.deepEqual(result.map((item) => item.id), ['image', 'story', 'timeline', 'flow']);
});

test('search is shared across file kinds and unknown tabs fall back to all', () => {
  assert.deepEqual(projectFileItems({ ...input, tab: 'all', search: '  ПРЕЗ  ' }).map((item) => item.id), ['flow']);
  assert.equal(projectTab('unsupported'), 'all');
  assert.equal(projectTab('media'), 'media');
});
