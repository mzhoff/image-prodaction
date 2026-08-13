import { z } from 'zod';
import { DEFAULT_DOCUMENT_NAME } from '@/entities/document/model/document-lifecycle';
import {
  canConnectPorts,
  getTextConcatInputPortIndex,
} from '@/entities/production-graph/model/node-definitions';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type {
  GraphEdge,
  GraphProject,
  ProductionNode,
  ProductionNodeData,
  ProductionNodeType,
  TextPromptVariable,
} from '@/entities/production-graph/model/types';
import { createId } from '@/shared/lib/id';
import {
  PIPELINE_NODE_CONFIGURABLE_FIELDS,
  type PipelineNodeSetting,
} from '../contracts/image-production-tools';
import { positionPipelineBuildNodes } from './pipeline-layout';

const MAX_PIPELINE_BUILD_NODES = 12;
const MAX_PIPELINE_BUILD_EDGES = 24;
const MAX_SAFE_PRESENTATION_BYTES = 32 * 1024;
const CANVAS_MIN = 80;

const nodeKeySchema = z.string().trim().min(1).max(48).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const shortTextSchema = z.string().trim().min(1).max(120);
const longTextSchema = z.string().trim().max(4_000);
const textPromptVariablesSchema = z.array(z.object({
  alias: z.string().trim().min(1).max(48),
  id: z.string().regex(/^variable-[0-9]$/),
}).strict()).max(10).refine((variables) => (
  new Set(variables.map((variable) => variable.alias.toLocaleLowerCase('ru-RU'))).size === variables.length
), 'Text prompt variable aliases must be unique.').transform((variables) => (
  variables.map((variable, index) => ({ ...variable, id: `variable-${index}` }))
));

const pipelineSettingValueSchemas = {
  aspectRatio: z.string().trim().min(1).max(24),
  background: z.enum(['transparent', 'white', 'black']),
  customSeparator: z.string().max(80),
  delimiter: z.string().max(40),
  format: z.enum(['png', 'jpeg', 'webp']),
  instruction: longTextSchema,
  outputStyle: z.enum(['plain', 'markdown', 'numbered-list']),
  prefix: z.string().max(1_000),
  presetId: z.enum(['universal', 'telegram-post', 'blog-article', 'markdown']),
  prompt: longTextSchema,
  quality: z.string().regex(/^\d{1,3}$/),
  reasoning: z.enum(['low', 'medium', 'high']),
  scale: z.enum(['1', '0.75', '0.5', '0.25']),
  separator: z.enum(['newline', 'double-newline', 'space', 'custom']),
  size: z.string().trim().min(1).max(16),
  suffix: z.string().max(1_000),
  temperature: z.number().min(0).max(2),
  text: longTextSchema,
  title: shortTextSchema,
  variableDisplayMode: z.enum(['source-value', 'value', 'source']),
  variables: textPromptVariablesSchema,
} satisfies Record<PipelineNodeSetting, z.ZodType>;

export type SanitizedPipelineNodeSettingValue = string | number | TextPromptVariable[];
export type SanitizedPipelineNodeSettings = Record<string, SanitizedPipelineNodeSettingValue>;

const pipelineNodeSettingsSchema = z.record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 24, 'Node settings are limited to 24 fields.');

const productionNodeTypeSchema = z.enum(PRODUCTION_NODE_TYPES as [ProductionNodeType, ...ProductionNodeType[]]);

export const pipelineBuildInputSchema = z.object({
  documentName: shortTextSchema,
  summary: z.string().trim().min(4).max(280),
  nodes: z.array(z.object({
    key: nodeKeySchema,
    settings: pipelineNodeSettingsSchema.optional(),
    type: productionNodeTypeSchema,
  }).strict()).min(1).max(MAX_PIPELINE_BUILD_NODES),
  edges: z.array(z.object({
    sourceNodeKey: nodeKeySchema,
    sourcePortId: z.string().trim().min(1).max(80),
    targetNodeKey: nodeKeySchema,
    targetPortId: z.string().trim().min(1).max(80),
  }).strict()).max(MAX_PIPELINE_BUILD_EDGES),
  layout: z.object({
    columnGap: z.number().int().min(80).max(400).optional(),
    direction: z.enum(['horizontal', 'vertical']).optional(),
    originX: z.number().int().min(CANVAS_MIN).max(3_400).optional(),
    originY: z.number().int().min(CANVAS_MIN).max(3_400).optional(),
    rowGap: z.number().int().min(80).max(400).optional(),
  }).strict().optional(),
}).strict();

