import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_AUDIO_BYTES } from '@/shared/media/audio-contracts';
import { MAX_VIDEO_BYTES } from '@/shared/media/video-contracts';
import { validatePlaygroundFiles } from './pipeline-playground-media';

const image = { name: 'reference.png', type: 'image/png', size: 1024 };
test('media drop validates the full batch before uploading anything', () => {
  assert.equal(validatePlaygroundFiles('image', [image]), null);
  assert.equal(validatePlaygroundFiles('image_collection', [image, image]), null);
  assert.ok(validatePlaygroundFiles('image', [image, image]));
  assert.ok(validatePlaygroundFiles('image_collection', [image, { name: 'movie.mp4', type: 'video/mp4', size: 1024 }]));
  assert.ok(validatePlaygroundFiles('text', [image]));
  assert.ok(validatePlaygroundFiles('video', [image]));
  assert.ok(validatePlaygroundFiles('image', [{ ...image, type: 'video/mp4' }]));
  assert.ok(validatePlaygroundFiles('image', [{ ...image, size: 0 }]));
});
test('HEIC without browser MIME remains eligible for server conversion', () => {
  assert.equal(validatePlaygroundFiles('image', [{ name: 'IMG_1.HEIC', type: '', size: 1024 }]), null);
  assert.equal(validatePlaygroundFiles('image', [{ name: 'IMG_1.heif', type: 'application/octet-stream', size: 1024 }]), null);
});
test('audio and video enforce the shared upload byte limits', () => {
  for (const [kind, name, type, limit] of [['audio', 'voice.m4a', 'audio/mp4', MAX_AUDIO_BYTES], ['video', 'scene.mov', 'video/quicktime', MAX_VIDEO_BYTES]] as const) {
    assert.equal(validatePlaygroundFiles(kind, [{ name, type, size: limit }]), null);
    assert.ok(validatePlaygroundFiles(kind, [{ name, type, size: limit + 1 }]));
  }
});
