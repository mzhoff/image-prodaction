'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { ExportImageNode } from './nodes/export-image-node';
import { GenerateImageNode } from './nodes/generate-image-node';
import { ImageToTextNode } from './nodes/image-to-text-node';
import { ImportImageNode } from './nodes/import-image-node';
import { PreviewNode } from './nodes/preview-node';
import { ReferenceComposerNode } from './nodes/reference-composer-node';
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
            key={port.id}
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
      {node.type === 'importImage' ? <ImportImageNode node={node} /> : null}
      {node.type === 'textPrompt' ? <TextPromptNode node={node} onStartConnection={onStartConnection} /> : null}
      {node.type === 'imageToText' ? <ImageToTextNode node={node} onStartConnection={onStartConnection} /> : null}
      {node.type === 'referenceComposer' ? <ReferenceComposerNode node={node} /> : null}
      {node.type === 'generateImage' ? (
        <GenerateImageNode
          node={node}
          composingOpen={generateComposingOpen}
          onComposingOpenChange={onGenerateComposingOpenChange ?? (() => undefined)}
          onStartConnection={onStartConnection}
        />
      ) : null}
      {node.type === 'exportImage' ? <ExportImageNode node={node} /> : null}
      {node.type === 'preview' ? <PreviewNode node={node} /> : null}
    </article>
  );
}
