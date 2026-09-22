import assert from 'node:assert/strict';
import test from 'node:test';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { DEFAULT_HOME_VIDEO_SELECTION, homeVideoReferenceError, resolveHomeVideoSelection } from './home-video-selection';

const model: VideoModelCapabilities = {
  key: 'test/video', label: 'Test', description: '', route: { gateway: 'openrouter', modelId: 'test/video' },
  durations: [5, 10], resolutions: ['1080p'], aspectRatios: ['9:16'],
  firstFrame: true, lastFrame: false, references: false, audio: false, seed: false,
};

test('switching model replaces unsupported settings instead of sending stale parameters', () => {
  const result = resolveHomeVideoSelection({ ...DEFAULT_HOME_VIDEO_SELECTION, mode: 'references', generateAudio: true }, [model]);
  assert.deepEqual(result.value, { model: model.key, mode: 'text', duration: 5, resolution: '1080p', aspectRatio: '9:16', generateAudio: false });
  assert.equal(result.model, model);
});

test('supported selections survive changing modes and revisiting the composer', () => {
  const draft = { ...DEFAULT_HOME_VIDEO_SELECTION, model: model.key, mode: 'frames' as const, duration: 10, resolution: '1080p', aspectRatio: '9:16' };
  assert.deepEqual(resolveHomeVideoSelection(draft, [model]).value, draft);
  assert.equal(resolveHomeVideoSelection(draft, []).model, undefined);
});

test('references are not silently ignored and unsupported extra frames block submission', () => {
  assert.match(homeVideoReferenceError(DEFAULT_HOME_VIDEO_SELECTION, model, 1, false)!, /По кадрам/);
  const frames = { ...DEFAULT_HOME_VIDEO_SELECTION, mode: 'frames' as const };
  assert.match(homeVideoReferenceError(frames, model, 2, false)!, /один начальный кадр/);
  assert.match(homeVideoReferenceError(frames, model, 0, false)!, /первого кадра/);
  assert.equal(homeVideoReferenceError(frames, model, 1, false), undefined);
  assert.match(homeVideoReferenceError(frames, model, 1, true)!, /JPG/);
});