export type PipelineBuildInput = z.infer<typeof pipelineBuildInputSchema>;

export interface PreparedPipelineBuildPatch {
  documentName: string;
  edges: GraphEdge[];
  nodes: ProductionNode[];
  summary: string;
  version: 2;
}

export interface PipelineBuildSafePreview extends Record<string, unknown> {
  action: 'build-pipeline';
  addedEdgeCount: number;
  addedNodeCount: number;
  documentName: string;
  layout: 'horizontal' | 'vertical';
  nodes: Array<{
    key: string;
    position: { x: number; y: number };
    settings: Record<string, string | number>;
    title: string;
    type: ProductionNodeType;
  }>;
  summary: string;
  warnings: string[];
}

export function parsePipelineBuildInput(value: unknown): PipelineBuildInput {
  return pipelineBuildInputSchema.parse(value);
}

export function preparePipelineBuild(
  input: PipelineBuildInput,
  currentProject: GraphProject,
): { patch: PreparedPipelineBuildPatch; safePreview: PipelineBuildSafePreview } {
  assertUniqueNodeKeys(input.nodes.map((node) => node.key));

  const nodeByKey = new Map<string, ProductionNode>();
  const safeSettingsByKey = new Map<string, Record<string, string | number>>();
  const warnings: string[] = [];
  const nodes = input.nodes.map((spec) => {
    const node = createDefaultNode(spec.type, { x: 0, y: 0 });
    const safeSettings = sanitizePipelineNodeSettings(spec.type, spec.settings, spec.key, warnings);
    const configured = {
      ...node,
      data: { ...node.data, ...safeSettings } as ProductionNodeData,
    } satisfies ProductionNode;
    nodeByKey.set(spec.key, configured);
    safeSettingsByKey.set(spec.key, toSafePreviewSettings(safeSettings));
    return configured;
  });

  const positionedNodes = positionPipelineBuildNodes({ currentProject, input, nodes, warnings });
  positionedNodes.forEach((node, index) => nodeByKey.set(input.nodes[index].key, node));
  const occupiedTargetPorts = new Set<string>();
  const edges = input.edges.map((edge) => {
    const created = createValidatedEdge(edge, nodeByKey);
    const targetKey = `${created.targetNodeId}:${created.targetPortId}`;
    if (occupiedTargetPorts.has(targetKey)) {
      throw new Error(`Target port ${edge.targetNodeKey}.${edge.targetPortId} already has an incoming connection.`);
    }
    occupiedTargetPorts.add(targetKey);
    return created;
  });
  const patch = {
    documentName: input.documentName,
    edges,
    nodes: positionedNodes,
    summary: input.summary,
    version: 2 as const,
  };
  const safePreview: PipelineBuildSafePreview = {
    action: 'build-pipeline',
    addedEdgeCount: edges.length,
    addedNodeCount: positionedNodes.length,
    documentName: input.documentName,
    layout: input.layout?.direction ?? 'horizontal',
    nodes: positionedNodes.map((node, index) => ({
      key: input.nodes[index].key,
      position: node.position,
      settings: safeSettingsByKey.get(input.nodes[index].key) ?? {},
      title: node.data.title,
      type: node.type,
    })),
    summary: input.summary,
    warnings,
  };
  assertSafePresentationSize(safePreview);
  return { patch, safePreview };
}

export function resolvePipelineDocumentName(
  currentName: string,
  patch: Pick<PreparedPipelineBuildPatch, 'documentName' | 'summary'>,
) {
  if (currentName !== DEFAULT_DOCUMENT_NAME) return currentName;
  return (patch.documentName || patch.summary)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120) || DEFAULT_DOCUMENT_NAME;
}

