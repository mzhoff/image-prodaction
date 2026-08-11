import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectExport, createEmptyProjectUiState } from '@/entities/production-graph/model/project-schema.ts';
import { initialProject } from '@/entities/production-graph/model/initial-project.ts';
import {
  documentSnapshotHasContent,
  isDisposableUntouchedDocument,
} from './document-lifecycle.ts';

const untouched = {
  favorite: false,
  hasEverHadContent: false,
  name: 'Untitled Pipeline',
  status: 'active' as const,
  thumbnailAvailable: false,
};

test('blank starter project has no user content', () => {
  assert.equal(
    documentSnapshotHasContent(createProjectExport(initialProject, createEmptyProjectUiState())),
    false,
  );
});

test('a document with graph content is never classified as untouched', () => {
  const snapshot = createProjectExport({
    ...initialProject,
    sections: [{
      id: 'section-1',
      title: 'First section',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
    }],
  }, createEmptyProjectUiState());

  assert.equal(documentSnapshotHasContent(snapshot), true);
  assert.equal(isDisposableUntouchedDocument({ ...untouched, hasEverHadContent: true }), false);
});

test('rename, favorite, thumbnail and trash status preserve an empty document', () => {
  assert.equal(isDisposableUntouchedDocument(untouched), true);
  assert.equal(isDisposableUntouchedDocument({ ...untouched, name: 'My draft' }), false);
  assert.equal(isDisposableUntouchedDocument({ ...untouched, favorite: true }), false);
  assert.equal(isDisposableUntouchedDocument({ ...untouched, thumbnailAvailable: true }), false);
  assert.equal(isDisposableUntouchedDocument({ ...untouched, status: 'trash' }), false);
});
