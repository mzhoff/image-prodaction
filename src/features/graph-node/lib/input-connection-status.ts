import { getNodeTimelineFrameAssetIds } from '@/entities/production-graph/model/graph-timeline-io';
import { getNodeImageAssetId } from '@/entities/production-graph/model/graph-image-outputs';
import { getIncomingSources } from '@/entities/production-graph/model/graph-io-sources';
import { getNodeLocationResult, getNodePublicationResult, getNodeSubjectResult, getNodeTextResult, getRouterDataKind } from '@/entities/production-graph/model/graph-text-outputs';
import { getNodeAudioAssetId } from '@/entities/production-graph/model/graph-audio-io';
import { getNodeVideoAssetId } from '@/entities/production-graph/model/graph-video-io';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { GraphIoContext } from '@/entities/production-graph/model/graph-io-contracts';

export type InputConnectionBadgeKind = 'audio' | 'empty' | 'image' | 'location' | 'mixed' | 'publication' | 'subject' | 'text' | 'video';
export type InputConnectionBadgeState = 'disconnected' | 'empty' | 'ready';

export interface InputConnectionStatus {
  sourceLabels?: string[];
  sourceEdgeIds?: string[];
  kind: InputConnectionBadgeKind;
  label: string;
  state: InputConnectionBadgeState;
}

const LABELS: Record<Exclude<InputConnectionBadgeKind, 'empty' | 'mixed'>, string> = {
  audio: 'Audio',
  image: 'Image',
  location: 'Location',
  publication: 'Publication',
  subject: 'Subject',
  text: 'Text',
  video: 'Video',
};

export function getInputConnectionStatus(
  targetNodeId: string,
  targetPortId: string,
  context: GraphIoContext,
): InputConnectionStatus {
  const incoming = getIncomingSources(targetNodeId, targetPortId, context);
  if (incoming.length === 0) return { kind: 'empty', label: 'Не подключён', state: 'disconnected' };

  if (incoming.length === 1) {
    let source = incoming[0]!;
    const visited = new Set<string>();
    while (source.sourceNode.type === 'router' && !visited.has(source.sourceNode.id)) {
      visited.add(source.sourceNode.id);
      const inputs = getIncomingSources(source.sourceNode.id, 'input', context);
      if (inputs.length !== 1) break;
      source = inputs[0]!;
    }
    if (source.sourceNode.type === 'timelineHandoff' && source.sourcePortId === 'frames') {
      const ids = getNodeTimelineFrameAssetIds(source.sourceNode, context);
      const ready = ids.length > 0 && ids.every((id) => context.assets.some((asset) => asset.id === id && asset.kind === 'image'));
      return ready ? { kind: 'image', label: `Image · ${ids.length}`, state: 'ready', sourceLabels: [incoming[0]!.sourceNode.data.title], sourceEdgeIds: [incoming[0]!.edge.id] }
        : { kind: 'empty', label: 'Кадры готовятся', state: 'empty' };
    }
  }

  const counts = new Map<Exclude<InputConnectionBadgeKind, 'empty' | 'mixed'>, number>();
  const add = (kind: Exclude<InputConnectionBadgeKind, 'empty' | 'mixed'>) => counts.set(kind, (counts.get(kind) ?? 0) + 1);
  for (const source of incoming) {
    const port = getPortById(source.sourceNode, source.sourcePortId);
    const sourceKind = source.sourceNode.type === 'router' ? getRouterDataKind(source.sourceNode, context) : port?.kind;
    if (sourceKind === 'image' && getNodeImageAssetId(source.sourceNode, context)) add('image');
    else if (sourceKind === 'audio' && getNodeAudioAssetId(source.sourceNode, context)) add('audio');
    else if (sourceKind === 'video' && getNodeVideoAssetId(source.sourceNode, source.sourcePortId, context)) add('video');
    else if (sourceKind === 'subject' && getNodeSubjectResult(source.sourceNode, context)) add('subject');
    else if (sourceKind === 'location' && getNodeLocationResult(source.sourceNode, context)) add('location');
    else if (sourceKind === 'publication' && getNodePublicationResult(source.sourceNode, context)) add('publication');
    else if (getNodeTextResult(source.sourceNode, source.sourcePortId, context)) add('text');
  }

  if (counts.size === 0) return { kind: 'empty', label: 'Empty', state: 'empty' };
  const entries = Array.from(counts.entries());
  return {
    kind: entries.length === 1 ? entries[0][0] : 'mixed',
    label: entries.map(([kind, count]) => `${LABELS[kind]} · ${count}`).join(' + '),
    state: 'ready',
    ...(entries.some(([kind]) => kind === 'image' || kind === 'video' || kind === 'audio')
      ? { sourceLabels: incoming.map((source) => source.sourceNode.data.title), sourceEdgeIds: incoming.map((source) => source.edge.id) } : {}),
  };
}
