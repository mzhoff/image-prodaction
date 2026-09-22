import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeVideoDirectionSubjectImages, resolveVideoDirectionStyle, videoDirectionSchema, videoStyleSettingsSchema } from './home-video-direction';
import { compileHomeVideoPrompt, homeVideoIntentSchema } from './home-video-intent';
import { videoRequestSchema } from './video-generation-contracts';

const request = videoRequestSchema.parse({ model: 'model', mode: 'text', prompt: 'A traveller arrives',
  duration: 4, resolution: '720p', aspectRatio: '16:9' });
const photo = { id: 'hero', name: 'Hero', referenceAssetId: '01900000-0000-7000-8000-000000000005' };

test('style inheritance is per property and explicit auto/empty values reset inherited choices', () => {
  const direction = videoDirectionSchema.parse({ story: { style: { look: 'film70s', grain: 'fine', prompt: 'pastel illustration' } },
    scene: { styleOverride: { grain: 'none' } }, shot: { styleOverride: { look: 'modern', prompt: '' } } });
  assert.deepEqual(resolveVideoDirectionStyle(direction), { look: 'modern', grain: 'none', prompt: '' });
  direction.shot.styleOverride = { look: 'auto' };
  assert.deepEqual(resolveVideoDirectionStyle(direction), { look: 'auto', grain: 'none', prompt: 'pastel illustration' });
});

test('Story→Scene→Shot instructions use one effective style and exclude conflicting legacy camera choices', () => {
  const intent = homeVideoIntentSchema.parse({ camera: { look: 'vhs80s', optics: 'fisheye', movement: 'orbit' },
    direction: { story: { description: 'A road trip', style: { look: 'film70s', grain: 'fine' } },
      scene: { location: 'Coastal road', timeOfDay: 'dawn', lighting: 'soft', temperature: 'warm', lightSources: 'Sun through clouds', styleOverride: { look: 'modern' } },
      shot: { description: 'Follow the traveller', framing: 'medium', angle: 'low', focus: 'shallow', optics: 'normal', movement: 'tracking', speed: 'slow', styleOverride: { grain: 'none' } } } });
  const prompt = compileHomeVideoPrompt(request.prompt, intent);
  for (const included of ['A road trip', 'Coastal road', 'dawn', 'soft, diffused', 'warm visual', 'Sun through clouds', 'Follow the traveller', 'medium shot', 'low-angle', 'shallow depth', 'Track the moving subject', 'contemporary']) {
    assert.ok(prompt.includes(included), included);
  }
  for (const absent of ['VHS', 'fisheye', 'Orbit around', '1970s', 'fine, restrained film-grain']) assert.ok(!prompt.includes(absent), absent);
  assert.equal(prompt, compileHomeVideoPrompt(request.prompt, intent));
});

test('legacy camera compilation stays available, while an all-auto direction adds no invented choices', () => {
  assert.match(compileHomeVideoPrompt('Hello', homeVideoIntentSchema.parse({ camera: { optics: 'fisheye' } })), /fisheye/);
  assert.equal(compileHomeVideoPrompt('Hello', homeVideoIntentSchema.parse({ camera: { optics: 'fisheye' }, direction: {} })), 'Hello');
});

test('direction accepts only known enums, bounded text and selected subject IDs rather than external URLs', () => {
  assert.equal(videoDirectionSchema.safeParse({ shot: { framing: 'secret-instruction' } }).success, false);
  assert.equal(videoDirectionSchema.safeParse({ scene: { location: 'a'.repeat(2001) } }).success, false);
  assert.equal(videoDirectionSchema.safeParse({ story: { subjectIds: ['https://example.com/avatar.jpg'] } }).success, false);
  assert.equal(videoDirectionSchema.safeParse({ story: { subjectIds: [photo.referenceAssetId, photo.referenceAssetId] } }).success, false);
  assert.equal(videoStyleSettingsSchema.safeParse({ look: 'modern', grain: 'none', prompt: '', imageUrl: 'https://example.com' }).success, false);
});

test('character photos fill unused reference slots and textual heroes do not change image mode', () => {
  const withReference = { ...request, mode: 'references' as const, references: [{ assetId: 'existing', description: 'Landscape', slot: 3 }] };
  const merged = mergeVideoDirectionSubjectImages(withReference, [photo]);
  assert.deepEqual(merged.references.map((ref) => ref.slot), [1, 3]);
  assert.equal(merged.references[0].assetId, photo.referenceAssetId);
  assert.equal(mergeVideoDirectionSubjectImages(request, [photo]).mode, 'references');
  assert.deepEqual(mergeVideoDirectionSubjectImages(request, [{ id: 'text-hero', name: 'Only text' }]), request);
});

test('selected portraits never bypass the combined image bound or silently replace animation frames', () => {
  const frames = { ...request, mode: 'frames' as const, firstFrame: { assetId: 'first', description: '' } };
  assert.throws(() => mergeVideoDirectionSubjectImages(frames, [photo]), /нельзя совместить/);
  const full = { ...request, mode: 'references' as const, references: [1, 2, 3].map((slot) => ({ assetId: `${slot}`, description: '', slot })) };
  assert.throws(() => mergeVideoDirectionSubjectImages(full, [photo]), /не больше трёх/);
});
