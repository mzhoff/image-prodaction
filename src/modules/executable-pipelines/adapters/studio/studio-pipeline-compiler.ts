import { getNodeIdsInsideSectionTree } from '@/entities/production-graph/model/graph-section-membership';
import { getNodePorts, getTextPromptVariables } from '@/entities/production-graph/model/node-definitions';
import type {
  GenerateImageNodeData,
  GraphEdge,
  GraphProject,
  ImageToTextNodeData,
  ProductionNode,
  TextConcatNodeData,
  TextGenerationNodeData,
  TextPromptNodeData,
} from '@/entities/production-graph/model/types';
import type {
  ExecutablePipelineDefinition,
  PipelineInputBinding,
  PipelineNodeDefinition,
  PipelineValue,
  PipelineValueKind,
} from '../../contracts/pipeline-contracts';
import type {
  StudioPipelineBoundary,
  StudioPipelineSourceMetadata,
} from '../../contracts/pipeline-publication-contracts';
import { PipelineDomainError } from '../../contracts/pipeline-errors';
import { compilePipelineDefinition } from '../../core/pipeline-compiler';

export interface CompiledStudioPipeline {
  compiledPlan: ReturnType<typeof compilePipelineDefinition>;
  sourceMetadata: StudioPipelineSourceMetadata;
}

const BOUNDARY_INPUT_TYPES = new Set<ProductionNode['type']>(['importImage', 'textPrompt']);
const SINK_TYPES = new Set<ProductionNode['type']>(['preview']);

export function compileStudioSection(project: GraphProject, sectionId: string): CompiledStudioPipeline {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) throw invalidPipeline('Секция не найдена в текущем документе.');

  const nodeIdSet = new Set(getNodeIdsInsideSectionTree(sectionId, project.sections, project.nodes));
  const nodes = project.nodes.filter((node) => nodeIdSet.has(node.id));
  if (nodes.length === 0) throw invalidPipeline('В секции нет нод для публикации.');

  const crossingEdge = project.edges.find((edge) => (
    nodeIdSet.has(edge.sourceNodeId) !== nodeIdSet.has(edge.targetNodeId)
  ));
  if (crossingEdge) {
    throw invalidPipeline('Секция связана с нодами за её пределами. Перемести весь исполняемый граф внутрь секции.');
  }

  const edges = project.edges.filter((edge) => (
    nodeIdSet.has(edge.sourceNodeId) && nodeIdSet.has(edge.targetNodeId)
  ));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByNode = groupEdges(edges, 'targetNodeId');
  const outgoingByNode = groupEdges(edges, 'sourceNodeId');
  const usedInputNames = new Set<string>();
  const boundaryInputs = nodes.filter((node) => (
    BOUNDARY_INPUT_TYPES.has(node.type)
    && (incomingByNode.get(node.id)?.length ?? 0) === 0
  ));
  const inputNameByNodeId = new Map<string, string>();
  const inputs: Record<string, { kind: PipelineValueKind; required: boolean; description: string }> = {};
  const inputBoundaries = boundaryInputs.map((node) => {
    const port = getNodePorts(node).find((candidate) => candidate.side === 'output');
    if (!port || (port.kind !== 'text' && port.kind !== 'image')) {
      throw invalidPipeline(`Нода «${getNodeTitle(node)}» не может стать входом endpoint.`);
    }
    const name = createUniqueKey(getNodeTitle(node), 'input', usedInputNames);
    inputNameByNodeId.set(node.id, name);
    inputs[name] = {
      kind: port.kind,
      required: true,
      description: `Вход из ноды «${getNodeTitle(node)}».`,
    };
    return createBoundary(node, port.id, name, port.kind);
  });

  const runtimeNodes = nodes.filter((node) => !inputNameByNodeId.has(node.id) && !SINK_TYPES.has(node.type));
  const runtimeNodeIdSet = new Set(runtimeNodes.map((node) => node.id));
  const definitionNodes = runtimeNodes.map((node) => createRuntimeNodeDefinition({
    edges: incomingByNode.get(node.id) ?? [],
    inputNameByNodeId,
    node,
    nodeById,
    runtimeNodeIdSet,
  }));

  const usedOutputNames = new Set<string>();
  const outputBoundaries: StudioPipelineBoundary[] = [];
  const outputs: ExecutablePipelineDefinition['outputs'] = {};
  const leafNodes = nodes.filter((node) => (outgoingByNode.get(node.id)?.length ?? 0) === 0);

  for (const leaf of leafNodes) {
    const resolved = resolveLeafOutput(leaf, incomingByNode.get(leaf.id) ?? [], nodeById, runtimeNodeIdSet);
    if (!resolved) continue;
    const name = createUniqueKey(getNodeTitle(leaf), 'output', usedOutputNames);
    outputs[name] = { nodeId: resolved.node.id, outputKey: resolved.outputKey };
    outputBoundaries.push(createBoundary(leaf, resolved.portId, name, resolved.kind));
  }

  if (boundaryInputs.length === 0) {
    throw invalidPipeline('Не найден вход. Добавь в начало секции Text Prompt или Import Image.');
  }
  if (definitionNodes.length === 0) {
    throw invalidPipeline('После входа должна быть хотя бы одна исполняемая нода.');
  }
  if (outputBoundaries.length === 0) {
    throw invalidPipeline('Не найден результат. Заверши граф нодой с текстовым или графическим выходом.');
  }

  const definition: ExecutablePipelineDefinition = {
    schemaVersion: 1,
    inputs,
    nodes: definitionNodes,
    outputs,
  };

  return {
    compiledPlan: compilePipelineDefinition(definition),
    sourceMetadata: {
      sectionId: section.id,
      sectionTitle: section.title,
      nodeCount: nodes.length,
      inputs: inputBoundaries,
      outputs: outputBoundaries,
    },
  };
}

