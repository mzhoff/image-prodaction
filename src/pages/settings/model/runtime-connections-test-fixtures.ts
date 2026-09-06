import type { RuntimeV2Client, RuntimeV2Credential } from '@/modules/executable-pipelines/contracts/runtime-v2-contracts';
import type { RuntimeV2Grant, RuntimeV2Pipeline, RuntimeV2Version } from '@/modules/executable-pipelines/contracts/runtime-v2-descriptor-contracts';

export const runtimeFixtureWorkspace = '019abcde-1234-7000-8000-000000000001';
export const runtimeFixtureClient: RuntimeV2Client = {
  id: '019abcde-1234-7000-8000-000000000002', workspaceId: runtimeFixtureWorkspace,
  displayName: 'Content Hub', sourceApplication: 'content-hub', externalWorkspaceRef: 'external-test',
  enabled: true, scopes: ['pipeline.run.create'], createdAt: '2026-09-05T10:00:00Z', updatedAt: '2026-09-05T10:00:00Z',
};
export const runtimeFixtureCredential: RuntimeV2Credential = {
  id: '019abcde-1234-7000-8000-000000000003', serviceClientId: runtimeFixtureClient.id,
  label: 'Test', tokenPrefix: 'testprefix12', scopes: null, expiresAt: null, revokedAt: null,
  createdAt: '2026-09-05T10:00:00Z', lastUsedAt: null,
};
export const runtimeFixtureVersion: RuntimeV2Version = {
  version: 2, checksum: 'a'.repeat(64), inputSchemaChecksum: 'b'.repeat(64), outputSchemaChecksum: 'c'.repeat(64),
  capabilityKey: 'content.generate-summary', publishedAt: '2026-09-05T10:00:00Z',
};
export const runtimeFixturePipeline: RuntimeV2Pipeline = {
  publicId: `pln_${'a'.repeat(32)}`, name: 'Test summary', description: null, latest: runtimeFixtureVersion,
  input: { fields: { input: { kind: 'text', required: true } }, schemaChecksum: 'b'.repeat(64), semanticContract: null },
  output: { fields: { result: { kind: 'text', required: true } }, schemaChecksum: 'c'.repeat(64), semanticContract: null },
};
export const runtimeFixtureGrant: RuntimeV2Grant = {
  id: '019abcde-1234-7000-8000-000000000004', serviceClientId: runtimeFixtureClient.id,
  pipelinePublicId: runtimeFixturePipeline.publicId, pipelineName: runtimeFixturePipeline.name,
  capabilityKey: 'content.generate-summary', enabled: true, revision: 3, updatePolicy: 'PINNED',
  executionPolicy: { maxAttempts: 1 }, costPolicy: { mode: 'STRICT', maximumProviderCostUsd: '0.05' },
  pinned: runtimeFixtureVersion, input: runtimeFixturePipeline.input, output: runtimeFixturePipeline.output,
  createdAt: '2026-09-05T10:00:00Z', updatedAt: '2026-09-05T10:00:00Z',
};
