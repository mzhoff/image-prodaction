import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type { GraphIoContext } from '@/entities/production-graph/model/graph-io-contracts';
import { getIncomingSources } from '@/entities/production-graph/model/graph-io-sources';
import { getPortById } from '@/entities/production-graph/model/node-definitions';
import type { GenerateVideoNodeData } from '@/entities/production-graph/model/types';
import type { VideoModelCapabilities } from '@/shared/media/video-generation-contracts';

type ImageVideoMode = 'frames' | 'references';

/** Resolve the semantic source even when the wire starts at a transparent Router. */
export function getVideoConnectCreateMode(sourceNodeId: string, sourcePortId: string, context: Pick<GraphIoContext, 'nodes' | 'edges'>): ImageVideoMode | undefined {
  let node = context.nodes.find((entry) => entry.id === sourceNodeId);
  let portId = sourcePortId;
  const visited = new Set<string>();
  while (node?.type === 'router') {
    if (visited.has(node.id)) return undefined;
    visited.add(node.id);
    const incoming = getIncomingSources(node.id, 'input', context);
    if (incoming.length !== 1) return undefined;
    node = incoming[0]!.sourceNode;
    portId = incoming[0]!.sourcePortId;
  }
  if (!node || getPortById(node, portId)?.kind !== 'image') return undefined;
  return node.type === 'timelineHandoff' && portId === 'frames' ? 'references' : 'frames';
}

/** Choose only confirmed live capabilities; no provider call or generation is performed. */
export function prepareVideoConnectCreate(mode: ImageVideoMode, models: VideoModelCapabilities[]) {
  const defaults = createDefaultNode('generateVideo', { x: 0, y: 0 }).data as GenerateVideoNodeData;
  const compatible = models.filter((model) => (mode === 'references' ? model.references : model.firstFrame)
    && model.durations.length && model.resolutions.length && model.aspectRatios.length);
  const model = compatible.find((item) => item.key === defaults.model) ?? compatible[0];
  if (!model) throw new Error(mode === 'references'
    ? 'В каталоге сейчас нет видеомодели с поддержкой референсов. Подключение не создано.'
    : 'В каталоге сейчас нет видеомодели с поддержкой первого кадра. Подключение не создано.');
  return {
    targetPortId: mode === 'references' ? 'reference-1' : 'first-frame',
    data: {
      mode, model: model.key,
      duration: model.durations.includes(defaults.duration) ? defaults.duration : model.durations[0]!,
      resolution: model.resolutions.includes(defaults.resolution) ? defaults.resolution : model.resolutions[0]!,
      aspectRatio: model.aspectRatios.includes(defaults.aspectRatio) ? defaults.aspectRatio : model.aspectRatios[0]!,
      generateAudio: model.audio && defaults.generateAudio,
    } satisfies Partial<GenerateVideoNodeData>,
  };
}