function createRuntimeNodeDefinition(input: {
  edges: GraphEdge[];
  inputNameByNodeId: ReadonlyMap<string, string>;
  node: ProductionNode;
  nodeById: ReadonlyMap<string, ProductionNode>;
  runtimeNodeIdSet: ReadonlySet<string>;
}): PipelineNodeDefinition {
  const descriptor = getRuntimeDescriptor(input.node);
  const bindings: Record<string, PipelineInputBinding> = {};
  const inputCounts = new Map<string, number>();

  for (const edge of input.edges) {
    const source = input.nodeById.get(edge.sourceNodeId);
    if (!source) continue;
    const count = inputCounts.get(edge.targetPortId) ?? 0;
    inputCounts.set(edge.targetPortId, count + 1);
    const inputKey = count === 0 ? edge.targetPortId : `${edge.targetPortId}.${count + 1}`;
    const pipelineInputName = input.inputNameByNodeId.get(source.id);

    if (pipelineInputName) {
      bindings[inputKey] = { source: 'pipeline-input', inputKey: pipelineInputName };
      continue;
    }
    if (!input.runtimeNodeIdSet.has(source.id)) {
      throw invalidPipeline(`Нода «${getNodeTitle(source)}» не поддерживается как источник серверной операции.`);
    }
    const sourceOutput = getRuntimeOutput(source, edge.sourcePortId);
    if (!sourceOutput) {
      throw invalidPipeline(`Выход «${edge.sourcePortId}» ноды «${getNodeTitle(source)}» нельзя исполнить на сервере.`);
    }
    bindings[inputKey] = {
      source: 'node-output',
      nodeId: source.id,
      outputKey: sourceOutput.outputKey,
    };
  }

  return {
    id: input.node.id,
    handlerType: descriptor.handlerType,
    handlerVersion: '1',
    config: descriptor.config,
    inputs: bindings,
  };
}

