import { getTextPromptVariables } from '@/entities/production-graph/model/node-definitions';
import { getNodeDefinition } from '@/entities/production-graph/model/node-registry';
import type {
  ExportImageNodeData,
  GenerateImageNodeData,
  GraphEdge,
  ImageToTextNodeData,
  ProductionNode,
  TextConcatNodeData,
  TextFormatterNodeData,
  TextGenerationNodeData,
  TextPromptNodeData,
  TextSplitterNodeData,
} from '@/entities/production-graph/model/types';
import type { PipelineValue } from '../../contracts/pipeline-contracts';
import {
  getNodeTitle,
  invalidPipeline,
  resolveTransparentSource,
} from './studio-graph-resolution';

export function getRuntimeDescriptor(
  node: ProductionNode,
  graph: {
    edges: GraphEdge[];
    incomingByNode: ReadonlyMap<string, GraphEdge[]>;
    nodeById: ReadonlyMap<string, ProductionNode>;
  },
): { handlerType: string; config: Record<string, PipelineValue> } {
  switch (node.type) {
    case 'textPrompt': {
      const data = node.data as TextPromptNodeData;
      return { handlerType: 'text.template.render', config: {
        template: data.text ?? '', variables: getTextPromptRuntimeVariables(node, graph),
      } };
    }
    case 'textConcat': {
      const data = node.data as TextConcatNodeData;
      return { handlerType: 'text.concat', config: {
        separator: data.separator, customSeparator: data.customSeparator ?? '',
        prefix: data.prefix ?? '', suffix: data.suffix ?? '',
      } };
    }
    case 'textGeneration': {
      const data = node.data as TextGenerationNodeData;
      return { handlerType: 'ai.text.generate', config: {
        model: data.model, instruction: data.instruction, outputStyle: data.outputStyle,
        reasoning: data.reasoning ?? 'low', temperature: data.temperature ?? 1,
      } };
    }
    case 'textSplitter': {
      const data = node.data as TextSplitterNodeData;
      return { handlerType: 'text.split', config: {
        activeItemIndex: data.activeItemIndex ?? 0, delimiter: data.delimiter, mode: data.mode,
      } };
    }
    case 'textFormatter': {
      const data = node.data as TextFormatterNodeData;
      return { handlerType: 'text.format', config: {
        fallbackText: data.result || data.plainText || data.sourceText || '', presetId: data.presetId,
      } };
    }
    case 'imageToText': {
      const data = node.data as ImageToTextNodeData;
      return { handlerType: 'ai.image.analyze', config: {
        model: data.model ?? '', preset: data.preset ?? 'default', prompt: data.prompt ?? '',
      } };
    }
    case 'generateImage': {
      const data = node.data as GenerateImageNodeData;
      return { handlerType: 'ai.image.generate', config: {
        model: data.model, prompt: data.prompt ?? '', aspectRatio: data.aspectRatio, size: data.size,
      } };
    }
    case 'exportImage': {
      const data = node.data as ExportImageNodeData;
      return { handlerType: 'image.export', config: {
        background: data.background, format: data.format, quality: data.quality, scale: data.scale,
      } };
    }
    default:
      throw invalidPipeline(`Нода «${getNodeTitle(node)}» (${node.type}) пока не имеет серверного исполнителя.`);
  }
}

function getTextPromptRuntimeVariables(
  node: ProductionNode,
  graph: {
    edges: GraphEdge[];
    incomingByNode: ReadonlyMap<string, GraphEdge[]>;
    nodeById: ReadonlyMap<string, ProductionNode>;
  },
) {
  return getTextPromptVariables(node).map((variable) => {
    const edge = graph.edges.find((candidate) => (
      candidate.targetNodeId === node.id && candidate.targetPortId === variable.id
    ));
    const source = edge
      ? resolveTransparentSource(edge, graph.incomingByNode, graph.nodeById)?.source
      : undefined;
    const sourceAlias = getCustomTextPromptSourceAlias(source);
    const alias = sourceAlias ?? variable.alias;
    return {
      id: variable.id,
      alias,
      ...(sourceAlias && sourceAlias !== variable.alias ? { mentionAliases: [variable.alias] } : {}),
    };
  });
}

function getCustomTextPromptSourceAlias(source: ProductionNode | undefined) {
  const title = source?.data.title?.trim();
  if (!source || !title) return undefined;
  return title === getNodeDefinition(source.type).title ? undefined : title;
}
