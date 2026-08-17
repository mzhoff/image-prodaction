import assert from 'node:assert/strict';
import test from 'node:test';
import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import type { ChatAttachmentAssetBridge } from './chat-attachment-asset-bridge.ts';
import { materializePipelineAttachmentImports } from './pipeline-attachment-import-service.ts';

test('assigns a materialized product asset to the referenced import node', async () => {
  const node = createDefaultNode('importImage', { x: 100, y: 100 });
  const asset: AssetRecord = {
    createdAt: new Date().toISOString(),
    id: 'asset-1',
    kind: 'image',
    mimeType: 'image/webp',
    name: 'reference.webp',
    storage: { assetId: 'asset-1', type: 'remote' },
  };
  const bridge = {
    materializeImports: async () => ({
      assetIdByNodeId: new Map([[node.id, asset.id]]),
      assets: [asset],
    }),
  } as unknown as ChatAttachmentAssetBridge;

  const result = await materializePipelineAttachmentImports(
    [{ attachmentId: 'attachment-1', attachmentIndex: 0, nodeId: node.id }],
    [node],
    {
      productId: 'image-production',
      tenantId: 'workspace-1',
      userId: 'user-1',
    } as ToolExecutionContext,
    'document-1',
    bridge,
  );

  assert.deepEqual(result.assets, [asset]);
  assert.equal((result.nodes[0].data as { assetId?: string }).assetId, asset.id);
});
