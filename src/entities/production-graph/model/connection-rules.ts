import { getPortById } from './node-definitions';
import type { GraphEdge, ProductionNode } from './types';
import type { ConnectResult } from './store-types';

export const MAX_GENERATE_IMAGE_REFERENCES = 4;

export function getPortByNodeId(nodes: ProductionNode[], nodeId: string, portId: string) {
  const node = nodes.find((item) => item.id === nodeId);
  return node ? getPortById(node, portId) : undefined;
}

export function validateGenerateImageReferenceLimit(params: {
  edges: GraphEdge[];
  nodes: ProductionNode[];
  sourceNodeId: string;
  sourcePortId: string;
  target: ProductionNode;
  targetNodeId: string;
  targetPortId: string;
}): ConnectResult | null {
  const { edges, nodes, sourceNodeId, sourcePortId, target, targetNodeId, targetPortId } = params;
  const sourcePort = getPortByNodeId(nodes, sourceNodeId, sourcePortId);
  if (target.type !== 'generateImage' || sourcePort?.kind !== 'image') return null;

  const incomingImageKey = `${sourceNodeId}:${sourcePortId}`;
  if (targetPortId === 'actors') {
    const currentActorImageReferences = getIncomingImageReferences(edges, nodes, targetNodeId, 'actors').size;
    const alreadyConnected = edges.some((edge) => (
      edge.targetNodeId === targetNodeId
      && edge.targetPortId === 'actors'
      && `${edge.sourceNodeId}:${edge.sourcePortId}` === incomingImageKey
    ));

    if (currentActorImageReferences >= 3 && !alreadyConnected) {
      return {
        ok: false,
        reason: 'В Actors можно подключить не больше 3 image reference. Для остальных деталей лучше использовать текстовые Extract-пресеты.',
      };
    }
  }

  const currentImageReferences = getIncomingImageReferences(edges, nodes, targetNodeId);
  if (currentImageReferences.size >= MAX_GENERATE_IMAGE_REFERENCES && !currentImageReferences.has(incomingImageKey)) {
    return {
      ok: false,
      reason: `В Generate Image можно подключить не больше ${MAX_GENERATE_IMAGE_REFERENCES} image reference. Лишние изображения лучше заменить текстовым описанием через Extract.`,
    };
  }

  return null;
}

function getIncomingImageReferences(edges: GraphEdge[], nodes: ProductionNode[], targetNodeId: string, targetPortId?: string) {
  return new Set(edges.filter((edge) => {
    if (edge.targetNodeId !== targetNodeId) return false;
    if (targetPortId && edge.targetPortId !== targetPortId) return false;
    const port = getPortByNodeId(nodes, edge.sourceNodeId, edge.sourcePortId);
    return port?.kind === 'image';
  }).map((edge) => `${edge.sourceNodeId}:${edge.sourcePortId}`));
}
