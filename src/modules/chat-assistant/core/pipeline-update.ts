import { z } from 'zod';
import { canConnectPorts } from '@/entities/production-graph/model/node-definitions';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { PRODUCTION_NODE_TYPES } from '@/entities/production-graph/model/node-registry';
import type {
  GraphEdge,
  GraphProject,
  ProductionNode,
  ProductionNodeData,
  ProductionNodeType,
} from '@/entities/production-graph/model/types';
import { createId } from '@/shared/lib/id';
import { PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';
import {
  expandTextConcatInputPorts,
  sanitizePipelineNodeSettings,
  type SanitizedPipelineNodeSettings,
} from './pipeline-build';
import { reflowPipelineUpdate, type PipelineNodeMove } from './pipeline-update-layout';
import { normalizeTextPromptTargetPort } from './pipeline-update-port-normalization';

const nodeKeySchema = z.string().trim().min(1).max(48).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/);
const idSchema = z.string().trim().min(1).max(120);
const settingsSchema = z.record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 24, 'Node settings are limited to 24 fields.');
const nodeTypeSchema = z.enum(PRODUCTION_NODE_TYPES as [ProductionNodeType, ...ProductionNodeType[]]);

export const pipelineUpdateInputSchema = z.object({
  summary: z.string().trim().min(4).max(280),
  nodes: z.array(z.object({
    key: nodeKeySchema,
    settings: settingsSchema.optional(),
    type: nodeTypeSchema,
  }).strict()).max(12).default([]),
  updates: z.array(z.object({ nodeId: idSchema, settings: settingsSchema }).strict()).max(12).default([]),
  removeEdgeIds: z.array(idSchema).max(24).default([]),
  edges: z.array(z.object({
    sourceNodeRef: idSchema,
    sourcePortId: idSchema.max(80),
    targetNodeRef: idSchema,
    targetPortId: idSchema.max(80),
  }).strict()).max(24).default([]),
  layout: z.object({
    columnGap: z.number().int().min(80).max(400).optional(),
    direction: z.enum(['horizontal', 'vertical']).optional(),
    originX: z.number().int().min(80).max(3_400).optional(),
    originY: z.number().int().min(80).max(3_400).optional(),
    rowGap: z.number().int().min(80).max(400).optional(),
  }).strict().optional(),
}).strict().refine((input) => (
  input.nodes.length + input.updates.length + input.removeEdgeIds.length + input.edges.length > 0
), 'A pipeline update must contain at least one change.');

export type PipelineUpdateInput = z.infer<typeof pipelineUpdateInputSchema>;

export interface PreparedPipelineUpdatePatch {
  addedEdges: GraphEdge[];
  addedNodes: ProductionNode[];
  movedNodes: PipelineNodeMove[];
  removeEdgeIds: string[];
  summary: string;
  updatedNodes: Array<{ nodeId: string; settings: SanitizedPipelineNodeSettings }>;
  version: 2;
}

