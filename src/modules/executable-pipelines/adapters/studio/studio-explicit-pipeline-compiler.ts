import {
  canConnectPorts,
  getPortById,
} from '@/entities/production-graph/model/node-definitions';
import { getPipelineFieldPortId } from '@/entities/production-graph/model/pipeline-contract-fields';
import type {
  GraphEdge,
  GraphProject,
  PipelineContractField,
  PipelineInputNodeData,
  PipelineOutputNodeData,
  ProductionNode,
} from '@/entities/production-graph/model/types';
import type {
  ExecutablePipelineDefinition,
  PipelineJsonSchema,
  PipelineValueContract,
} from '../../contracts/pipeline-contracts';
import type { PipelineCompilerOptions } from '../../core/pipeline-compiler';
import { compilePipelineDefinition } from '../../core/pipeline-compiler';
import {
  createBoundary,
  getRuntimeOutput,
  invalidPipeline,
  resolveTransparentSource,
} from './studio-graph-resolution';
import { createRuntimeNodeDefinition, sourcePortKey } from './studio-runtime-node-definition';

const EXPLICIT_BOUNDARY_TYPES = new Set<ProductionNode['type']>(['pipelineInput', 'pipelineOutput']);
const SINK_TYPES = new Set<ProductionNode['type']>(['preview']);

export function compileExplicitStudioSection(input: {
  edges: GraphEdge[];
  incomingByNode: ReadonlyMap<string, GraphEdge[]>;
  nodeById: ReadonlyMap<string, ProductionNode>;
  nodes: ProductionNode[];
  options: PipelineCompilerOptions;
  section: GraphProject['sections'][number];
}) {
  const inputNodes = input.nodes.filter((node) => node.type === 'pipelineInput');
  const outputNodes = input.nodes.filter((node) => node.type === 'pipelineOutput');
  if (inputNodes.length !== 1 || outputNodes.length !== 1) {
    throw invalidPipeline('Явный pipeline должен содержать ровно одну ноду Pipeline Input и одну ноду Pipeline Output.');
  }
  const inputNode = inputNodes[0]!;
  const outputNode = outputNodes[0]!;
  validateExplicitBoundaryEdges(input.edges, input.nodeById, inputNode, outputNode);

  const inputFields = validateBoundaryFields(
    (inputNode.data as PipelineInputNodeData).fields,
    'Pipeline Input',
  );
  const outputFields = validateBoundaryFields(
    (outputNode.data as PipelineOutputNodeData).fields,
    'Pipeline Output',
  );
  const inputNameBySourcePort = new Map<string, string>();
  const inputs: ExecutablePipelineDefinition['inputs'] = {};
  const inputBoundaries = inputFields.map((field) => {
    const portId = getPipelineFieldPortId(field.id);
    inputNameBySourcePort.set(sourcePortKey(inputNode.id, portId), field.key);
    inputs[field.key] = contractFromField(field);
    return createBoundary(inputNode, portId, field.key, field.kind);
  });

  const runtimeNodes = input.nodes.filter((node) => (
    !EXPLICIT_BOUNDARY_TYPES.has(node.type)
    && !SINK_TYPES.has(node.type)
    && node.type !== 'router'
  ));
  if (runtimeNodes.length === 0) {
    throw invalidPipeline('Между Pipeline Input и Pipeline Output должна быть хотя бы одна исполняемая нода.');
  }
  const runtimeNodeIdSet = new Set(runtimeNodes.map((node) => node.id));
  const definitionNodes = runtimeNodes.map((node) => createRuntimeNodeDefinition({
    edges: input.incomingByNode.get(node.id) ?? [],
    inputNameBySourcePort,
    incomingByNode: input.incomingByNode,
    node,
    nodeById: input.nodeById,
    runtimeNodeIdSet,
  }));

  const outputs: ExecutablePipelineDefinition['outputs'] = {};
  const outputContracts: NonNullable<ExecutablePipelineDefinition['outputContracts']> = {};
  const outputBoundaries = outputFields.map((field) => {
    const portId = getPipelineFieldPortId(field.id);
    outputContracts[field.key] = contractFromField(field);
    const incoming = (input.incomingByNode.get(outputNode.id) ?? [])
      .filter((edge) => edge.targetPortId === portId);
    if (incoming.length > 1) throw invalidPipeline(`Выход «${field.key}» имеет несколько источников.`);
    const edge = incoming[0];
    if (!edge) {
      if (field.required) throw invalidPipeline(`Обязательный выход «${field.key}» не подключён.`);
      return createBoundary(outputNode, portId, field.key, field.kind);
    }
    const resolved = resolveTransparentSource(edge, input.incomingByNode, input.nodeById);
    if (!resolved || !runtimeNodeIdSet.has(resolved.source.id)) {
      throw invalidPipeline(`Выход «${field.key}» должен быть подключён к исполняемой ноде.`);
    }
    const runtimeOutput = getRuntimeOutput(resolved.source, resolved.sourcePortId);
    if (!runtimeOutput) throw invalidPipeline(`Источник выхода «${field.key}» не имеет серверного результата.`);
    outputs[field.key] = { nodeId: resolved.source.id, outputKey: runtimeOutput.outputKey };
    return createBoundary(outputNode, portId, field.key, field.kind);
  });
  if (Object.keys(outputs).length === 0) {
    throw invalidPipeline('Pipeline Output должен содержать хотя бы один подключённый результат.');
  }

  const definition: ExecutablePipelineDefinition = {
    schemaVersion: 1,
    inputs,
    nodes: definitionNodes,
    outputs,
    outputContracts,
  };
  return {
    compiledPlan: compilePipelineDefinition(definition, input.options),
    sourceMetadata: {
      sectionId: input.section.id,
      sectionTitle: input.section.title,
      nodeCount: input.nodes.length,
      inputs: inputBoundaries,
      outputs: outputBoundaries,
    },
  };
}

