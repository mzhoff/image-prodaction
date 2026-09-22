import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatAttachmentUploadItem } from '@prodactionpro/chat-runtime-core';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';
import { resolveHomeVideoIntentMode } from '@/shared/media/home-video-intent';
import { availableVideoSlots, moveVideoBinding, readyVideoSlots, reconcileVideoBindings, type VideoSlotBindings } from './home-video-materials';

const model: VideoModelCapabilities = {
  key: 'test', label: '', description: '', route: { gateway: 'openrouter', modelId: 'test' },
  durations: [4], resolutions: ['720p'], aspectRatios: ['16:9'], firstFrame: true, lastFrame: true, references: true, audio: false, seed: false,
};
const binding = (itemId: string) => ({ itemId, description: `note-${itemId}` });
const ready = (id: string): ChatAttachmentUploadItem => ({ id, status: 'ready', progress: 1,
  file: new File(['image'], `${id}.png`, { type: 'image/png' }), ref: { attachmentId: `remote-${id}`, kind: 'image', name: id } });

test('targeting the last frame never silently assigns it as the first or a reference', () => {
  const state = reconcileVideoBindings({}, [ready('a')], model, { slot: 'lastFrame', before: new Set() });
  assert.deepEqual(state, { lastFrame: { itemId: 'a', description: '' } });
  assert.throws(() => resolveHomeVideoIntentMode(readyVideoSlots(state, [ready('a')])), /первый кадр/);
});
test('generic files follow the active family; targets preserve explicit roles and sparse references', () => {
  const state = reconcileVideoBindings({ firstFrame: binding('a') }, [ready('a'), ready('b')], model);
  assert.equal(state.lastFrame?.itemId, 'b');
  const targeted = reconcileVideoBindings({}, [ready('c')], model, { slot: 'reference3', before: new Set() });
  assert.deepEqual(Object.keys(readyVideoSlots(targeted, [ready('c')])), ['reference3']);
  assert.equal(reconcileVideoBindings({}, [ready('a')], model).reference1?.itemId, 'a');
});
test('removing first frame does not promote last; model changes preserve unsupported material and notes', () => {
  const old = { firstFrame: binding('a'), lastFrame: binding('b') };
  const withoutFirst = reconcileVideoBindings(old, [ready('b')], model);
  assert.deepEqual(withoutFirst, { lastFrame: binding('b') });
  const textModel = { ...model, firstFrame: false, lastFrame: false, references: false };
  assert.deepEqual(availableVideoSlots(textModel), []);
  assert.equal(reconcileVideoBindings(withoutFirst, [ready('b')], textModel), withoutFirst);
});
test('moving onto an occupied slot swaps images together with their notes', () => {
  const old = { firstFrame: binding('a'), lastFrame: binding('b') };
  const moved = moveVideoBinding(old, 'firstFrame', 'lastFrame');
  assert.deepEqual(moved, { firstFrame: binding('b'), lastFrame: binding('a') });
  assert.deepEqual(old.firstFrame, binding('a'));
  assert.deepEqual(moveVideoBinding({ firstFrame: binding('a') }, 'firstFrame', 'reference2'), { reference2: binding('a') });
});
test('queued uploads stay in their slot while only ready remote ids enter a request', () => {
  const slots: VideoSlotBindings = { firstFrame: binding('a'), lastFrame: binding('b') };
  const items = [ready('a'), { ...ready('b'), status: 'uploading' as const }];
  assert.equal(reconcileVideoBindings(slots, items, model), slots);
  assert.deepEqual(readyVideoSlots(slots, items), { firstFrame: { attachmentId: 'remote-a', description: 'note-a' } });
  assert.deepEqual(reconcileVideoBindings(slots, [], model), {});
});
test('an explicit reference alongside frames remains a conflict instead of dropping an image', () => {
  const items = [ready('a'), ready('b')];
  const slots = reconcileVideoBindings({ firstFrame: binding('a') }, items, model, { slot: 'reference1', before: new Set(['a']) });
  assert.throws(() => resolveHomeVideoIntentMode(readyVideoSlots(slots, items)), /нельзя смешивать/);
});
