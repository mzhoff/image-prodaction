import type { ToolExecutionContext } from '@prodactionpro/chat-connectors';
import type { AssetRecord, ProductionNode } from '@/entities/production-graph/model/types';
import type {
  ChatAttachmentAssetBridge,
  PipelineAttachmentImport,
} from './chat-attachment-asset-bridge';

export async function resolvePipelineAttachmentImports(
  imports: readonly PipelineAttachmentImport[],
  context: ToolExecutionContext,
  bridge?: ChatAttachmentAssetBridge,
) {
  if (imports.length === 0) return [...imports];
  if (!bridge) throw new Error('Chat attachment import is not configured.');
  return bridge.resolveLatestImports(context.conversationId, imports, toPrincipal(context));
}

export async function materializePipelineAttachmentImports(
  imports: readonly PipelineAttachmentImport[],
  nodes: readonly ProductionNode[],
  context: ToolExecutionContext,
  documentId: string,
  bridge?: ChatAttachmentAssetBridge,
): Promise<{ assets: AssetRecord[]; nodes: ProductionNode[] }> {
  if (imports.length === 0) return { assets: [], nodes: [...nodes] };
  if (!bridge) throw new Error('Chat attachment import is not configured.');
  const materialized = await bridge.materializeImports(imports, {
    documentId,
    principal: toPrincipal(context),
  });
  return {
    assets: materialized.assets,
    nodes: nodes.map((node) => {
      const assetId = materialized.assetIdByNodeId.get(node.id);
      return assetId ? { ...node, data: { ...node.data, assetId } } : node;
    }),
  };
}

function toPrincipal(context: ToolExecutionContext) {
  return {
    productId: context.productId,
    tenantId: context.tenantId,
    userId: context.userId,
  };
}
