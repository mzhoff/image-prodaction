import assert from 'node:assert/strict';
import test from 'node:test';
import { homeImageSettingsRequestSchema } from '../contracts/home-image-settings';
import { createHomeImageSettings } from './home-image-settings-service';

type Dependencies = NonNullable<Parameters<typeof createHomeImageSettings>[2]>;
const principal = { userId: 'user', tenantId: 'workspace', productId: 'image-production' };
const subjectId = '01900000-0000-7000-8000-000000000011';
const request = { conversationId: 'home:test', model: 'edit-model', aspectRatio: '1:1', size: '1K', subjectIds: [] };

function fixture(minReferences = 1) {
  const saved: Array<Parameters<Dependencies['save']>[0]> = [];
  const checkedCounts: number[] = [];
  const dependencies: Dependencies = {
    async requireConversation(actor, id) { assert.deepEqual(actor, principal); assert.equal(id, request.conversationId); },
    async subjects(_principal, ids) { return ids.map((id) => ({ id, name: 'Alice', revision: 1, passportText: 'Alice',
      reference: { assetId: 'primary', checksumSha256: 'checksum', contentType: 'image/png' } })); },
    async resolveModel(_model, _settings, referenceCount) {
      checkedCounts.push(referenceCount);
      if (referenceCount < minReferences) throw new Error('This model requires a reference image.');
      return {} as never;
    },
    async save(record) { saved.push(record); },
    createId: () => '01900000-0000-7000-8000-000000000013',
  };
  return { dependencies, saved, checkedCounts };
}

test('Settings preflight permits an edit model with an uploaded reference and no hero', async () => {
  const f = fixture();
  const response = await createHomeImageSettings(principal, { ...request, uploadedReferenceCount: 1 }, f.dependencies);
  assert.deepEqual(f.checkedCounts, [1]);
  assert.equal(response.referenceCount, 1);
  assert.equal(f.saved.length, 1);
  assert.deepEqual(f.saved[0].settings, { model: request.model, aspectRatio: '1:1', size: '1K', subjectIds: [] });
  assert.equal('uploadedReferenceCount' in response.settings, false);
  await assert.rejects(() => createHomeImageSettings(principal, request, f.dependencies), /requires a reference/);
  assert.equal(f.saved.length, 1);
});

test('Settings preflight combines primary hero photos and uploaded references without exceeding the shared limit', async () => {
  const f = fixture(2);
  const response = await createHomeImageSettings(principal, { ...request, subjectIds: [subjectId], uploadedReferenceCount: 1 }, f.dependencies);
  assert.deepEqual(f.checkedCounts, [2]);
  assert.equal(response.referenceCount, 2);
  assert.equal(response.subjects[0].referenceCount, 1);
  const otherSubject = '01900000-0000-7000-8000-000000000012';
  await assert.rejects(() => createHomeImageSettings(principal, {
    ...request, subjectIds: [subjectId, otherSubject], uploadedReferenceCount: 3,
  }, f.dependencies), /четырёх/);
  assert.equal(f.saved.length, 1);
});

test('Uploaded reference hint is a bounded integer and omitted hints keep the old request contract', () => {
  for (const value of [-1, 4, 0.5, '1', null]) {
    assert.equal(homeImageSettingsRequestSchema.safeParse({ ...request, uploadedReferenceCount: value }).success, false);
  }
  assert.equal(homeImageSettingsRequestSchema.parse(request).uploadedReferenceCount, 0);
  for (const value of [0, 1, 2, 3]) {
    assert.equal(homeImageSettingsRequestSchema.parse({ ...request, uploadedReferenceCount: value }).uploadedReferenceCount, value);
  }
});

test('Explicit submit authorization is pinned in settings; legacy snapshots do not gain it implicitly', async () => {
  const f = fixture(0);
  await createHomeImageSettings(principal, { ...request, submitAuthorized: true }, f.dependencies);
  await createHomeImageSettings(principal, request, f.dependencies);
  assert.equal(f.saved[0].settings.submitAuthorized, true);
  assert.equal(f.saved[1].settings.submitAuthorized, undefined);
  for (const invalid of [false, 'true', 1]) {
    assert.equal(homeImageSettingsRequestSchema.safeParse({ ...request, submitAuthorized: invalid }).success, false);
  }
});
