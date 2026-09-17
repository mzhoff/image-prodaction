import assert from 'node:assert/strict';
import test from 'node:test';
import { initialProject } from '@/entities/production-graph/model/initial-project';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { createEmptyProjectUiState, createProjectExport } from '@/entities/production-graph/model/project-schema';
import { assertCanonicalAiStoriesClient, assertExactAiRecipeSnapshot, assertLocalAiStoriesEnvironment, parseAiStoriesOperatorArguments } from './reverie-stories-ai-pipeline';

const workspace = '019ed347-66a4-7124-8000-000000000001';
const client = '019ed347-66a4-7124-8000-000000000002';
const source = '019ed347-66a4-7124-8000-000000000003';
const args = ['--user', 'test-owner', '--workspace', workspace, '--client', client, '--source-document', source, '--profile-file', '/tmp/application-profile.json'];

test('AI recipe operator defaults to dry-run and requires an explicit single apply switch', () => {
  assert.equal(parseAiStoriesOperatorArguments(args).apply, false);
  assert.equal(parseAiStoriesOperatorArguments([...args, '--apply']).apply, true);
  assert.throws(() => parseAiStoriesOperatorArguments([...args, '--apply', '--apply']), /Duplicate/);
  assert.throws(() => parseAiStoriesOperatorArguments([...args, '--grant', 'new']), /Expected/);
  assert.throws(() => parseAiStoriesOperatorArguments([...args, '--workspace', workspace]), /Expected/);
  assert.throws(() => parseAiStoriesOperatorArguments(args.slice(0, -2)));
});

test('operator refuses non-local databases, other databases and remote storage', () => {
  const env = { DATABASE_URL: 'postgresql://test:test@postgres:5432/image_prodaction', S3_ENDPOINT: 'http://minio:9000' };
  assert.doesNotThrow(() => assertLocalAiStoriesEnvironment(env));
  assert.throws(() => assertLocalAiStoriesEnvironment({ ...env, DATABASE_URL: 'postgresql://test:test@db.example.com/image_prodaction' }), /local Image Production/);
  assert.throws(() => assertLocalAiStoriesEnvironment({ ...env, DATABASE_URL: 'postgresql://test:test@localhost/another_database' }), /local Image Production/);
  assert.throws(() => assertLocalAiStoriesEnvironment({ ...env, DATABASE_URL: `${env.DATABASE_URL}?host=db.example.com` }), /local Image Production/);
  assert.throws(() => assertLocalAiStoriesEnvironment({ ...env, S3_ENDPOINT: 'https://storage.example.com' }), /local MinIO/);
});

test('operator requires an enabled Content Hub client in the canonical Workspace', () => {
  const connection = { workspaceId: workspace, enabled: true, sourceApplication: 'content-hub', externalWorkspaceRef: workspace };
  assert.doesNotThrow(() => assertCanonicalAiStoriesClient(workspace, connection));
  for (const patch of [{ enabled: false }, { workspaceId: source }, { externalWorkspaceRef: source }, { sourceApplication: 'other' }]) {
    assert.throws(() => assertCanonicalAiStoriesClient(workspace, { ...connection, ...patch }), /canonical Content Hub/);
  }
});

test('idempotent recipe comparison tolerates JSON storage and viewport but rejects edited content or asset pins', () => {
  const node = createDefaultNode('textPrompt', { x: 100, y: 100 });
  const snapshot = createProjectExport({ ...structuredClone(initialProject), nodes: [node] }, createEmptyProjectUiState());
  const persisted = JSON.parse(JSON.stringify(snapshot));
  persisted.exportedAt = '2020-01-01T00:00:00.000Z';
  persisted.uiState.viewport.zoom = 0.4;
  assert.doesNotThrow(() => assertExactAiRecipeSnapshot(persisted, snapshot));
  const edited = structuredClone(persisted); edited.project.nodes[0].data.text = 'Author edit';
  assert.throws(() => assertExactAiRecipeSnapshot(edited, snapshot), /Refusing to overwrite/);
  const media = structuredClone(persisted); media.assetsManifest = [{ id: source, storage: { type: 'remote', assetId: source } }];
  assert.throws(() => assertExactAiRecipeSnapshot(media, snapshot), /Refusing to overwrite/);
});
