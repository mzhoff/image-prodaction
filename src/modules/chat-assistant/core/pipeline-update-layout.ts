import type {
  GraphEdge,
  GraphProject,
  GraphPoint,
  ProductionNode,
} from '@/entities/production-graph/model/types';
import {
  positionPipelineBuildNodes,
  type PipelineLayoutSpec,
} from './pipeline-layout';

const CANVAS_MIN = 80;
const MAX_ORIGIN = 3_400;

export interface PipelineNodeMove {
  nodeId: string;
  position: GraphPoint;
}

export function reflowPipelineUpdate(input: {
  addedEdges: GraphEdge[];
  addedNodeIds: string[];
  currentProject: GraphProject;
  layout?: PipelineLayoutSpec;
  nextProject: GraphProject;
  removeEdgeIds: string[];
  warnings: string[];
}) {
  const seedIds = collectTopologyChangeSeeds(input);
  if (seedIds.size === 0) return { movedNodes: [], positionsByNodeId: new Map<string, GraphPoint>() };

  const affectedIds = collectConnectedNodeIds(input.nextProject, seedIds);
  const affectedNodes = input.nextProject.nodes.filter((node) => affectedIds.has(node.id));
  const unaffectedNodes = input.currentProject.nodes.filter((node) => !affectedIds.has(node.id));
  const currentAffectedNodes = input.currentProject.nodes.filter((node) => affectedIds.has(node.id));
  const layout = preserveCurrentGraphOrigin(input.layout, currentAffectedNodes);
  const positioned = positionPipelineBuildNodes({
    currentProject: { ...input.currentProject, nodes: unaffectedNodes },
    input: {
      edges: input.nextProject.edges.flatMap((edge) => (
        affectedIds.has(edge.sourceNodeId) && affectedIds.has(edge.targetNodeId)
          ? [{ sourceNodeKey: edge.sourceNodeId, targetNodeKey: edge.targetNodeId }]
          : []
      )),
      layout,
      nodes: affectedNodes.map((node) => ({ key: node.id })),
    },
    nodes: affectedNodes,
    warnings: input.warnings,
  });
  const positionsByNodeId = new Map(positioned.map((node) => [node.id, node.position]));
  const addedIds = new Set(input.addedNodeIds);
  const movedNodes = currentAffectedNodes.flatMap((node): PipelineNodeMove[] => {
    const position = positionsByNodeId.get(node.id);
    if (!position || addedIds.has(node.id) || samePosition(position, node.position)) return [];
    return [{ nodeId: node.id, position }];
  });
  return { movedNodes, positionsByNodeId };
}

function collectTopologyChangeSeeds(input: {
  addedEdges: GraphEdge[];
  addedNodeIds: string[];
  currentProject: GraphProject;
  removeEdgeIds: string[];
}) {
  const seeds = new Set(input.addedNodeIds);
  input.addedEdges.forEach((edge) => {
    seeds.add(edge.sourceNodeId);
    seeds.add(edge.targetNodeId);
  });
  const removedIds = new Set(input.removeEdgeIds);
  input.currentProject.edges.forEach((edge) => {
    if (!removedIds.has(edge.id)) return;
    seeds.add(edge.sourceNodeId);
    seeds.add(edge.targetNodeId);
  });
  return seeds;
}

function collectConnectedNodeIds(project: GraphProject, seedIds: Set<string>) {
  const knownIds = new Set(project.nodes.map((node) => node.id));
  const neighbors = new Map(project.nodes.map((node) => [node.id, [] as string[]]));
  project.edges.forEach((edge) => {
    neighbors.get(edge.sourceNodeId)?.push(edge.targetNodeId);
    neighbors.get(edge.targetNodeId)?.push(edge.sourceNodeId);
  });
  const affected = new Set(Array.from(seedIds).filter((id) => knownIds.has(id)));
  const queue = Array.from(affected);
  while (queue.length) {
    const nodeId = queue.shift()!;
    for (const neighborId of neighbors.get(nodeId) ?? []) {
      if (affected.has(neighborId)) continue;
      affected.add(neighborId);
      queue.push(neighborId);
    }
  }
  return affected;
}

function preserveCurrentGraphOrigin(layout: PipelineLayoutSpec | undefined, nodes: ProductionNode[]) {
  if (layout?.originX !== undefined || layout?.originY !== undefined || nodes.length === 0) return layout;
  const left = Math.min(...nodes.map((node) => node.position.x));
  const top = Math.min(...nodes.map((node) => node.position.y));
  return {
    ...layout,
    originX: clampOrigin(left),
    originY: clampOrigin(top),
  };
}

function clampOrigin(value: number) {
  return Math.min(MAX_ORIGIN, Math.max(CANVAS_MIN, Math.round(value)));
}

function samePosition(left: GraphPoint, right: GraphPoint) {
  return left.x === right.x && left.y === right.y;
}
