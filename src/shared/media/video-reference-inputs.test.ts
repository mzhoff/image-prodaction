import assert from 'node:assert/strict';
import test from 'node:test';
import { expandVideoReferenceInputs } from './video-reference-inputs';

test('a gallery expands into consecutive stable slots and keeps per-slot descriptions', () => {
  assert.deepEqual(expandVideoReferenceInputs([{ slot: 1, assetIds: ['first', 'second'] }, { slot: 3, assetIds: ['third'] }], ['one', 'two', 'three']), [
    { slot: 1, assetId: 'first', description: 'one' }, { slot: 2, assetId: 'second', description: 'two' }, { slot: 3, assetId: 'third', description: 'three' },
  ]);
  assert.deepEqual(expandVideoReferenceInputs([{ slot: 2, assetIds: ['second', 'third'] }]).map((ref) => ref.slot), [2, 3]);
});

test('reference overflow, slot collisions and pending empty galleries fail without dropping images', () => {
  assert.throws(() => expandVideoReferenceInputs([{ slot: 1, assetIds: ['a', 'b', 'c', 'd'] }]), /не больше 3/);
  assert.throws(() => expandVideoReferenceInputs([{ slot: 3, assetIds: ['a', 'b'] }]), /не больше 3/);
  assert.throws(() => expandVideoReferenceInputs([{ slot: 1, assetIds: ['a', 'b'] }, { slot: 2, assetIds: ['c'] }]), /пересекающиеся/);
  assert.throws(() => expandVideoReferenceInputs([{ slot: 1, assetIds: [] }]), /ещё не готовы/);
});