function getRuntimeDescriptor(node: ProductionNode): { handlerType: string; config: Record<string, PipelineValue> } {
  switch (node.type) {
    case 'textPrompt': {
      const data = node.data as TextPromptNodeData;
      return {
        handlerType: 'text.template.render',
        config: {
          template: data.text ?? '',
          variables: getTextPromptVariables(node).map((variable) => ({ id: variable.id, alias: variable.alias })),
        },
      };
    }
    case 'textConcat': {
      const data = node.data as TextConcatNodeData;
      return {
        handlerType: 'text.concat',
        config: {
          separator: data.separator,
          customSeparator: data.customSeparator ?? '',
          prefix: data.prefix ?? '',
          suffix: data.suffix ?? '',
        },
      };
    }
    case 'textGeneration': {
      const data = node.data as TextGenerationNodeData;
      return {
        handlerType: 'ai.text.generate',
        config: {
          model: data.model,
          instruction: data.instruction,
          outputStyle: data.outputStyle,
          reasoning: data.reasoning ?? 'low',
          temperature: data.temperature ?? 1,
        },
      };
    }
    case 'imageToText': {
      const data = node.data as ImageToTextNodeData;
      return {
        handlerType: 'ai.image.analyze',
        config: {
          model: data.model ?? '',
          preset: data.preset ?? 'default',
          prompt: data.prompt ?? '',
        },
      };
    }
    case 'generateImage': {
      const data = node.data as GenerateImageNodeData;
      return {
        handlerType: 'ai.image.generate',
        config: {
          model: data.model,
          prompt: data.prompt ?? '',
          aspectRatio: data.aspectRatio,
          size: data.size,
        },
      };
    }
    default:
      throw invalidPipeline(`Нода «${getNodeTitle(node)}» (${node.type}) пока не имеет серверного исполнителя.`);
  }
}

function resolveLeafOutput(
  leaf: ProductionNode,
  incomingEdges: GraphEdge[],
  nodeById: ReadonlyMap<string, ProductionNode>,
  runtimeNodeIdSet: ReadonlySet<string>,
) {
  if (leaf.type === 'preview') {
    const edge = incomingEdges[0];
    const source = edge ? nodeById.get(edge.sourceNodeId) : undefined;
    if (!edge || !source || !runtimeNodeIdSet.has(source.id)) return null;
    const output = getRuntimeOutput(source, edge.sourcePortId);
    return output ? { ...output, node: source, portId: 'image' } : null;
  }

  if (!runtimeNodeIdSet.has(leaf.id)) return null;
  const port = getNodePorts(leaf).find((candidate) => candidate.side === 'output');
  if (!port) return null;
  const output = getRuntimeOutput(leaf, port.id);
  return output ? { ...output, node: leaf, portId: port.id } : null;
}

function getRuntimeOutput(node: ProductionNode, sourcePortId: string): { kind: PipelineValueKind; outputKey: string } | null {
  if (node.type === 'textPrompt' && sourcePortId === 'text') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textConcat' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'textGeneration' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'imageToText' && sourcePortId === 'result') return { kind: 'text', outputKey: 'text' };
  if (node.type === 'generateImage' && sourcePortId === 'image') return { kind: 'image', outputKey: 'image' };
  return null;
}

function createBoundary(
  node: ProductionNode,
  portId: string,
  name: string,
  kind: PipelineValueKind,
): StudioPipelineBoundary {
  return {
    nodeId: node.id,
    nodeTitle: getNodeTitle(node),
    portId,
    name,
    kind,
  };
}

function groupEdges(edges: GraphEdge[], key: 'sourceNodeId' | 'targetNodeId') {
  const grouped = new Map<string, GraphEdge[]>();
  for (const edge of edges) grouped.set(edge[key], [...(grouped.get(edge[key]) ?? []), edge]);
  return grouped;
}

function createUniqueKey(value: string, fallback: string, used: Set<string>) {
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback;
  let candidate = /^[a-z]/.test(normalized) ? normalized : `${fallback}_${normalized}`;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${normalized}_${suffix++}`;
  used.add(candidate);
  return candidate;
}

function getNodeTitle(node: ProductionNode) {
  return node.data.title?.trim() || node.type;
}

function invalidPipeline(message: string) {
  return new PipelineDomainError({ code: 'pipeline_definition_invalid', message });
}
