import assert from 'node:assert/strict';
import test from 'node:test';
import { homeImageSettingsSelector, homeImageSettingsRequestSchema, type PinnedHomeImageSettings } from '../contracts/home-image-settings';
import { applyPinnedHomeImageSettings, homeGenerationReferenceCount } from '../core/home-generation-settings';
import { snapshotHomeSubjects, loadHomeSubjectImages } from './home-subject-snapshots';
import { readHomeImageSettings } from './home-image-settings-service';

const subjectId = '01900000-0000-7000-8000-000000000011';
const assetId = '01900000-0000-7000-8000-000000000012';
const settingsId = '01900000-0000-7000-8000-000000000013';
const principal = { userId: 'user', tenantId: 'workspace', productId: 'image-production' };
const settings = { model: 'selected-model', aspectRatio: '9:16', size: '2K', subjectIds: [subjectId] };
const pinned: PinnedHomeImageSettings = { id: settingsId, settings, subjects: [{ id: subjectId, name: 'Alice', revision: 4,
  passportText: 'Alice has blue eyes.', reference: { assetId, checksumSha256: 'checksum', contentType: 'image/png' } }] };
type SubjectDependencies = NonNullable<Parameters<typeof snapshotHomeSubjects>[2]>;

function subjectFixture() {
  const image = { id: assetId, workspaceId: principal.tenantId, status: 'ready', mediaKind: 'image',
    contentType: 'image/png', checksumSha256: 'checksum', byteSize: 4 } as Awaited<ReturnType<SubjectDependencies['asset']>>;
  const profile = { id: subjectId, workspaceId: principal.tenantId, name: 'Alice', revision: 4,
    passportText: 'Alice has blue eyes.', imageAssetIds: [assetId, 'secondary-image'] } as Awaited<ReturnType<SubjectDependencies['profile']>>;
  const reads: string[] = [];
  const dependencies: SubjectDependencies = {
    async profile(userId, workspaceId) { assert.equal(userId, principal.userId); assert.equal(workspaceId, principal.tenantId); return profile; },
    async asset(_user, id) { reads.push(id); return image; },
    async content(_user, id) { reads.push(id); return { asset: image, contentType: 'image/png', byteSize: 4,
      object: { body: new Response(new Uint8Array([1, 2, 3, 4])).body } } as unknown as Awaited<ReturnType<SubjectDependencies['content']>>; },
  };
  return { profile, image, dependencies, reads };
}

test('Pinned UI model, ratio, size and all message refs override LLM arguments', () => {
  const actual = applyPinnedHomeImageSettings({ prompt: 'A scene', model: 'llm-model', aspectRatio: '1:1', size: '4K', referenceIndexes: [] }, pinned);
  assert.equal(actual.model, settings.model); assert.equal(actual.aspectRatio, '9:16'); assert.equal(actual.size, '2K');
  assert.equal(actual.referenceIndexes, undefined); assert.deepEqual(actual.subjects, pinned.subjects);
  assert.equal(actual.settingsId, settingsId);
  assert.equal(applyPinnedHomeImageSettings({ prompt: 'Legacy prompt' }).model, 'google/gemini-2.5-flash-image');
  assert.equal(actual.submitAuthorized, undefined);
  assert.equal(applyPinnedHomeImageSettings({ prompt: 'A scene' }, {
    ...pinned, settings: { ...pinned.settings, submitAuthorized: true },
  }).submitAuthorized, true);
  assert.throws(() => applyPinnedHomeImageSettings({ prompt: 'A scene', submitAuthorized: true }), /параметры/);
});

test('Settings request validates required choices and bounded subject IDs; no hidden extra parameters', () => {
  assert.ok(homeImageSettingsRequestSchema.safeParse({ conversationId: 'home:test', ...settings }).success);
  assert.ok(!homeImageSettingsRequestSchema.safeParse({ conversationId: 'home:test', ...settings, model: '' }).success);
  assert.ok(!homeImageSettingsRequestSchema.safeParse({ conversationId: 'home:test', ...settings, subjectIds: ['foreign-string'] }).success);
  assert.ok(!homeImageSettingsRequestSchema.safeParse({ conversationId: 'home:test', ...settings, subjectIds: Array(4).fill(subjectId) }).success);
  assert.ok(!homeImageSettingsRequestSchema.safeParse({ conversationId: 'home:test', ...settings, workspaceId: 'spoofed' }).success);
  assert.equal(homeGenerationReferenceCount(3, pinned.subjects), 4);
  assert.throws(() => homeGenerationReferenceCount(4, pinned.subjects), /четырёх/);
});

test('Settings selectors cannot import another user, Workspace or conversation snapshot', async () => {
  const record = { ...pinned, workspaceId: principal.tenantId, userId: principal.userId,
    conversationId: 'home:test', createdAt: new Date() };
  const selector = homeImageSettingsSelector(settingsId);
  assert.equal((await readHomeImageSettings(principal, 'home:test', selector, async () => record))?.id, settingsId);
  for (const foreign of [{ ...record, workspaceId: 'other' }, { ...record, userId: 'other' }, { ...record, conversationId: 'other' }]) {
    await assert.rejects(() => readHomeImageSettings(principal, 'home:test', selector, async () => foreign), /недоступны/);
  }
  assert.equal(await readHomeImageSettings(principal, 'home:test', { route: '/' }), undefined);
});

test('A Library subject pins passport/revision and only its primary image; text-only subject is valid', async () => {
  const f = subjectFixture();
  const snapshots = await snapshotHomeSubjects(principal, [subjectId], f.dependencies);
  assert.deepEqual(snapshots, pinned.subjects); assert.deepEqual(f.reads, [assetId]);
  f.profile.imageAssetIds = [];
  const textOnly = await snapshotHomeSubjects(principal, [subjectId], f.dependencies);
  assert.equal(textOnly[0].reference, undefined); assert.equal(textOnly[0].passportText, 'Alice has blue eyes.');
});

test('Subject and primary image must be accessible in the current Workspace', async () => {
  const f = subjectFixture();
  f.profile.workspaceId = 'foreign';
  await assert.rejects(() => snapshotHomeSubjects(principal, [subjectId], f.dependencies), /Workspace/);
  f.profile.workspaceId = principal.tenantId; f.image.workspaceId = 'foreign';
  await assert.rejects(() => snapshotHomeSubjects(principal, [subjectId], f.dependencies), /недоступно/);
});

test('Execution rechecks subject/image access and checksum, preserving the pinned identity across profile edits', async () => {
  const f = subjectFixture();
  f.profile.passportText = 'Changed after submit';
  const images = await loadHomeSubjectImages(principal, pinned.subjects, f.dependencies);
  assert.equal(images[0].sourceAssetId, assetId); assert.equal(images[0].dataUrl, 'data:image/png;base64,AQIDBA==');
  assert.equal(pinned.subjects[0].passportText, 'Alice has blue eyes.');
  f.image.checksumSha256 = 'changed';
  await assert.rejects(() => loadHomeSubjectImages(principal, pinned.subjects, f.dependencies), /изменилось/);
  f.image.checksumSha256 = 'checksum'; f.profile.workspaceId = 'foreign';
  await assert.rejects(() => loadHomeSubjectImages(principal, pinned.subjects, f.dependencies), /Workspace/);
});
