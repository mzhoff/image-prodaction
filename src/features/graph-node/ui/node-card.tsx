'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { getPortTop } from '@/entities/production-graph/model/node-port-layout';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { AdjustmentNode } from './nodes/adjustment-node';
import { CropNode } from './nodes/crop-node';
import { CurvesNode } from './nodes/curves-node';
import { ExportImageNode } from './nodes/export-image-node';
import { FrequencyRetouchNode } from './nodes/frequency-retouch-node';
import { GenerateImageNode } from './nodes/generate-image-node';
import { ImageToTextNode } from './nodes/image-to-text-node';
import { ImportImageNode } from './nodes/import-image-node';
import { IteratorNode } from './nodes/iterator-node';
import { LocationBuilderNode } from './nodes/location-builder-node';
import { PreviewNode } from './nodes/preview-node';
import { RefineImageNode } from './nodes/refine-image-node';
import { ReferenceComposerNode } from './nodes/reference-composer-node';
import { RemoveBackgroundNode } from './nodes/remove-background-node';
import { SketchNode } from './nodes/sketch-node';
import { SubjectBuilderNode } from './nodes/subject-builder-node';
import { TelegramPublicationNode } from './nodes/telegram-publication-node';
import { TextConcatNode } from './nodes/text-concat-node';
import { TextFormatterNode } from './nodes/text-formatter-node';
import { TextGenerationNode } from './nodes/text-generation-node';
import { TextPromptNode } from './nodes/text-prompt-node';
import { TextSplitterNode } from './nodes/text-splitter-node';
import { PortButton } from './port-button';
import { NodeTitleNodeIdProvider } from './node-title';

interface NodeCardProps {
  node: ProductionNode;
  selected: boolean;
  onStartDrag: (node: ProductionNode, event: ReactPointerEvent<HTMLElement>) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onContextMenu: (node: ProductionNode, event: ReactMouseEvent) => void;
  onOptionsMenu: (node: ProductionNode, event: ReactMouseEvent<HTMLButtonElement>) => void;
  generateComposingOpen?: boolean;
  onGenerateComposingOpenChange?: (open: boolean) => void;
}

type NodeRenderer = (props: NodeCardProps) => ReactNode;

const nodeRenderers: Record<ProductionNodeType, NodeRenderer> = {
  importImage: ({ node }) => <ImportImageNode node={node} />,
  textPrompt: ({ node, onStartConnection }) => <TextPromptNode node={node} onStartConnection={onStartConnection} />,
  textConcat: ({ node, onStartConnection }) => <TextConcatNode node={node} onStartConnection={onStartConnection} />,
  textGeneration: ({ node, onStartConnection }) => <TextGenerationNode node={node} onStartConnection={onStartConnection} />,
  textFormatter: ({ node, onStartConnection }) => <TextFormatterNode node={node} onStartConnection={onStartConnection} />,
  textSplitter: ({ node, onStartConnection }) => <TextSplitterNode node={node} onStartConnection={onStartConnection} />,
  iterator: ({ node, onStartConnection }) => <IteratorNode node={node} onStartConnection={onStartConnection} />,
  subjectBuilder: ({ node, onStartConnection }) => <SubjectBuilderNode node={node} onStartConnection={onStartConnection} />,
  locationBuilder: ({ node, onStartConnection }) => <LocationBuilderNode node={node} onStartConnection={onStartConnection} />,
  telegramPublication: ({ node, onStartConnection }) => <TelegramPublicationNode node={node} onStartConnection={onStartConnection} />,
  imageToText: ({ node, onStartConnection }) => <ImageToTextNode node={node} onStartConnection={onStartConnection} />,
  referenceComposer: ({ node }) => <ReferenceComposerNode node={node} />,
  sketch: ({ node }) => <SketchNode node={node} />,
  cropImage: ({ node }) => <CropNode node={node} />,
  adjustment: ({ node }) => <AdjustmentNode node={node} />,
  curves: ({ node }) => <CurvesNode node={node} />,
  frequencyRetouch: ({ node }) => <FrequencyRetouchNode node={node} />,
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
  onOptionsMenu,
  generateComposingOpen = true,
  onGenerateComposingOpenChange,
}: NodeCardProps) {
  const ports = getNodePorts(node);
  const renderNode = nodeRenderers[node.type];
  const visiblePorts = ports.filter((port) => {
    if (node.type === 'generateImage' && port.side === 'input') return false;
    if (node.type === 'imageToText' && port.id === 'result') return false;
    if (node.type === 'textPrompt') return false;
    if (node.type === 'textConcat' || node.type === 'textGeneration' || node.type === 'textFormatter' || node.type === 'textSplitter' || node.type === 'iterator' || node.type === 'subjectBuilder' || node.type === 'locationBuilder' || node.type === 'telegramPublication') return false;
    return true;
  });

  return (
    <article
      data-node-id={node.id}
      className={cn(
        'production-node',
        `production-node-${node.type}`,
        (node.type === 'textPrompt' || node.type === 'textConcat' || node.type === 'textGeneration' || node.type === 'textFormatter' || node.type === 'textSplitter' || node.type === 'iterator') && 'production-node-text-workflow',
        node.type === 'iterator' && 'production-node-iterator-workflow',
        node.type === 'subjectBuilder' && 'production-node-text-workflow production-node-subject-workflow',
        node.type === 'locationBuilder' && 'production-node-text-workflow production-node-location-workflow',
        node.type === 'telegramPublication' && 'production-node-text-workflow production-node-publication-workflow',
        node.locked && 'production-node-locked',
        selected && 'production-node-selected',
      )}
      style={{ left: node.position.x, top: node.position.y, width: node.size.width }}
      onPointerDown={(event) => onStartDrag(node, event)}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      {visiblePorts.map((port) => {
        const sideIndex = ports.filter((item) => item.side === port.side).findIndex((item) => item.id === port.id);
        return (
          <PortButton
            key={`${port.side}:${port.id}`}
            nodeId={node.id}
            portId={port.id}
            side={port.side}
            kind={port.kind}
            label={port.label}
            style={{ top: getPortTop(node, port.side, sideIndex) }}
            onStartConnection={onStartConnection}
          />
        );
      })}
      <NodeTitleNodeIdProvider nodeId={node.id} onOpenOptionsMenu={(event) => onOptionsMenu(node, event)}>
        {renderNode({
          node,
          selected,
          onStartDrag,
          onStartConnection,
          onContextMenu,
          onOptionsMenu,
          generateComposingOpen,
          onGenerateComposingOpenChange,
        })}
      </NodeTitleNodeIdProvider>
    </article>
  );
}
