import { createId } from '@/shared/lib/id';
import { createDefaultNodeSize } from './node-layout';
import { createDefaultNodeData } from './node-registry';
import type { GraphPoint, ProductionNode, ProductionNodeType } from './types';

export function createDefaultNode(type: ProductionNodeType, position: GraphPoint): ProductionNode {
  const id = createId('node');
  return {
    id,
    type,
    position,
    status: 'idle',
    size: createDefaultNodeSize(type),
    data: createDefaultNodeData(type),
  };
}
