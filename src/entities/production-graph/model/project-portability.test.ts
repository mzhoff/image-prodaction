import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { createEmptyProjectUiState } from './project-schema.ts';
import { PROJECT_SCHEMA_VERSION } from './project-schema.ts';
import { 
  createPipelineTemplateExport,
  createProjectSnapshotExport,
  normalizePortableProjectExport,
} from './project-portability';

const mockAsset = {
  id: 'asset-1',
  kind: 'image',
  name: 'reference.jpg',
  mimeType: 'image/jpeg',
  width: 1024,
  height: 768,
  storage: {
    type: 'indexeddb',
    key: 'asset-1',
  },
  createdAt: '2026-01-01T10:00:00.000Z',
};

const generateNodeWithResult = {
  id: 'generate-image',
  type: 'generateImage',
  position: { x: 0, y: 0 },
  size: { width: 280, height: 360 },
  status: 'success',
  data: {
    title: 'Generate Image',
    model: 'google/gemini-2.5-flash-image',
    result: 'old result',
    resultAssetId: 'asset-1',
    resultAssetIds: ['asset-1'],
    activeResultIndex: 0,
    sourceText: 'source',
  },
};

const subjectNodeWithSource = {
  id: 'subject-node',
  type: 'subjectBuilder',
  position: { x: 100, y: 0 },
  size: { width: 300, height: 330 },
  status: 'success',
  data: {
    title: 'Subject Builder',
    name: 'Product',
    imageAssetIds: ['asset-1'],
    sourceNodeId: 'source-image',
    result: 'subject text',
  },
};

