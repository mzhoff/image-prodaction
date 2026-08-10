import { getNodeIdsInsideSectionTree } from '@/entities/production-graph/model/graph-section-membership';
import { getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { GraphEdge, GraphProject, ProductionNode } from '@/entities/production-graph/model/types';
import type {
  ExecutablePipelineDefinition,
  PipelineInputBinding,
  PipelineNodeDefinition,
  PipelineValueKind,
} from '../../contracts/pipeline-contracts';
import type {
  StudioPipelineBoundary,
  StudioPipelineSourceMetadata,
} from '../../contracts/pipeline-publication-contracts';
import { compilePipelineDefinition, type PipelineCompilerOptions } from '../../core/pipeline-compiler';
import {
  createBoundary,
  createUniqueKey,
  getNodeTitle,
  getRuntimeOutput,
  groupEdges,
  invalidPipeline,
  resolveLeafOutput,
  resolveTransparentSource,
} from './studio-graph-resolution';
import { getRuntimeDescriptor } from './studio-runtime-descriptor';

export interface CompiledStudioPipeline {
  compiledPlan: ReturnType<typeof compilePipelineDefinition>;
  sourceMetadata: StudioPipelineSourceMetadata;
}

const BOUNDARY_INPUT_TYPES = new Set<ProductionNode['type']>(['importImage', 'textPrompt']);
const SINK_TYPES = new Set<ProductionNode['type']>(['preview']);

export function compileStudioSection(
  project: GraphProject,
  sectionId: string,
  options: PipelineCompilerOptions = {},
): CompiledStudioPipeline {
  const section = project.sections.find((item) => item.id === sectionId);
  if (!section) throw invalidPipeline('Секция не найдена в текущем документе.');
  const nodeIdSet = new Set(getNodeIdsInsideSectionTree(sectionId, project.sections, project.nodes));
  const nodes = project.nodes.filter((node) => nodeIdSet.has(node.id));
  if (nodes.length === 0) throw invalidPipeline('В секции нет нод для публикации.');
  if (project.edges.some((edge) => nodeIdSet.has(edge.sourceNodeId) !== nodeIdSet.has(edge.targetNodeId))) {
    throw invalidPipeline('Секция связана с нодами за её пределами. Перемести весь исполняемый граф внутрь секции.');
  }
  const edges = project.edges.filter((edge) => nodeIdSet.has(edge.sourceNodeId) && nodeIdSet.has(edge.targetNodeId));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByNode = groupEdges(edges, 'targetNodeId');
  const outgoingByNode = groupEdges(edges, 'sourceNodeId');
  const boundary = createInputBoundaries(nodes, incomingByNode);
  const runtimeNodes = nodes.filter((node) => (
    !boundary.inputNameByNodeId.has(node.id) && !SINK_TYPES.has(node.type) && node.type !== 'router'
  ));
  const runtimeNodeIdSet = new Set(runtimeNodes.map((node) => node.id));
  const definitionNodes = runtimeNodes.map((node) => createRuntimeNodeDefinition({
    edges: incomingByNode.get(node.id) ?? [],
    inputNameByNodeId: boundary.inputNameByNodeId,
    incomingByNode,
    node,
    nodeById,
    runtimeNodeIdSet,
  }));
  const output = createOutputBoundaries(nodes, outgoingByNode, incomingByNode, nodeById, runtimeNodeIdSet);
  if (boundary.boundaries.length === 0) {
    throw invalidPipeline('Не найден вход. Добавь в начало секции Text Prompt или Import Image.');
  }
  if (definitionNodes.length === 0) throw invalidPipeline('После входа должна быть хотя бы одна исполняемая нода.');
  if (output.boundaries.length === 0) {
    throw invalidPipeline('Не найден результат. Заверши граф нодой с текстовым или графическим выходом.');
  }
  const definition: ExecutablePipelineDefinition = {
    schemaVersion: 1,
    inputs: boundary.inputs,
    nodes: definitionNodes,
    outputs: output.outputs,
  };
  return {
    compiledPlan: compilePipelineDefinition(definition, options),
    sourceMetadata: {
      sectionId: section.id,
      sectionTitle: section.title,
      nodeCount: nodes.length,
      inputs: boundary.boundaries,
      outputs: output.boundaries,
    },
  };
}

function createInputBoundaries(
  nodes: ProductionNode[],
  incomingByNode: ReadonlyMap<string, GraphEdge[]>,
) {
  const usedNames = new Set<string>();
  const inputNameByNodeId = new Map<string, string>();
  const inputs: Record<string, { kind: PipelineValueKind; required: boolean; description: string }> = {};
  const boundaries = nodes.filter((node) => BOUNDARY_INPUT_TYPES.has(node.type)
    && (incomingByNode.get(node.id)?.length ?? 0) === 0).map((node) => {
    const port = getNodePorts(node).find((candidate) => candidate.side === 'output');
    if (!port || (port.kind !== 'text' && port.kind !== 'image')) {
      throw invalidPipeline(`Нода «${getNodeTitle(node)}» не может стать входом endpoint.`);
    }
    const name = createUniqueKey(getNodeTitle(node), 'input', usedNames);
    inputNameByNodeId.set(node.id, name);
    inputs[name] = { kind: port.kind, required: true, description: `Вход из ноды «${getNodeTitle(node)}».` };
    return createBoundary(node, port.id, name, port.kind);
  });
  return { boundaries, inputNameByNodeId, inputs };
}

function createOutputBoundaries(
  nodes: ProductionNode[],
  outgoingByNode: ReadonlyMap<string, GraphEdge[]>,
  incomingByNode: ReadonlyMap<string, GraphEdge[]>,
  nodeById: ReadonlyMap<string, ProductionNode>,
  runtimeNodeIdSet: ReadonlySet<string>,
) {
  const usedNames = new Set<string>();
  const boundaries: StudioPipelineBoundary[] = [];
  const outputs: ExecutablePipelineDefinition['outputs'] = {};
  for (const leaf of nodes.filter((node) => (outgoingByNode.get(node.id)?.length ?? 0) === 0)) {
    const resolved = resolveLeafOutput(
      leaf, incomingByNode.get(leaf.id) ?? [], incomingByNode, nodeById, runtimeNodeIdSet,
    );
    if (!resolved) continue;
    const name = createUniqueKey(getNodeTitle(leaf), 'output', usedNames);
    outputs[name] = { nodeId: resolved.node.id, outputKey: resolved.outputKey };
    boundaries.push(createBoundary(leaf, resolved.portId, name, resolved.kind));
  }
  return { boundaries, outputs };
}

function createRuntimeNodeDefinition(input: {
  edges: GraphEdge[];
  inputNameByNodeId: ReadonlyMap<string, string>;
  incomingByNode: ReadonlyMap<string, GraphEdge[]>;
  node: ProductionNode;
  nodeById: ReadonlyMap<string, ProductionNode>;
  runtimeNodeIdSet: ReadonlySet<string>;
}): PipelineNodeDefinition {
  const descriptor = getRuntimeDescriptor(input.node, input);
  const bindings: Record<string, PipelineInputBinding> = {};
  const inputCounts = new Map<string, number>();
  for (const edge of input.edges) {
    const resolved = resolveTransparentSource(edge, input.incomingByNode, input.nodeById);
    if (!resolved) continue;
    const count = inputCounts.get(edge.targetPortId) ?? 0;
    inputCounts.set(edge.targetPortId, count + 1);
    const inputKey = count === 0 ? edge.targetPortId : `${edge.targetPortId}.${count + 1}`;
    const pipelineInputName = input.inputNameByNodeId.get(resolved.source.id);
    if (pipelineInputName) {
      bindings[inputKey] = { source: 'pipeline-input', inputKey: pipelineInputName };
      continue;
    }
    if (!input.runtimeNodeIdSet.has(resolved.source.id)) {
      throw invalidPipeline(`Нода «${getNodeTitle(resolved.source)}» не поддерживается как источник серверной операции.`);
    }
    const sourceOutput = getRuntimeOutput(resolved.source, resolved.sourcePortId);
    if (!sourceOutput) {
      throw invalidPipeline(`Выход «${edge.sourcePortId}» ноды «${getNodeTitle(resolved.source)}» нельзя исполнить на сервере.`);
    }
    bindings[inputKey] = {
      source: 'node-output', nodeId: resolved.source.id, outputKey: sourceOutput.outputKey,
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
