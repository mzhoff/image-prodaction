import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { NodeCard } from '@/features/graph-node/ui/node-card';
import { useEventCallback } from '@/shared/lib/use-event-callback';

interface CanvasNodeLayerProps {
  collapsedGenerateComposingNodeIds: Set<string>;
  nodes: ProductionNode[];
  onGenerateComposingOpenChange: (nodeId: string, open: boolean) => void;
  onNodeContextMenu: (node: ProductionNode, event: ReactMouseEvent) => void;
  onNodeOptionsMenu: (node: ProductionNode, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onStartDrag: (node: ProductionNode, event: ReactPointerEvent<HTMLElement>) => void;
  selectedSet: Set<string>;
}

export function CanvasNodeLayer({
  collapsedGenerateComposingNodeIds,
  nodes,
  onGenerateComposingOpenChange,
  onNodeContextMenu,
  onNodeOptionsMenu,
  onStartConnection,
  onStartDrag,
  selectedSet,
}: CanvasNodeLayerProps) {
  const drag = useEventCallback(onStartDrag);
  const connect = useEventCallback(onStartConnection);
  const context = useEventCallback(onNodeContextMenu);
  const options = useEventCallback(onNodeOptionsMenu);
  const composing = useEventCallback(onGenerateComposingOpenChange);
  return (
    <>
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          node={node}
          selected={selectedSet.has(node.id)}
          onStartDrag={drag}
          onStartConnection={connect}
          onContextMenu={context}
          onOptionsMenu={options}
          generateComposingOpen={!collapsedGenerateComposingNodeIds.has(node.id)}
          onGenerateComposingOpenChange={composing}
        />
      ))}
    </>
  );
}
