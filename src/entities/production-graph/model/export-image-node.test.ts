import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultNode } from './create-default-node.ts';
import { canConnectPorts, getNodePorts } from './node-definitions.ts';
import { invalidateExportImageResult } from './export-image-connection-state.ts';
import { getNodeImageAssetId } from './graph-image-outputs.ts';
import type { ExportImageNodeData, PipelineOutputNodeData, ProductionNode } from './types.ts';

test('Export exposes a typed image result that resolves to the transformed asset', () => {
  const exportNode = createDefaultNode('exportImage', { x: 0, y: 0 });
  exportNode.data = {
    ...exportNode.data,
    resultAssetId: 'asset-exported-webp',
    resultSignature: 'source:jpeg:90:1:white',
    sourceAssetId: 'asset-source-png',
  } as ExportImageNodeData;
  const outputNode = createDefaultNode('pipelineOutput', { x: 400, y: 0 });
  outputNode.data = {
    title: 'Pipeline Output',
    fields: [{ id: 'cover-field', key: 'cover', kind: 'image', required: true }],
  } as PipelineOutputNodeData;

  assert.deepEqual(getNodePorts(exportNode).at(-1), {
    id: 'image',
    kind: 'image',
    label: 'Result',
    side: 'output',
  });
  assert.equal(canConnectPorts(exportNode, 'image', outputNode, 'field:cover-field'), true);
  assert.equal(getNodeImageAssetId(exportNode), 'asset-exported-webp');
});

test('Export hides a stale transformed asset when its current source no longer matches', () => {
  const source = createDefaultNode('importImage', { x: 0, y: 0 });
  source.data = { ...source.data, assetId: 'asset-source-new' };
  const exportNode = createDefaultNode('exportImage', { x: 400, y: 0 });
  exportNode.data = {
    ...exportNode.data,
    resultAssetId: 'asset-exported-old',
    resultSignature: 'asset-source-old:png:90:1:transparent',
    sourceAssetId: 'asset-source-old',
  } as ExportImageNodeData;

  assert.equal(getNodeImageAssetId(exportNode, {
    assets: [],
    edges: [{
      id: 'source-export',
      sourceNodeId: source.id,
      sourcePortId: 'image',
      targetNodeId: exportNode.id,
      targetPortId: 'image-0',
    }],
    nodes: [source, exportNode],
  }), undefined);
});

test('disconnecting Export while it is converting always resets its running status', () => {
  const exportNode = createDefaultNode('exportImage', { x: 0, y: 0 });
  exportNode.status = 'running';

  const [invalidated] = invalidateExportImageResult([exportNode], exportNode.id);

  assert.equal((invalidated as ProductionNode).status, 'idle');
});
