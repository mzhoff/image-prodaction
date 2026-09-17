import assert from 'node:assert/strict';
import test from 'node:test';
import { createUuidV7 } from '@/shared/lib/id';
import { createDefaultNode } from './create-default-node';
import { normalizeNode } from './normalize-project-node';
import { buildLibrarySubject, emptySubjectProfile, profileFields, subjectFieldsToNode, subjectProfileFields } from './subject-profile';
import { buildSubjectPassportText } from './subject-passport';
import { NODE_HELP_METADATA } from './node-help';
import type { SubjectBuilderNodeData } from './types';

test('form and Subject Builder produce the same lossless passport', () => {
  const fields = subjectProfileFields.parse({ ...emptySubjectProfile, name: 'Лира', subjectType: 'character',
    identitySummary: 'Рыжие волосы', immutableTraits: 'Зелёные глаза', mutableAttributes: 'Плащ',
    negativeConstraints: 'Не менять лицо', notes: 'Главная героиня', imageAssetIds: [createUuidV7()] });
  const profile = buildLibrarySubject(fields, { id: createUuidV7(), workspaceId: createUuidV7(), revision: 2,
    sourceDocumentId: null, createdAt: '2026-09-10T00:00:00Z', updatedAt: '2026-09-10T01:00:00Z' });
  assert.deepEqual(profileFields(profile), fields);
  assert.equal(profile.passportText, buildSubjectPassportText(subjectFieldsToNode(fields)));
  assert.deepEqual(subjectFieldsToNode(fields).libraryImageAssetIds, fields.imageAssetIds);
  assert.equal('workspaceId' in subjectFieldsToNode(profile), false);
  assert.equal('revision' in subjectFieldsToNode(profile), false);
});

test('profile rejects unbounded text, nameless subjects and non-durable references', () => {
  const valid = { ...emptySubjectProfile, name: 'Лира' };
  assert.equal(subjectProfileFields.safeParse(emptySubjectProfile).success, false);
  for (const bad of [{ name: ' '.repeat(3) }, { name: 'A'.repeat(121) }, { notes: 'A'.repeat(10001) },
    { imageAssetIds: ['blob:local'] }, { imageAssetIds: Array.from({ length: 25 }, createUuidV7) }, { unexpected: true }]) {
    assert.equal(subjectProfileFields.safeParse({ ...valid, ...bad }).success, false);
  }
  const id = createUuidV7();
  assert.deepEqual(subjectProfileFields.parse({ ...valid, imageAssetIds: [id, id] }).imageAssetIds, [id]);
});

test('canvas normalization preserves shared subject identity and revision, rejects invalid revisions', () => {
  const node = createDefaultNode('subjectBuilder', { x: 0, y: 0 });
  node.data = { ...subjectFieldsToNode({ ...emptySubjectProfile, name: 'Лира' }), librarySubjectId: createUuidV7(), libraryRevision: 3 };
  const data = normalizeNode(node).data as SubjectBuilderNodeData;
  assert.equal(data.libraryRevision, 3);
  assert.equal(data.librarySubjectId, node.data.librarySubjectId);
  node.data.libraryRevision = -1;
  assert.equal((normalizeNode(node).data as SubjectBuilderNodeData).libraryRevision, undefined);
});

test('Ask AI describes shared persistence, explicit loading, limits and no automatic paid actions', () => {
  const help = NODE_HELP_METADATA.subjectBuilder;
  assert.match(help.capabilities.join(' '), /серверной Library/);
  assert.match(help.capabilities.join(' '), /формой/);
  assert.match(help.limitations.join(' '), /120.*10000.*24/);
  assert.match(help.limitations.join(' '), /устаревшей версии/);
  assert.equal(help.execution, 'canvas-only');
});
