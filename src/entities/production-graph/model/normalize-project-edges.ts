import { getTelegramMediaInputPortId } from './node-definitions';
import type { GraphEdge, ProductionNode } from './types';

export function normalizeProjectEdge(edge: GraphEdge, nodes: ProductionNode[]) {
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const target = nodes.find((node) => node.id === edge.targetNodeId);
  const shouldRenameImageOutput = (
    (source?.type === 'cropImage' || source?.type === 'curves' || source?.type === 'frequencyRetouch' || source?.type === 'removeBackground')
    && edge.sourcePortId === 'image'
  );
  const sourcePortId = shouldRenameImageOutput
    ? 'result'
    : edge.sourcePortId === 'preset' ? 'result' : edge.sourcePortId;
  const targetPortId = target?.type === 'textConcat' && edge.targetPortId === 'text'
    ? 'text-0'
    : target?.type === 'telegramPublication' && edge.targetPortId === 'media'
    ? getTelegramMediaInputPortId(0)
    : target?.type === 'exportImage' && edge.targetPortId === 'image'
    ? 'image-0'
    : target?.type === 'generateImage' && edge.targetPortId === 'subject' ? 'actors'
    : edge.targetPortId === 'reference' ? 'style' : edge.targetPortId;

  return {
    ...edge,
    sourcePortId: source?.type === 'textSplitter' && sourcePortId === 'result' ? 'item-0' : sourcePortId,
    targetPortId,
  };
}