export function preparePipelineUpdate(input: PipelineUpdateInput, currentProject: GraphProject) {
  assertUnique(input.nodes.map((node) => node.key), 'New node keys');
  assertUnique(input.updates.map((update) => update.nodeId), 'Updated node ids');
  assertUnique(input.removeEdgeIds, 'Removed edge ids');
  const warnings: string[] = [];
  const currentById = new Map(currentProject.nodes.map((node) => [node.id, cloneNode(node)]));
  const settingsByNodeId = new Map<string, SanitizedPipelineNodeSettings>();

  for (const update of input.updates) {
    const node = currentById.get(update.nodeId);
    if (!node) throw new Error(`Existing node ${update.nodeId} was not found.`);
    const settings = sanitizePipelineNodeSettings(node.type, update.settings, update.nodeId, warnings);
    node.data = { ...node.data, ...settings } as ProductionNodeData;
    settingsByNodeId.set(node.id, settings);
  }

  const newByKey = createNewNodes(input, warnings);
  const allByRef = new Map<string, ProductionNode>(currentById);
  newByKey.forEach((node, key) => {
    if (allByRef.has(key)) throw new Error(`New node key ${key} conflicts with an existing node id.`);
    allByRef.set(key, node);
  });
  const explicitRemoveEdgeIds = new Set(input.removeEdgeIds);
  const remainingEdges = removeExistingEdges(currentProject.edges, input.removeEdgeIds);
  const existingEdgeByTarget = new Map(remainingEdges.map((edge) => [
    `${edge.targetNodeId}:${edge.targetPortId}`,
    edge,
  ]));
  const newlyOccupiedTargets = new Set<string>();
  const addedEdges = input.edges.map((edge) => {
    const source = allByRef.get(edge.sourceNodeRef);
    const target = allByRef.get(edge.targetNodeRef);
    if (!source || !target) throw new Error('Pipeline update edge references an unknown node.');
    expandTextConcatInputPorts(target, edge.targetPortId);
    captureSystemNodeSettings(target, currentById, settingsByNodeId);
    const targetPortId = normalizeTextPromptTargetPort({
      currentById,
      requestedPortId: edge.targetPortId,
      settingsByNodeId,
      target,
      warnings,
    });
    if (!canConnectPorts(source, edge.sourcePortId, target, targetPortId)) {
      throw new Error(`Ports ${edge.sourceNodeRef}.${edge.sourcePortId} and ${edge.targetNodeRef}.${targetPortId} are incompatible.`);
    }
    const targetKey = `${target.id}:${targetPortId}`;
    if (newlyOccupiedTargets.has(targetKey)) {
      throw new Error(`Target port ${edge.targetNodeRef}.${targetPortId} is used more than once in this update.`);
    }
    const replacedEdge = existingEdgeByTarget.get(targetKey);
    if (replacedEdge) {
      explicitRemoveEdgeIds.add(replacedEdge.id);
      existingEdgeByTarget.delete(targetKey);
      warnings.push(`Связь ${replacedEdge.id} будет заменена: вход ${edge.targetNodeRef}.${targetPortId} уже был занят.`);
    }
    newlyOccupiedTargets.add(targetKey);
    return createEdge(source, edge.sourcePortId, target, targetPortId);
  });

  const patch: PreparedPipelineUpdatePatch = {
    addedEdges,
    addedNodes: Array.from(newByKey.values()),
    movedNodes: [],
    removeEdgeIds: Array.from(explicitRemoveEdgeIds),
    summary: input.summary,
    updatedNodes: Array.from(settingsByNodeId, ([nodeId, settings]) => ({ nodeId, settings })),
    version: 2,
  };
  const nextProject = applyPipelineUpdatePatch(currentProject, patch);
  assertAcyclic(nextProject);
  const reflow = reflowPipelineUpdate({
    addedEdges: patch.addedEdges,
    addedNodeIds: patch.addedNodes.map((node) => node.id),
    currentProject,
    layout: input.layout,
    nextProject,
    removeEdgeIds: patch.removeEdgeIds,
    warnings,
  });
  patch.addedNodes = patch.addedNodes.map((node) => ({
    ...node,
    position: reflow.positionsByNodeId.get(node.id) ?? node.position,
  }));
  patch.movedNodes = reflow.movedNodes;
  return { patch, safePreview: createSafePreview(input, patch, warnings) };
}

export function applyPipelineUpdatePatch(project: GraphProject, patch: PreparedPipelineUpdatePatch): GraphProject {
  const removeIds = new Set(patch.removeEdgeIds);
  const updates = new Map(patch.updatedNodes.map((update) => [update.nodeId, update.settings]));
  const moves = new Map((patch.movedNodes ?? []).map((move) => [move.nodeId, move.position]));
  return {
    ...project,
    edges: [...project.edges.filter((edge) => !removeIds.has(edge.id)), ...patch.addedEdges],
    nodes: [
      ...project.nodes.map((node) => ({
        ...node,
        ...(updates.has(node.id)
          ? { data: { ...node.data, ...updates.get(node.id) } as ProductionNodeData }
          : {}),
        ...(moves.has(node.id) ? { position: { ...moves.get(node.id)! } } : {}),
      })),
      ...patch.addedNodes,
    ],
    selectedNodeIds: patch.addedNodes.map((node) => node.id),
    selectedSectionIds: [],
  };
}