export function applyPipelineBuildPatch(
  currentProject: GraphProject,
  patch: PreparedPipelineBuildPatch,
): GraphProject {
  const currentNodeIds = new Set(currentProject.nodes.map((node) => node.id));
  if (patch.nodes.some((node) => currentNodeIds.has(node.id))) {
    throw new Error('Prepared pipeline contains a duplicate node id.');
  }
  return {
    ...currentProject,
    edges: [...currentProject.edges, ...patch.edges],
    nodes: [...currentProject.nodes, ...patch.nodes],
    selectedNodeIds: patch.nodes.map((node) => node.id),
    selectedSectionIds: [],
  };
}

export function sanitizePipelineNodeSettings(
  type: ProductionNodeType,
  settings?: z.infer<typeof pipelineNodeSettingsSchema>,
  nodeKey?: string,
  warnings: string[] = [],
): SanitizedPipelineNodeSettings {
  if (!settings) return {};
  const allowed = new Set<PipelineNodeSetting>(PIPELINE_NODE_CONFIGURABLE_FIELDS[type]);
  const supportedEntries: Array<[string, SanitizedPipelineNodeSettingValue]> = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!isPipelineNodeSetting(key) || !allowed.has(key)) {
      warnings.push(`Настройка ${key} пропущена для ${nodeKey ?? type}: эта нода её не поддерживает.`);
      continue;
    }
    const parsed = pipelineSettingValueSchemas[key].safeParse(value);
    if (!parsed.success) {
      warnings.push(`Настройка ${key} пропущена для ${nodeKey ?? type}: значение не поддерживается.`);
      continue;
    }
    if (key === 'variables' && JSON.stringify(value) !== JSON.stringify(parsed.data)) {
      warnings.push(`Идентификаторы variables ноды ${nodeKey ?? type} нормализованы в variable-0, variable-1 и так далее.`);
    }
    supportedEntries.push([key, parsed.data as SanitizedPipelineNodeSettingValue]);
  }
  return Object.fromEntries(supportedEntries);
}

function isPipelineNodeSetting(value: string): value is PipelineNodeSetting {
  return value in pipelineSettingValueSchemas;
}

function toSafePreviewSettings(settings: SanitizedPipelineNodeSettings): Record<string, string | number> {
  return Object.fromEntries(Object.entries(settings).flatMap(([key, value]) => {
    if (key === 'variables' && Array.isArray(value)) return [[key, value.length]];
    return typeof value === 'string' || typeof value === 'number' ? [[key, value]] : [];
  }));
}

function createValidatedEdge(
  spec: PipelineBuildInput['edges'][number],
  nodeByKey: Map<string, ProductionNode>,
): GraphEdge {
  const source = nodeByKey.get(spec.sourceNodeKey);
  const target = nodeByKey.get(spec.targetNodeKey);
  if (!source || !target) throw new Error('Pipeline edge references an unknown node key.');
  expandTextConcatInputPorts(target, spec.targetPortId);
  if (!canConnectPorts(source, spec.sourcePortId, target, spec.targetPortId)) {
    throw new Error(
      `Ports ${spec.sourceNodeKey}.${spec.sourcePortId} and ${spec.targetNodeKey}.${spec.targetPortId} are incompatible.`,
    );
  }
  return {
    id: createId('edge'),
    sourceNodeId: source.id,
    sourcePortId: spec.sourcePortId,
    targetNodeId: target.id,
    targetPortId: spec.targetPortId,
  };
}

export function expandTextConcatInputPorts(node: ProductionNode, portId: string) {
  if (node.type !== 'textConcat') return;
  const portIndex = getTextConcatInputPortIndex(portId);
  if (portIndex < 0 || portIndex >= 12) return;
  const concatData = node.data as ProductionNodeData & { inputCount?: number };
  const currentCount = Number(concatData.inputCount) || 2;
  node.data = { ...node.data, inputCount: Math.max(2, currentCount, portIndex + 1) };
}

function assertUniqueNodeKeys(keys: string[]) {
  if (new Set(keys).size !== keys.length) throw new Error('Pipeline node keys must be unique.');
}

function assertSafePresentationSize(value: Record<string, unknown>) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SAFE_PRESENTATION_BYTES) {
    throw new Error('Pipeline preview is too large to display safely.');
  }
}
