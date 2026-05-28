'use client';

import type { ProductionNode, TextPromptNodeData } from '@/entities/production-graph/model/types';
import { PromptBox } from '@/shared/ui/prompt-box';
import { NodeTitle } from '../node-title';

export function TextPromptNode({ node }: { node: ProductionNode }) {
  const data = node.data as TextPromptNodeData;

  return (
    <>
      <NodeTitle title={data.title} muted />
      <div className="node-block">
        <PromptBox value={data.text} />
      </div>
    </>
  );
}