function createNewNodes(input: PipelineUpdateInput, warnings: string[]) {
  const nodes = input.nodes.map((spec) => {
    const node = createDefaultNode(spec.type, { x: 0, y: 0 });
    const settings = sanitizePipelineNodeSettings(spec.type, spec.settings, spec.key, warnings);
    return { ...node, data: { ...node.data, ...settings } as ProductionNodeData };
  });
  return new Map(input.nodes.map((node, index) => [node.key, nodes[index]]));
}

function removeExistingEdges(edges: GraphEdge[], removeEdgeIds: string[]) {
  const existingIds = new Set(edges.map((edge) => edge.id));
  const missing = removeEdgeIds.find((id) => !existingIds.has(id));
  if (missing) throw new Error(`Existing edge ${missing} was not found.`);
  const removeIds = new Set(removeEdgeIds);
  return edges.filter((edge) => !removeIds.has(edge.id));
}

function captureSystemNodeSettings(
  node: ProductionNode,
  currentById: Map<string, ProductionNode>,
  settingsByNodeId: Map<string, SanitizedPipelineNodeSettings>,
) {
  if (!currentById.has(node.id) || node.type !== 'textConcat') return;
  const concatData = node.data as ProductionNodeData & { inputCount?: number };
  settingsByNodeId.set(node.id, {
    ...(settingsByNodeId.get(node.id) ?? {}),
    inputCount: Number(concatData.inputCount) || 2,
  });
}

function createSafePreview(input: PipelineUpdateInput, patch: PreparedPipelineUpdatePatch, warnings: string[]) {
  return {
    action: 'update-pipeline',
    addedEdgeCount: patch.addedEdges.length,
    addedNodeCount: patch.addedNodes.length,
    nodes: patch.addedNodes.map((node, index) => ({
      key: input.nodes[index].key,
      position: node.position,
      settings: readSafeNodeSettings(node),
      title: node.data.title,
      type: node.type,
    })),
    removedEdgeCount: patch.removeEdgeIds.length,
    movedNodeCount: patch.movedNodes.length,
    summary: patch.summary,
    updatedNodeCount: patch.updatedNodes.length,
    warnings,
  };
}

function readSafeNodeSettings(node: ProductionNode): Record<string, string | number> {
  const entries: Array<[string, string | number]> = [];
  for (const field of PIPELINE_NODE_CONFIGURABLE_FIELDS[node.type]) {
    const value = node.data[field as keyof ProductionNodeData];
    if (field === 'variables' && Array.isArray(value)) entries.push([field, value.length]);
    else if (typeof value === 'string' || typeof value === 'number') entries.push([field, value]);
  }
  return Object.fromEntries(entries);
}

function createEdge(source: ProductionNode, sourcePortId: string, target: ProductionNode, targetPortId: string): GraphEdge {
  return { id: createId('edge'), sourceNodeId: source.id, sourcePortId, targetNodeId: target.id, targetPortId };
}

function cloneNode(node: ProductionNode): ProductionNode {
  return { ...node, data: { ...node.data }, position: { ...node.position }, size: { ...node.size } };
}

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
}

function assertAcyclic(project: GraphProject) {
  const outgoing = new Map(project.nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(project.nodes.map((node) => [node.id, 0]));
  project.edges.forEach((edge) => {
    outgoing.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
  });
  const queue = Array.from(incoming).filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const target of outgoing.get(id) ?? []) {
      const count = (incoming.get(target) ?? 0) - 1;
      incoming.set(target, count);
      if (count === 0) queue.push(target);
    }
  }
  if (visited !== project.nodes.length) throw new Error('Pipeline update would create a cycle.');
}
