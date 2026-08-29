import { canConnectPorts } from '@/entities/production-graph/model/node-definitions';
import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import type {
  GraphEdge,
  GraphProject,
  AssetRecord,
  ProductionNode,
  ProductionNodeData,
} from '@/entities/production-graph/model/types';
import { createId } from '@/shared/lib/id';
import { PIPELINE_NODE_CONFIGURABLE_FIELDS } from '../contracts/image-production-tools';
import { sanitizePipelineNodeSettings } from './pipeline-build';
import { compileCompositionBlueprints } from './composition-blueprint';
import { expandDynamicInputPorts } from './pipeline-dynamic-inputs';
import { normalizeUnambiguousEdgePorts } from './pipeline-edge-normalization';
import { reflowPipelineUpdate, type PipelineNodeMove } from './pipeline-update-layout';
import { normalizeTextPromptTargetPort } from './pipeline-update-port-normalization';
import { pipelineUpdateInputSchema, type PipelineUpdateInput } from './pipeline-update-schema';

export { pipelineUpdateInputSchema };

export interface PreparedPipelineUpdatePatch {
  assets?: AssetRecord[];
  addedEdges: GraphEdge[];
  addedNodes: ProductionNode[];
  attachmentImports: Array<{
    attachmentId?: string;
    attachmentIndex: number;
    attachmentName?: string;
    nodeId: string;
  }>;
  movedNodes: PipelineNodeMove[];
  removeEdgeIds: string[];
  summary: string;
  updatedNodes: Array<{ nodeId: string; settings: Record<string, unknown> }>;
  version: 2;
}

export function preparePipelineUpdate(input: PipelineUpdateInput, currentProject: GraphProject) {
  assertUnique(input.nodes.map((node) => node.key), 'New node keys');
  assertUnique(input.updates.map((update) => update.nodeId), 'Updated node ids');
  assertUnique(input.removeEdgeIds, 'Removed edge ids');
  const warnings: string[] = [];
  const currentById = new Map(currentProject.nodes.map((node) => [node.id, cloneNode(node)]));
  const settingsByNodeId = new Map<string, Record<string, unknown>>();

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
  const compiledBlueprints = compileCompositionBlueprints({
    blueprints: input.compositionBlueprints,
    existingEdges: remainingEdges,
    existingNodeIds: new Set(currentById.keys()),
    nodeByRef: allByRef,
  });
  compiledBlueprints.removeEdgeIds.forEach((edgeId) => explicitRemoveEdgeIds.add(edgeId));
  compiledBlueprints.updatedExistingNodeData.forEach((data, nodeId) => {
    settingsByNodeId.set(nodeId, { ...(settingsByNodeId.get(nodeId) ?? {}), ...data });
  });
  const remainingAfterBlueprints = remainingEdges.filter((edge) => !explicitRemoveEdgeIds.has(edge.id));
  const existingEdgeByTarget = new Map(remainingAfterBlueprints.map((edge) => [
    `${edge.targetNodeId}:${edge.targetPortId}`,
    edge,
  ]));
  const newlyOccupiedTargets = new Set<string>();
  const edgeSpecs: PipelineUpdateEdgeSpec[] = [
    ...input.edges,
    ...compiledBlueprints.edgeSpecs,
  ];
  const addedEdges = edgeSpecs.map((edge) => {
    const source = allByRef.get(edge.sourceNodeRef);
    const target = allByRef.get(edge.targetNodeRef);
    if (!source || !target) throwUpdateEdgeError(edge, 'Pipeline update edge references an unknown node.');
    expandDynamicInputPorts(target, edge.targetPortId);
    captureSystemNodeSettings(target, currentById, settingsByNodeId);
    const targetPortId = normalizeTextPromptTargetPort({
      currentById,
      requestedPortId: edge.targetPortId,
      settingsByNodeId,
      target,
      warnings,
    });
    const normalized = normalizeUnambiguousEdgePorts({
      source,
      sourceLabel: edge.sourceNodeRef,
      sourcePortId: edge.sourcePortId,
      target,
      targetLabel: edge.targetNodeRef,
      targetPortId,
      warnings,
    });
    if (!canConnectPorts(source, normalized.sourcePortId, target, normalized.targetPortId)) {
      throwUpdateEdgeError(
        edge,
        `Ports ${edge.sourceNodeRef}.${edge.sourcePortId} and ${edge.targetNodeRef}.${targetPortId} are incompatible.`,
      );
    }
    const targetKey = `${target.id}:${normalized.targetPortId}`;
    if (newlyOccupiedTargets.has(targetKey)) {
      throwUpdateEdgeError(
        edge,
        `Target port ${edge.targetNodeRef}.${targetPortId} is used more than once in this update.`,
      );
    }
    const replacedEdge = existingEdgeByTarget.get(targetKey);
    if (replacedEdge) {
      explicitRemoveEdgeIds.add(replacedEdge.id);
      existingEdgeByTarget.delete(targetKey);
      warnings.push(`Связь ${replacedEdge.id} будет заменена: вход ${edge.targetNodeRef}.${normalized.targetPortId} уже был занят.`);
    }
    newlyOccupiedTargets.add(targetKey);
    return createEdge(source, normalized.sourcePortId, target, normalized.targetPortId);
  });

  const patch: PreparedPipelineUpdatePatch = {
    addedEdges,
    addedNodes: Array.from(newByKey.values()),
    attachmentImports: input.nodes.flatMap((spec) => {
      if (spec.sourceAttachmentIndex === undefined) return [];
      if (spec.type !== 'importImage') {
        throw new Error(`sourceAttachmentIndex is supported only for importImage (${spec.key}).`);
      }
      const node = newByKey.get(spec.key);
      if (!node) throw new Error(`New import node ${spec.key} was not prepared.`);
      return [{ attachmentIndex: spec.sourceAttachmentIndex, nodeId: node.id }];
    }),
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
    assets: appendUniqueAssets(project.assets, patch.assets ?? []),
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

function appendUniqueAssets(current: AssetRecord[], added: AssetRecord[]) {
  const currentIds = new Set(current.map((asset) => asset.id));
  return [...current, ...added.filter((asset) => !currentIds.has(asset.id))];
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
  settingsByNodeId: Map<string, Record<string, unknown>>,
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
    compositionBlueprints: input.compositionBlueprints.map((blueprint) => ({
      compositionNodeRef: blueprint.compositionNodeRef,
      layerCount: blueprint.layers.length,
      layers: blueprint.layers.map(({ key, kind, name, role }) => ({ key, kind, name, role })),
      mode: blueprint.mode,
    })),
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

type PipelineUpdateEdgeSpec = PipelineUpdateInput['edges'][number] & { path?: string };

function throwUpdateEdgeError(spec: PipelineUpdateEdgeSpec, message: string): never {
  throw new Error(spec.path ? `${spec.path}: ${message}` : message);
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
