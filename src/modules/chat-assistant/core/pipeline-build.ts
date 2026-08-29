import { z } from 'zod';
import { DEFAULT_DOCUMENT_NAME } from '@/entities/document/model/document-lifecycle';
import { canConnectPorts } from '@/entities/production-graph/model/node-definitions';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type {
  GraphEdge,
  GraphProject,
  AssetRecord,
  ProductionNode,
  ProductionNodeData,
  ProductionNodeType,
} from '@/entities/production-graph/model/types';
import { createId } from '@/shared/lib/id';
import type {
  PipelineBuildSafePreview,
  PreparedPipelineBuildPatch,
} from './pipeline-build-types';
import {
  compileCompositionBlueprints,
  compositionBlueprintsSchema,
} from './composition-blueprint';
import { expandDynamicInputPorts } from './pipeline-dynamic-inputs';
import { normalizeUnambiguousEdgePorts } from './pipeline-edge-normalization';
import { positionPipelineBuildNodes } from './pipeline-layout';
import {
  pipelineNodeSettingsSchema,
  sanitizePipelineNodeSettings,
  toSafePreviewSettings,
} from './pipeline-node-settings';

export type { PipelineBuildSafePreview, PreparedPipelineBuildPatch } from './pipeline-build-types';
export { sanitizePipelineNodeSettings };
export type {
  SanitizedPipelineNodeSettings,
  SanitizedPipelineNodeSettingValue,
} from './pipeline-node-settings';

const MAX_PIPELINE_BUILD_NODES = 24;
const MAX_PIPELINE_BUILD_EDGES = 24;
const MAX_SAFE_PRESENTATION_BYTES = 32 * 1024;
const CANVAS_MIN = 80;

const nodeKeySchema = z.string().trim().min(1).max(48).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const shortTextSchema = z.string().trim().min(1).max(120);

const productionNodeTypeSchema = z.enum(PRODUCTION_NODE_TYPES as [ProductionNodeType, ...ProductionNodeType[]]);

export const pipelineBuildInputSchema = z.object({
  documentName: shortTextSchema,
  summary: z.string().trim().min(4).max(280),
  nodes: z.array(z.object({
    key: nodeKeySchema,
    settings: pipelineNodeSettingsSchema.optional(),
    sourceAttachmentIndex: z.number().int().min(0).max(2).optional(),
    type: productionNodeTypeSchema,
  }).strict()).min(1).max(MAX_PIPELINE_BUILD_NODES),
  edges: z.array(z.object({
    sourceNodeKey: nodeKeySchema,
    sourcePortId: z.string().trim().min(1).max(80),
    targetNodeKey: nodeKeySchema,
    targetPortId: z.string().trim().min(1).max(80),
  }).strict()).max(MAX_PIPELINE_BUILD_EDGES),
  compositionBlueprints: compositionBlueprintsSchema,
  layout: z.object({
    columnGap: z.number().int().min(80).max(400).optional(),
    direction: z.enum(['horizontal', 'vertical']).optional(),
    originX: z.number().int().min(CANVAS_MIN).max(3_400).optional(),
    originY: z.number().int().min(CANVAS_MIN).max(3_400).optional(),
    rowGap: z.number().int().min(80).max(400).optional(),
  }).strict().optional(),
}).strict();

