'use client';

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ReactNode } from 'react';
import { memo, useCallback } from 'react';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { getPortTop } from '@/entities/production-graph/model/node-port-layout';
import type { ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';
import { cn } from '@/shared/lib/cn';
import { AdjustmentNode } from './nodes/adjustment-node';
import { AudioNode } from './nodes/audio-nodes';
import { BannerNode } from './nodes/banner-node';
import { CompositionNode } from './nodes/composition-node';
import { CropNode } from './nodes/crop-node';
import { CurvesNode } from './nodes/curves-node';
import { ExportImageNode } from './nodes/export-image-node';
import { FrequencyRetouchNode } from './nodes/frequency-retouch-node';
import { GenerateImageNode } from './nodes/generate-image-node';
import { ImageToTextNode } from './nodes/image-to-text-node';
import { ImportImageNode } from './nodes/import-image-node';
import { IteratorNode } from './nodes/iterator-node';
import { LocationBuilderNode } from './nodes/location-builder-node';
import { PipelineInputNode } from './nodes/pipeline-input-node';
import { PipelineOutputNode } from './nodes/pipeline-output-node';
import { PreviewNode } from './nodes/preview-node';
import { QrCodeNode } from './nodes/qr-code-node';
import { RefineImageNode } from './nodes/refine-image-node';
import { ReferenceComposerNode } from './nodes/reference-composer-node';
import { RemoveBackgroundNode } from './nodes/remove-background-node';
import { RouterNode } from './nodes/router-node';
import { SketchNode } from './nodes/sketch-node';
import { SubjectBuilderNode } from './nodes/subject-builder-node';
import { StructuredOutputNode } from './nodes/structured-output-node';
import { TelegramPublicationNode } from './nodes/telegram-publication-node';
import { TextConcatNode } from './nodes/text-concat-node';
import { TextFormatterNode } from './nodes/text-formatter-node';
import { TextGenerationNode } from './nodes/text-generation-node';
import { TextPromptNode } from './nodes/text-prompt-node';
import { TextSplitterNode } from './nodes/text-splitter-node';
import { TextToSpeechNode } from './nodes/text-to-speech-node';
import { PortButton } from './port-button';
import { NodeTitleNodeIdProvider } from './node-title';
import { TimelineHandoffNode } from './timeline-handoff-node';
import { GenerateVideoNode } from './nodes/generate-video-node';
import { ReverieStoriesNode } from './nodes/reverie-stories-node';

interface NodeCardProps {
  node: ProductionNode;
  selected: boolean;
  onStartDrag: (node: ProductionNode, event: ReactPointerEvent<HTMLElement>) => void;
  onStartConnection: (nodeId: string, portId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onContextMenu: (node: ProductionNode, event: ReactMouseEvent) => void;
  onOptionsMenu: (node: ProductionNode, event: ReactMouseEvent<HTMLButtonElement>) => void;
  generateComposingOpen?: boolean;
  onGenerateComposingOpenChange?: (nodeId: string, open: boolean) => void;
}

type NodeRenderer = (props: NodeCardProps) => ReactNode;

const nodeRenderers: Record<ProductionNodeType, NodeRenderer> = {
  importImage: ({ node, onStartConnection }) => <ImportImageNode node={node} onStartConnection={onStartConnection} />,
  textPrompt: ({ node, onStartConnection }) => <TextPromptNode node={node} onStartConnection={onStartConnection} />,
  textConcat: ({ node, onStartConnection }) => <TextConcatNode node={node} onStartConnection={onStartConnection} />,
  textGeneration: ({ node, onStartConnection }) => <TextGenerationNode node={node} onStartConnection={onStartConnection} />,
  textToSpeech: ({ node, onStartConnection }) => <TextToSpeechNode node={node} onStartConnection={onStartConnection} />,
  speechToText: ({ node, onStartConnection }) => <AudioNode node={node} onStartConnection={onStartConnection} />,
  audioConvert: ({ node, onStartConnection }) => <AudioNode node={node} onStartConnection={onStartConnection} />,
  timelineHandoff: ({ node, onStartConnection }) => <TimelineHandoffNode node={node} onStartConnection={onStartConnection} />,
  reverieStories: ({ node, onStartConnection }) => <ReverieStoriesNode node={node} onStartConnection={onStartConnection} />,
  generateVideo: ({ node, onStartConnection }) => <GenerateVideoNode node={node} onStartConnection={onStartConnection} />,
  textFormatter: ({ node, onStartConnection }) => <TextFormatterNode node={node} onStartConnection={onStartConnection} />,
  textSplitter: ({ node, onStartConnection }) => <TextSplitterNode node={node} onStartConnection={onStartConnection} />,
  pipelineInput: ({ node, onStartConnection }) => <PipelineInputNode node={node} onStartConnection={onStartConnection} />,
  pipelineOutput: ({ node, onStartConnection }) => <PipelineOutputNode node={node} onStartConnection={onStartConnection} />,
  structuredOutput: ({ node, onStartConnection }) => <StructuredOutputNode node={node} onStartConnection={onStartConnection} />,
  router: ({ node }) => <RouterNode node={node} />,
  iterator: ({ node, onStartConnection }) => <IteratorNode node={node} onStartConnection={onStartConnection} />,
  subjectBuilder: ({ node, onStartConnection }) => <SubjectBuilderNode node={node} onStartConnection={onStartConnection} />,
  locationBuilder: ({ node, onStartConnection }) => <LocationBuilderNode node={node} onStartConnection={onStartConnection} />,
  telegramPublication: ({ node, onStartConnection }) => <TelegramPublicationNode node={node} onStartConnection={onStartConnection} />,
  imageToText: ({ node, onStartConnection }) => <ImageToTextNode node={node} onStartConnection={onStartConnection} />,
  qrCode: ({ node }) => <QrCodeNode node={node} />,
  referenceComposer: ({ node }) => <ReferenceComposerNode node={node} />,
  composition: ({ node }) => <CompositionNode node={node} />,
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
      onComposingOpenChange={(open) => onGenerateComposingOpenChange?.(node.id, open)}
      onStartConnection={onStartConnection}
    />
  ),
  exportImage: ({ node }) => <ExportImageNode node={node} />,
  banner: ({ node, selected }) => <BannerNode node={node} selected={selected} />,
  preview: ({ node }) => <PreviewNode node={node} />,
};

export const NodeCard = memo(function NodeCard({
  node,
  selected,
  onStartDrag,
  onStartConnection,
  onContextMenu,
  onOptionsMenu,
  generateComposingOpen = true,
  onGenerateComposingOpenChange,
}: NodeCardProps) {
  const openOptions = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => onOptionsMenu(node, event), [node, onOptionsMenu]);
  const ports = getNodePorts(node);
  const renderNode = nodeRenderers[node.type];
  const visiblePorts = ports.filter((port) => {
    if (node.type === 'generateVideo') return false;
    if (node.type === 'speechToText' || node.type === 'audioConvert' || node.type === 'timelineHandoff' || node.type === 'reverieStories') return false;
    if (node.type === 'generateImage' && port.side === 'input') return false;
    if (node.type === 'imageToText' && port.id === 'result') return false;
    if (node.type === 'textPrompt') return false;
    if (node.type === 'textConcat' || node.type === 'textGeneration' || node.type === 'textToSpeech' || node.type === 'textFormatter' || node.type === 'textSplitter' || node.type === 'pipelineInput' || node.type === 'pipelineOutput' || node.type === 'structuredOutput' || node.type === 'iterator' || node.type === 'subjectBuilder' || node.type === 'locationBuilder' || node.type === 'telegramPublication') return false;
    return true;
  });

  return (
    <article
      data-node-id={node.id}
      className={cn(
        'production-node',
        `production-node-${node.type}`,
        node.type === 'generateVideo' && 'production-node-text-workflow',
        (node.type === 'speechToText' || node.type === 'audioConvert' || node.type === 'timelineHandoff') && 'production-node-text-workflow',
        (node.type === 'textPrompt' || node.type === 'textConcat' || node.type === 'textGeneration' || node.type === 'textToSpeech' || node.type === 'textFormatter' || node.type === 'textSplitter' || node.type === 'pipelineInput' || node.type === 'pipelineOutput' || node.type === 'structuredOutput' || node.type === 'iterator') && 'production-node-text-workflow',
        (node.type === 'pipelineInput' || node.type === 'pipelineOutput' || node.type === 'structuredOutput') && 'production-node-pipeline-contract',
        node.type === 'iterator' && 'production-node-iterator-workflow',
        node.type === 'subjectBuilder' && 'production-node-text-workflow production-node-subject-workflow',
        node.type === 'locationBuilder' && 'production-node-text-workflow production-node-location-workflow',
        node.type === 'telegramPublication' && 'production-node-text-workflow production-node-publication-workflow',
        node.locked && 'production-node-locked',
        selected && 'production-node-selected',
      )}
      style={{
        left: node.position.x,
        top: node.position.y,
        width: node.size.width,
        ...(node.type === 'banner' || node.type === 'router' ? { height: node.size.height } : undefined),
      }}
      onPointerDown={(event) => onStartDrag(node, event)}
      onContextMenu={(event) => onContextMenu(node, event)}
    >
      {visiblePorts.filter(() => !(node.type === 'importImage' && 'mediaKind' in node.data && node.data.mediaKind === 'video')).map((port) => {
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
      <NodeTitleNodeIdProvider nodeId={node.id} onOpenOptionsMenu={openOptions}>
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
});
