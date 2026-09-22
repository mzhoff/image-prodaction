import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioFolder } from '@/entities/workspace/model/studio-folder';
import type { ProjectSummary } from '@/entities/workspace/model/types';
import type { StorySummary } from '@/modules/story-projects/contracts/story-project';
import type { TimelineSummary } from '@/modules/story-projects/contracts/story-timeline';
import type { LibraryAssetItem } from '@/pages/library/model/types';
import { workspaceSearchItems, type WorkspaceSearchInput } from './workspace-search';

const date = '2026-09-21T12:00:00Z';
const folder: StudioFolder = { id: 'folder', workspaceId: 'own', name: 'Кампания Осень', systemKey: null, createdAt: date, updatedAt: date };
const flow: ProjectSummary = { id: 'flow', workspaceId: 'own', folderId: 'folder', name: 'Обложка', status: 'active',
  createdAt: date, updatedAt: date, favorite: false, hasEverHadContent: true, thumbnailMode: 'auto', thumbnailUrl: '/flow-preview', thumbnailAvailable: true };
const story: StorySummary = { id: 'story', workspaceId: 'own', folderId: 'folder', name: 'Сюжет', createdAt: date, updatedAt: date, revision: 1 };
const timeline: TimelineSummary = { ...story, id: 'timeline', name: 'Монтаж', storyboardId: 'story' };
const media: LibraryAssetItem = { id: 'media', workspaceId: 'own', document: { id: 'flow', name: 'Обложка', status: 'active' },
  originalName: 'Фото.png', contentType: 'image/png', mediaKind: 'image', origin: 'generated', provider: 'OpenRouter', modelId: 'nano-banana',
  operation: 'generate_image', width: 1024, height: 1024, createdAt: date, contentUrl: '/media/content', thumbnailUrl: '/media/thumb' };
const input: WorkspaceSearchInput = { workspaceId: 'own', projects: [flow], folders: [folder], stories: [story], timelines: [timeline], media: [media], scope: 'all', query: '' };

test('search never exposes entries from a different workspace or absent workspace', () => {
  const result = workspaceSearchItems({ ...input,
    projects: [flow, { ...flow, id: 'foreign', workspaceId: 'other' }],
    folders: [folder, { ...folder, id: 'foreign', workspaceId: 'other' }],
    stories: [story, { ...story, id: 'foreign', workspaceId: 'other' }],
    timelines: [timeline, { ...timeline, id: 'foreign', workspaceId: 'other' }],
    media: [media, { ...media, id: 'foreign', workspaceId: 'other' }],
  });
  assert.equal(result.length, 5);
  assert.equal(result.some((item) => item.id.includes('foreign')), false);
  assert.deepEqual(workspaceSearchItems({ ...input, workspaceId: undefined }), []);
});

test('trashed flows and media attached to trashed documents stay out of search', () => {
  const result = workspaceSearchItems({ ...input, scope: 'all',
    projects: [flow, { ...flow, id: 'trash', status: 'trash' }],
    media: [media, { ...media, id: 'trash-media', document: { id: 'trash', name: 'Удалено', status: 'trash' } }],
  });
  assert.equal(result.length, 5);
  assert.equal(result.some((item) => item.id.includes('trash')), false);
});

test('name and containing project search trims spaces and ignores case', () => {
  assert.deepEqual(workspaceSearchItems({ ...input, scope: 'flows', query: ' ОБЛОЖ ' }).map((item) => item.id), ['flows:flow']);
  assert.deepEqual(workspaceSearchItems({ ...input, query: ' ОСЕНЬ ' }).map((item) => item.kind), ['flows', 'projects', 'storyboard', 'timeline']);
  assert.deepEqual(workspaceSearchItems({ ...input, query: 'Нет совпадений' }), []);
});

test('each scope returns only its category and preserves product routes', () => {
  const routes = { flows: '/projects/flow', projects: '/folders/folder', media: '/library?assetId=media',
    storyboard: '/stories/story?view=blueprint', timeline: '/stories/timelines/timeline' } as const;
  for (const [scope, href] of Object.entries(routes)) {
    const result = workspaceSearchItems({ ...input, scope: scope as keyof typeof routes });
    assert.equal(result.length, 1);
    assert.equal(result[0]!.kind, scope);
    assert.equal(result[0]!.href, href);
  }
});

test('server media matches on model, provider and operation remain visible with preview metadata', () => {
  for (const query of ['NANO', 'openrouter', 'generate_image']) {
    const result = workspaceSearchItems({ ...input, scope: 'media', query });
    assert.equal(result[0]?.id, 'media:media');
    assert.equal(result[0]?.contentUrl, '/media/content');
    assert.equal(result[0]?.previewUrl, '/media/thumb');
    assert.equal(result[0]?.mediaKind, 'image');
  }
  const video = workspaceSearchItems({ ...input, scope: 'media', media: [{ ...media, mediaKind: 'video', thumbnailUrl: null }] });
  assert.equal(video[0]?.previewUrl, undefined);
});

test('namespaced IDs avoid collisions; duplicate pages deduplicate and recent sort respects time zones', () => {
  const result = workspaceSearchItems({ ...input, projects: [{ ...flow, id: 'shared', updatedAt: '2026-09-21T15:00:00+04:00' }],
    media: [{ ...media, id: 'shared' }, { ...media, id: 'shared' }] });
  assert.equal(result.filter((item) => item.id === 'media:shared').length, 1);
  assert.equal(result.at(-1)?.id, 'flows:shared');
  assert.deepEqual(result.slice(0, 4).map((item) => item.id), ['media:shared', 'projects:folder', 'storyboard:story', 'timeline:timeline']);
});

test('foreign folder names cannot affect matches for own flows', () => {
  const result = workspaceSearchItems({ ...input, scope: 'flows', query: 'СЕКРЕТ',
    folders: [folder, { ...folder, workspaceId: 'foreign', name: 'Секрет' }] });
  assert.deepEqual(result, []);
});
