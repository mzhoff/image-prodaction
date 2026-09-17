import { canConnectPorts } from './node-definitions';
import type { AssetRecord, GraphEdge, ProductionNode } from './types';

export function assignImportMedia(nodes: ProductionNode[], edges: GraphEdge[], nodeId: string, asset: AssetRecord) {
  const nodesWithAsset = nodes.map((node) => node.id === nodeId && node.type === 'importImage'
    ? { ...node, data: { ...node.data, assetId: asset.id, mediaKind: asset.kind,
      videoAudioTrackIndex: asset.video?.audioTracks.find((track) => track.isDefault)?.index ?? asset.video?.audioTracks[0]?.index,
      videoAudioAssetId: undefined, videoOnlyAssetId: undefined, videoPreviewAssetId: undefined, videoPreviewAudioTrackIndex: undefined,
      videoDerivedSourceAssetId: undefined, videoDerivedAudioTrackIndex: undefined,
    } }
    : node);
  const source = nodesWithAsset.find((node) => node.id === nodeId);
  return { nodes: nodesWithAsset, edges: edges.filter((edge) => {
    if (edge.sourceNodeId !== nodeId || !source) return true;
    const target = nodesWithAsset.find((node) => node.id === edge.targetNodeId);
    return target && canConnectPorts(source, edge.sourcePortId, target, edge.targetPortId);
  }) };
}
