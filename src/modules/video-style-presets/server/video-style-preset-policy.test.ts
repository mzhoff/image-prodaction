import assert from 'node:assert/strict';
import test from 'node:test';
import { saveVideoStylePresetSchema } from '../contracts/video-style-preset';
import { DEFAULT_VIDEO_STYLE } from '@/shared/media/home-video-direction';
import { assertVideoStyleCover, VideoStylePresetError } from './video-style-preset-policy';

test('a style cover must be a ready library image in the same workspace', () => {
  const valid = { workspaceId: 'workspace-a', status: 'ready', mediaKind: 'image', libraryVisible: true };
  assert.doesNotThrow(() => assertVideoStyleCover('workspace-a', valid));
  for (const cover of [undefined, { ...valid, workspaceId: 'workspace-b' }, { ...valid, status: 'deleted' },
    { ...valid, status: 'pending' }, { ...valid, mediaKind: 'video' }, { ...valid, libraryVisible: false }]) {
    assert.throws(() => assertVideoStyleCover('workspace-a', cover), VideoStylePresetError);
  }
});

test('saved styles reject URLs, unknown settings and oversized freeform descriptions', () => {
  const valid = { name: '  Warm film  ', style: DEFAULT_VIDEO_STYLE, coverAssetId: null, expectedRevision: 0 };
  assert.equal(saveVideoStylePresetSchema.parse(valid).name, 'Warm film');
  assert.equal(saveVideoStylePresetSchema.safeParse({ ...valid, coverAssetId: 'https://external.example/image.png' }).success, false);
  assert.equal(saveVideoStylePresetSchema.safeParse({ ...valid, style: { ...valid.style, camera: 'new' } }).success, false);
  assert.equal(saveVideoStylePresetSchema.safeParse({ ...valid, style: { ...valid.style, prompt: 'a'.repeat(2001) } }).success, false);
  assert.equal(saveVideoStylePresetSchema.safeParse({ ...valid, name: ' ' }).success, false);
});