export type PipelineBuildInput = z.infer<typeof pipelineBuildInputSchema>;

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

  const compiledBlueprints = compileCompositionBlueprints({
    blueprints: input.compositionBlueprints,
    existingEdges: [],
    existingNodeIds: new Set(),
    nodeByRef: nodeByKey,
  });
  const edgeSpecs: PipelineBuildEdgeSpec[] = [
    ...input.edges,
    ...compiledBlueprints.edgeSpecs.map((edge) => ({
      path: edge.path,
      sourceNodeKey: edge.sourceNodeRef,
      sourcePortId: edge.sourcePortId,
      targetNodeKey: edge.targetNodeRef,
      targetPortId: edge.targetPortId,
    })),
  ];
  const positionedNodes = positionPipelineBuildNodes({
    currentProject,
    input: { ...input, edges: edgeSpecs },
    nodes,
    warnings,
  });
  positionedNodes.forEach((node, index) => nodeByKey.set(input.nodes[index].key, node));
  const occupiedTargetPorts = new Set<string>();
  const edges = edgeSpecs.map((edge) => {
    const created = createValidatedEdge(edge, nodeByKey, warnings);
    const targetKey = `${created.targetNodeId}:${created.targetPortId}`;
    if (occupiedTargetPorts.has(targetKey)) {
      throwEdgeError(edge, `Target port ${edge.targetNodeKey}.${edge.targetPortId} already has an incoming connection.`);
    }
    occupiedTargetPorts.add(targetKey);
    return created;
  });
  const patch = {
    attachmentImports: input.nodes.flatMap((spec, index) => {
      if (spec.sourceAttachmentIndex === undefined) return [];
      if (spec.type !== 'importImage') {
        throw new Error(`sourceAttachmentIndex is supported only for importImage (${spec.key}).`);
      }
      return [{
        attachmentIndex: spec.sourceAttachmentIndex,
        nodeId: positionedNodes[index].id,
      }];
    }),
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
    compositionBlueprints: compiledBlueprints.safeSummaries,
    documentName: input.documentName,
    layout: input.layout?.direction ?? 'horizontal',
    nodes: positionedNodes.map((node, index) => ({
      key: input.nodes[index].key,
      position: node.position,
      settings: safeSettingsByKey.get(input.nodes[index].key) ?? {},
      sourceAttachmentIndex: input.nodes[index].sourceAttachmentIndex,
      title: node.data.title,
      type: node.type,
    })),
    summary: input.summary,
    warnings,
  };
  assertSafePresentationSize(safePreview);
  return { patch, safePreview };
}

type PipelineBuildEdgeSpec = PipelineBuildInput['edges'][number] & { path?: string };

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
    assets: appendUniqueAssets(currentProject.assets, patch.assets ?? []),
    edges: [...currentProject.edges, ...patch.edges],
    nodes: [...currentProject.nodes, ...patch.nodes],
    selectedNodeIds: patch.nodes.map((node) => node.id),
    selectedSectionIds: [],
  };
}

function appendUniqueAssets(current: AssetRecord[], added: AssetRecord[]) {
  const currentIds = new Set(current.map((asset) => asset.id));
  return [...current, ...added.filter((asset) => !currentIds.has(asset.id))];
}

function createValidatedEdge(
  spec: PipelineBuildEdgeSpec,
  nodeByKey: Map<string, ProductionNode>,
  warnings: string[],
): GraphEdge {
  const source = nodeByKey.get(spec.sourceNodeKey);
  const target = nodeByKey.get(spec.targetNodeKey);
  if (!source || !target) throwEdgeError(spec, 'Pipeline edge references an unknown node key.');
  expandDynamicInputPorts(target, spec.targetPortId);
  const normalized = normalizeUnambiguousEdgePorts({
    source,
    sourceLabel: spec.sourceNodeKey,
    sourcePortId: spec.sourcePortId,
    target,
    targetLabel: spec.targetNodeKey,
    targetPortId: spec.targetPortId,
    warnings,
  });
  if (!canConnectPorts(source, normalized.sourcePortId, target, normalized.targetPortId)) {
    throwEdgeError(
      spec,
      `Ports ${spec.sourceNodeKey}.${spec.sourcePortId} and ${spec.targetNodeKey}.${spec.targetPortId} are incompatible.`,
    );
  }
  return {
    id: createId('edge'),
    sourceNodeId: source.id,
    sourcePortId: normalized.sourcePortId,
    targetNodeId: target.id,
    targetPortId: normalized.targetPortId,
  };
}

function throwEdgeError(spec: PipelineBuildEdgeSpec, message: string): never {
  throw new Error(spec.path ? `${spec.path}: ${message}` : message);
}

function assertUniqueNodeKeys(keys: string[]) {
  if (new Set(keys).size !== keys.length) throw new Error('Pipeline node keys must be unique.');
}

function assertSafePresentationSize(value: Record<string, unknown>) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_SAFE_PRESENTATION_BYTES) {
    throw new Error('Pipeline preview is too large to display safely.');
  }
}