const baseProject = {
  version: PROJECT_SCHEMA_VERSION,
  nodes: [generateNodeWithResult, subjectNodeWithSource],
  sections: [],
  edges: [],
  assets: [mockAsset],
  presets: [
    {
      id: 'preset-1',
      role: 'composition',
      title: 'Composition',
      text: 'good composition',
      sourceAssetId: 'asset-1',
    },
  ],
  subjects: [
    {
      id: 'subject-1',
      title: 'Subject',
      name: 'Product',
      subjectType: 'generic',
      imageAssetIds: ['asset-1'],
      immutableTraits: '',
      mutableAttributes: '',
      preserveStrength: 0.4,
      identitySummary: 'identity',
      negativeConstraints: '',
      notes: '',
      passportText: '',
      sourceNodeId: 'subject-node',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ],
  locations: [
    {
      id: 'location-1',
      title: 'Location',
      name: 'Office',
      locationType: 'indoor',
      imageAssetIds: ['asset-1'],
      atmosphere: '',
      mutableAttributes: '',
      preserveStrength: 0.4,
      description: '',
      negativeConstraints: '',
      notes: '',
      passportText: '',
      sourceNodeId: 'location-node',
      spatialLayout: '',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
  ],
  publications: [{
    id: 'publication-1',
    title: 'Publication',
    kind: 'telegramPost',
    format: 'post',
    createdAt: '2026-01-01T10:00:00.000Z',
    status: 'draft',
    data: {},
  }],
  runs: [{
    id: 'run-1',
    nodeType: 'generateImage',
    createdAt: '2026-01-01T10:00:00.000Z',
    status: 'success',
    resultAssetIds: ['asset-1'],
  }],
  selectedNodeIds: ['generate-image'],
  selectedSectionIds: ['section-1'],
} as const;

beforeEach(() => {
  // pure function coverage, no global setup required.
});

test('createProjectSnapshotExport keeps full project and builds asset manifest', () => {
  const uiState = {
    ...createEmptyProjectUiState(),
    nodes: {
      'generate-image': { state: 'Expanded' as const },
    },
  };

  const exported = createProjectSnapshotExport(baseProject as never, uiState);

  assert.equal(exported.kind, 'projectSnapshot');
  assert.equal(exported.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(exported.assetsManifest.length, 1);
  assert.equal(exported.assetsManifest[0].id, 'asset-1');
  assert.equal(exported.project.nodes.length, baseProject.nodes.length);
  assert.equal(exported.project.assets.length, 1);
  assert.equal(exported.project.runs.length, 1);
  assert.equal(exported.project.publications.length, 1);
  assert.equal(exported.uiState.nodes['generate-image'].state, 'Expanded');
});

test('createPipelineTemplateExport strips runtime result fields and clears execution artifacts', () => {
  const uiState = {
    ...createEmptyProjectUiState(),
    nodes: {
      'subject-node': { state: 'Collapsed' as const },
    },
  };

  const exported = createPipelineTemplateExport(baseProject as never, uiState);

  assert.equal(exported.kind, 'pipelineTemplate');
  assert.equal(exported.schemaVersion, PROJECT_SCHEMA_VERSION);
  assert.equal(exported.project.assets.length, 0);
  assert.equal(exported.project.runs.length, 0);
  assert.equal(exported.project.publications.length, 0);
  assert.equal(exported.project.selectedNodeIds.length, 0);
  assert.equal(exported.project.selectedSectionIds.length, 0);

  const exportedGenerate = exported.project.nodes.find((node) => node.id === 'generate-image');
  assert.ok(exportedGenerate);
  const exportedGenerateData = exportedGenerate.data as { result?: string; resultAssetId?: string; activeResultIndex?: number; resultAssetIds?: string[] };
  assert.equal('result' in exportedGenerateData, false);
  assert.equal(exportedGenerateData.resultAssetId, undefined);
  assert.equal(Array.isArray(exportedGenerateData.resultAssetIds), true);
  assert.equal(exportedGenerateData.activeResultIndex, -1);

  const exportedSubject = exported.project.nodes.find((node) => node.id === 'subject-node');
  assert.ok(exportedSubject);
  const exportedSubjectData = exportedSubject.data as { sourceNodeId?: string; imageAssetIds?: string[]; result?: string };
  assert.equal(exportedSubjectData.sourceNodeId, undefined);
  assert.equal((exportedSubjectData.imageAssetIds ?? []).length, 0);
  assert.equal('result' in exportedSubjectData, false);
});

test('normalizePortableProjectExport imports project snapshot and keeps selected state', () => {
  const snapshot = {
    kind: 'projectSnapshot',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: '2026-01-01T12:00:00.000Z',
    project: baseProject,
    uiState: {
      ...createEmptyProjectUiState(),
      nodes: {
        'generate-image': { collapsed: true },
      },
    },
  };

  const imported = normalizePortableProjectExport(snapshot);
  assert.equal(imported.kind, 'projectSnapshot');
  assert.equal(imported.project.nodes.length, 2);
  assert.equal(imported.project.assets.length, 1);
  assert.equal(imported.uiState.nodes['generate-image'].state, 'Collapsed');
});

test('normalizePortableProjectExport imports pipeline template as normalized skeleton and strips runtime artifacts', () => {
  const template = {
    kind: 'pipelineTemplate',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: '2026-01-01T12:00:00.000Z',
    project: {
      ...baseProject,
      assets: [mockAsset],
      runs: [{
        id: 'run-template',
        nodeType: 'generateImage',
        createdAt: '2026-01-01T10:00:00.000Z',
        status: 'success',
        resultAssetIds: ['asset-1'],
      }],
      publications: [{
        id: 'publication-template',
        title: 'Publication',
        kind: 'telegramPost',
        format: 'post',
        createdAt: '2026-01-01T10:00:00.000Z',
        status: 'draft',
        data: {},
      }],
    },
    uiState: createEmptyProjectUiState(),
  };

  const imported = normalizePortableProjectExport(template);
  assert.equal(imported.kind, 'pipelineTemplate');
  assert.equal(imported.project.assets.length, 0);
  assert.equal(imported.project.runs.length, 0);
  assert.equal(imported.project.publications.length, 0);
  const importedGenerate = imported.project.nodes.find((node) => node.id === 'generate-image');
  assert.ok(importedGenerate);
  assert.equal(importedGenerate.status, 'idle');
});

test('normalizePortableProjectExport rejects unsupported schema versions', () => {
  assert.throws(
    () => normalizePortableProjectExport({ kind: 'projectSnapshot', schemaVersion: 999, project: baseProject }),
    /Версия project\/template JSON пока не поддерживается/,
  );
});
