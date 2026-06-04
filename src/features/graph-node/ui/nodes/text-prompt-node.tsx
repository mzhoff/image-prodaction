'use client';

import { Maximize2, Minimize2 } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import type { ProductionNode, TextPromptNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { CollapsibleSection } from '@/shared/ui/collapsible-section';
import { PromptBox } from '@/shared/ui/prompt-box';
import { NodeTitle, NodeTitleActions, NodeTitleOptionsButton } from '../node-title';
import { PortButton } from '../port-button';

interface TextPromptNodeProps {
  node: ProductionNode;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export function TextPromptNode({ node, onStartConnection }: TextPromptNodeProps) {
  const data = node.data as TextPromptNodeData;
  const updateTextPrompt = useProductionGraphStore((state) => state.updateTextPrompt);
  const [promptOpen, setPromptOpen] = useState(true);

  return (
    <>
      <NodeTitle
        title={data.title}
        muted
        action={(
          <NodeTitleActions>
            <button
              type="button"
              className="node-title-action"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setPromptOpen((open) => !open);
              }}
              aria-label={promptOpen ? 'Collapse all sections' : 'Expand all sections'}
            >
              {promptOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
            <NodeTitleOptionsButton />
          </NodeTitleActions>
        )}
      />
      <CollapsibleSection
        title="Prompt"
        open={promptOpen}
        onOpenChange={setPromptOpen}
        sidePort={<PortButton nodeId={node.id} portId="text" side="output" kind="text" label="Text" className="node-port-section" onStartConnection={onStartConnection} />}
      >
        <PromptBox value={data.text} onChange={(value) => updateTextPrompt(node.id, value)} />
      </CollapsibleSection>
    </>
  );
}
