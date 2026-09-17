import assert from 'node:assert/strict';
import test from 'node:test';
import { createUuidV7, isUuid, isUuidV7 } from './id';

test('canonical workspace v4 and preset document v5 IDs coexist with native v7', () => {
  const workspace = '9d1f2f02-4ec3-4a3c-bfcc-098cd68d56f8';
  const preset = '524e8cb9-39a5-5e3b-ac91-5bf3a6ff9089';
  assert.equal(isUuid(workspace), true);
  assert.equal(isUuid(preset), true);
  assert.equal(isUuid(createUuidV7()), true);
  assert.equal(isUuidV7(workspace), false);
  assert.equal(isUuidV7(preset), false);
  for (const invalid of ['', null, '../workspace', `${workspace}/`, '00000000-0000-0000-0000-000000000000']) assert.equal(isUuid(invalid), false);
});