function validateExplicitBoundaryEdges(
  edges: GraphEdge[],
  nodeById: ReadonlyMap<string, ProductionNode>,
  inputNode: ProductionNode,
  outputNode: ProductionNode,
) {
  if (edges.some((edge) => edge.targetNodeId === inputNode.id)) {
    throw invalidPipeline('Pipeline Input не может принимать связи.');
  }
  if (edges.some((edge) => edge.sourceNodeId === outputNode.id)) {
    throw invalidPipeline('Pipeline Output не может создавать исходящие связи.');
  }
  for (const edge of edges) {
    const source = nodeById.get(edge.sourceNodeId);
    const target = nodeById.get(edge.targetNodeId);
    if (!source || !target || !getPortById(source, edge.sourcePortId)
      || !getPortById(target, edge.targetPortId)
      || !canConnectPorts(source, edge.sourcePortId, target, edge.targetPortId)) {
      throw invalidPipeline(`Связь «${edge.id}» использует несовместимые или неизвестные порты.`);
    }
  }
}

function validateBoundaryFields(fields: PipelineContractField[], label: string) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw invalidPipeline(`${label} должен содержать хотя бы одно поле.`);
  }
  const ids = new Set<string>();
  const keys = new Set<string>();
  for (const field of fields) {
    if (!field.id.trim() || ids.has(field.id)) throw invalidPipeline(`${label} содержит повторяющийся field id.`);
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,119}$/.test(field.key) || keys.has(field.key)) {
      throw invalidPipeline(`${label} содержит некорректный или повторяющийся ключ «${field.key}».`);
    }
    ids.add(field.id);
    keys.add(field.key);
  }
  return fields;
}

function contractFromField(field: PipelineContractField): PipelineValueContract {
  const base: PipelineValueContract = {
    kind: field.kind,
    required: field.required,
    ...(field.description ? { description: field.description } : {}),
    ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
  };
  return field.kind === 'json'
    ? { ...base, schema: objectSchemaFromFields(field.fields ?? []) }
    : base;
}

function objectSchemaFromFields(fields: PipelineContractField[]): PipelineJsonSchema {
  const properties: Record<string, PipelineJsonSchema> = {};
  const required: string[] = [];
  for (const field of validateBoundaryFields(fields, 'JSON object')) {
    properties[field.key] = jsonSchemaFromField(field);
    if (field.required) required.push(field.key);
  }
  return {
    type: 'object', additionalProperties: false, properties,
    ...(required.length ? { required } : {}),
  };
}

function jsonSchemaFromField(field: PipelineContractField): PipelineJsonSchema {
  const description = field.description ? { description: field.description } : {};
  if (field.kind === 'text') return { type: 'string', ...description };
  if (field.kind === 'number') return { type: 'number', ...description };
  if (field.kind === 'boolean') return { type: 'boolean', ...description };
  if (field.kind === 'json') return { ...objectSchemaFromFields(field.fields ?? []), ...description };
  throw invalidPipeline(`Поле изображения «${field.key}» нельзя вложить в JSON object.`);
}
