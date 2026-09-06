import type { GraphIoContext } from './graph-io-contracts';
import { getIncomingSources, getRouterIncomingSource } from './graph-io-sources';
import { getPortById } from './node-definitions';
import { getSpeechHistory } from './speech-result-history';
import type { AudioConvertNodeData, ImportImageNodeData, ProductionNode, TextToSpeechNodeData } from './types';

export function getAudioConvertResultSignature(sourceId: string, data: AudioConvertNodeData) {
  return JSON.stringify([sourceId, data.format, data.bitrateKbps ?? null, data.sampleRateHz ?? null, data.channels ?? null]);
}

export function getNodeAudioAssetId(node?: ProductionNode, context?: Pick<GraphIoContext, 'nodes' | 'edges'>, visited = new Set<string>()): string | undefined {
  if (!node) return undefined;
  if (node.type === 'router') {
    const source = getRouterIncomingSource(node, context, visited);
    return source ? getNodeAudioAssetId(source.sourceNode, context, visited) : undefined;
  }
  if (node.type === 'importImage') {
    const data = node.data as ImportImageNodeData;
    return data.mediaKind === 'audio' ? data.assetId : undefined;
  }
  if (node.type === 'textToSpeech') {
    const data = node.data as TextToSpeechNodeData;
    return getSpeechHistory(data).activeAssetId;
  }
  if (node.type === 'audioConvert') {
    const data = node.data as AudioConvertNodeData;
    if (!context) return data.audioAssetId;
    if (visited.has(node.id)) return undefined;
    visited.add(node.id);
    const source = getIncomingSources(node.id, 'source', context)[0];
    const sourceId = source && getNodeAudioAssetId(source.sourceNode, context, visited);
    return sourceId && sourceId === data.sourceAudioAssetId
      && data.audioResultSignature === getAudioConvertResultSignature(sourceId, data) ? data.audioAssetId : undefined;
  }
  return undefined;
}

export function getFirstIncomingAudioAsset(targetNodeId: string, portId: string, context: GraphIoContext) {
  for (const source of getIncomingSources(targetNodeId, portId, context)) {
    if (source.sourceNode.type !== 'router' && getPortById(source.sourceNode, source.sourcePortId)?.kind !== 'audio') continue;
    const assetId = getNodeAudioAssetId(source.sourceNode, context);
    const asset = context.assets.find((candidate) => candidate.id === assetId && candidate.kind === 'audio');
    if (asset) return asset;
  }
  return undefined;
}
