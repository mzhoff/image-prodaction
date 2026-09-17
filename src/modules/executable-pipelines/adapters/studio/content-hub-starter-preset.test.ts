import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTENT_HUB_CAPABILITIES, getContentHubStarterPreset } from '@/entities/production-graph/model/content-hub-starter-preset';
import { validateDocumentSnapshot } from '@/entities/document/server/document-validation';
import { contentHubPresetDocumentId } from '../../server/content-hub-preset-service';
import { CONTENT_HUB_PROJECT_NAME, CONTENT_HUB_PROJECT_SYSTEM_KEY, isCanonicalContentHubWorkspace } from '../../core/content-hub-workspace';
import { compileStudioSection } from './studio-pipeline-compiler';
import { isProductionPipelineHandlerSupported } from '../../server/pipeline-production-manifest';

test('starter includes five independent, compilable asset-free Content Hub graphs', () => {
  const preset = getContentHubStarterPreset();
  assert.deepEqual(preset.map((entry) => entry.capabilityKey), [...CONTENT_HUB_CAPABILITIES]);
  for (const entry of preset) {
    const snapshot = validateDocumentSnapshot(entry.snapshot);
    const compilation = compileStudioSection(snapshot.project, entry.sectionId, { isHandlerSupported: isProductionPipelineHandlerSupported });
    assert.equal(compilation.sourceMetadata.capabilityKey, entry.capabilityKey);
    const basic = ['content.generate-article-summary', 'brand.generate-article-cover'].includes(entry.capabilityKey);
    assert.equal(compilation.compiledPlan.definition.inputs[basic ? 'input' : 'brief']?.kind, 'text');
    const output = basic ? 'result' : entry.capabilityKey.startsWith('channels.') ? 'analysis' : 'draft';
    assert.equal(compilation.compiledPlan.definition.outputContracts?.[output]?.kind, entry.capabilityKey.startsWith('brand.') ? 'image' : 'text');
    assert.deepEqual(snapshot.project.assets, []);
    assert.deepEqual(snapshot.project.runs, []);
    assert.deepEqual(snapshot.project.publications, []);
    assert.equal(JSON.stringify(snapshot).includes('rvr_client_'), false);
  }
  preset[0]!.snapshot.project.nodes.length = 0;
  assert.ok(getContentHubStarterPreset()[0]!.snapshot.project.nodes.length > 0);
});
test('workspace scoped preset identities are stable and do not overlap', () => {
  const first = CONTENT_HUB_CAPABILITIES.map((key) => contentHubPresetDocumentId('workspace-a', key));
  const second = CONTENT_HUB_CAPABILITIES.map((key) => contentHubPresetDocumentId('workspace-b', key));
  assert.equal(new Set([...first, ...second]).size, 10);
  assert.deepEqual(first, CONTENT_HUB_CAPABILITIES.map((key) => contentHubPresetDocumentId('workspace-a', key)));
});
test('Content Hub cannot claim a different provider Workspace through externalWorkspaceRef', () => {
  assert.equal(isCanonicalContentHubWorkspace('a', { sourceApplication: 'content-hub', externalWorkspaceRef: 'a' }), true);
  assert.equal(isCanonicalContentHubWorkspace('a', { sourceApplication: 'content-hub', externalWorkspaceRef: 'b' }), false);
  assert.equal(isCanonicalContentHubWorkspace('a', { sourceApplication: 'another-product', externalWorkspaceRef: 'b' }), true);
});
test('Content Hub uses a stable system project identity instead of a display-name guess', () => {
  assert.equal(CONTENT_HUB_PROJECT_SYSTEM_KEY, 'content-hub');
  assert.equal(CONTENT_HUB_PROJECT_NAME, 'Content Hub');
});
