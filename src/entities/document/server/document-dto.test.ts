import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentHubStarterPreset } from '@/entities/production-graph/model/content-hub-starter-preset';
import { toDocumentDto } from './document-dto';

const row: Parameters<typeof toDocumentDto>[0] = {
  id: '524e8cb9-39a5-5e3b-ac91-5bf3a6ff9089', name: 'Preset', workspaceId: 'workspace',
  createdAt: new Date(), updatedAt: new Date(), revision: 1, schemaVersion: 1,
  favorite: false, hasEverHadContent: true, folderId: null, librarySaved: false, status: 'active',
  thumbnailAssetId: null, thumbnailMode: 'auto', thumbnailUpdatedAt: null,
  snapshot: getContentHubStarterPreset()[0].snapshot,
};

test('existing and newly provisioned graphs immediately advertise a generated thumbnail', () => {
  const dto = toDocumentDto(row);
  assert.equal(dto.thumbnailAvailable, true);
  assert.match(dto.thumbnailUrl, /^\/api\/projects\/.+\/thumbnail\?revision=1&renderer=1$/);
  assert.notEqual(toDocumentDto({ ...row, revision: 2 }).thumbnailUrl, dto.thumbnailUrl);
});

test('manual and editor-generated thumbnails keep priority over the graph fallback', () => {
  for (const thumbnailMode of ['auto', 'manual'] as const) {
    const dto = toDocumentDto({ ...row, thumbnailMode, thumbnailAssetId: 'existing-asset' });
    assert.equal(dto.thumbnailUrl, '/api/assets/existing-asset/content?variant=thumbnail');
    assert.equal(dto.thumbnailMode, thumbnailMode);
  }
});

test('untouched and empty saved documents do not advertise broken thumbnails', () => {
  assert.equal(toDocumentDto({ ...row, snapshot: null }).thumbnailAvailable, false);
  const snapshot = getContentHubStarterPreset()[0].snapshot;
  snapshot.project.nodes = [];
  snapshot.project.edges = [];
  snapshot.project.sections = [];
  assert.equal(toDocumentDto({ ...row, snapshot }).thumbnailUrl, '');
});
