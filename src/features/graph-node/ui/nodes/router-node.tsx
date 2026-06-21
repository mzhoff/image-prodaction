'use client';

import type { ProductionNode } from '@/entities/production-graph/model/types';
import { NodeTitle } from '../node-title';

interface RouterNodeProps {
  node: ProductionNode;
}

export function RouterNode({ node }: RouterNodeProps) {
  return (
    <div className="router-node-body">
      <NodeTitle title={node.data.title || 'Router'} nodeType="router" />
    </div>
  );
}
