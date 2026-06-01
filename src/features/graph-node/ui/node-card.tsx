'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { AdjustmentNode } from './nodes/adjustment-node';
import { CropNode } from './nodes/crop-node';
import { ExportImageNode } from './nodes/export-image-node';
import { GenerateImageNode } from './nodes/generate-image-node';
import { ImageToTextNode } from './nodes/image-to-text-node';
import { ImportImageNode } from './nodes/import-image-node';
import { PreviewNode } from './nodes/preview-node';
import { RefineImageNode } from './nodes/refine-image-node';
import { ReferenceComposerNode } from './nodes/reference-composer-node';
import { RemoveBackgroundNode } from './nodes/remove-background-node';
import { SketchNode } from './nodes/sketch-node';
import { TextPromptNode } from './nodes/text-prompt-node';
import { getPortTop } from './port-button';

interface NodeCardProps {
  node: ProductionNode;
  selected: boolean;
  onStartDrag: (node: ProductionNode, event: ReactPointerEvent<HTMLElement>) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onContextMenu: (node: ProductionNode, event: ReactMouseEvent) => void;
  generateComposingOpen?: boolean;
  onGenerateComposingOpenChange?: (open: boolean) => void;
}

type NodeRenderer = (props: NodeCardProps) => ReactNode;

const nodeRenderers: Record<ProductionNodeType, NodeRenderer> = {
  importImage: ({ node }) => <ImportImageNode node={node} />,
  textPrompt: ({ node, onStartConnection }) => <TextPromptNode node={node} onStartConnection={onStartConnection} />,
  imageToText: ({ node, onStartConnection }) => <ImageToTextNode node={node} onStartConnection={onStartConnection} />,
  referenceComposer: ({ node }) => <ReferenceComposerNode node={node} />,
  sketch: ({ node }) => <SketchNode node={node} />,
  cropImage: ({ node }) => <CropNode node={node} />,
  adjustment: ({ node }) => <AdjustmentNode node={node} />,
  refineImage: ({ node }) => <RefineImageNode node={node} />,
  removeBackground: ({ node }) => <RemoveBackgroundNode node={node} />,
  generateImage: ({ node, generateComposingOpen = true, onGenerateComposingOpenChange, onStartConnection }) => (
    <GenerateImageNode
      node={node}
      composingOpen={generateComposingOpen}
      onComposingOpenChange={onGenerateComposingOpenChange ?? (() => undefined)}
      onStartConnection={onStartConnection}
    />
  ),
  exportImage: ({ node }) => <ExportImageNode node={node} />,
  preview: ({ node }) => <PreviewNode node={node} />,
};

export function NodeCard({
  node,
  selected,
  onStartDrag,
  onStartConnection,
  onContextMenu,
  generateComposingOpen = true,
  onGenerateComposingOpenChange,
}: NodeCardProps) {
  const ports = getNodePorts(node);
  const renderNode = nodeRenderers[node.type];
  const visiblePorts = ports.filter((port) => {
    if (node.type === 'generateImage' && port.side === 'input') return false;
    if (node.type === 'imageToText' && port.id === 'result') return false;
    if (node.type === 'textPrompt' && port.id === 'text') return false;
    return true;
  });

  return (
    <article
      data-node-id={node.id}
      className={cn('production-node', selected && 'production-node-selected')}
      style={{ left: node.position.x, top: node.position.y, width: node.size.width }}
      onPointerDown={(event) => onStartDrag(node, event)}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      {visiblePorts.map((port) => {
        const sideIndex = ports.filter((item) => item.side === port.side).findIndex((item) => item.id === port.id);
        return (
          <button
            key={`${port.side}:${port.id}`}
            type="button"
            className={cn('node-port', `node-port-${port.side}`, `node-port-${port.kind}`)}
            style={{ top: getPortTop(node, port.side, sideIndex) }}
            data-port-node-id={node.id}
            data-port-id={port.id}
            data-port-side={port.side}
            aria-label={`${port.label} ${port.side}`}
            title={`${port.label} (${port.kind})`}
            onPointerDown={(event) => onStartConnection(node.id, port.id, event)}
          />
        );
      })}
      {renderNode({
        node,
        selected,
        onStartDrag,
        onStartConnection,
        onContextMenu,
        generateComposingOpen,
        onGenerateComposingOpenChange,
      })}
    </article>
  );
}
