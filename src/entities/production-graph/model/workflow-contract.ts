import type { GraphEdge } from './graph-core-types';

export type WorkflowExecutionState = 'Expanded' | 'Collapsed';

export interface WorkflowNodeExecutionLevel {
  nodeId: string;
  level: number;
}

export interface WorkflowValue {
  kind: WorkflowValueKind;
  value: string | string[] | unknown;
}

export type WorkflowValueKind =
  | 'plain-text'
  | 'formatted-text'
  | 'html'
  | 'json'
  | 'image'
  | 'image[]'
  | 'publication';

export function isWorkflowValueKind(value: unknown): value is WorkflowValueKind {
  return typeof value === 'string'
    && [
      'plain-text',
      'formatted-text',
      'html',
      'json',
      'image',
      'image[]',
      'publication',
      'text',
    ].includes(value);
}

export interface WorkflowPortKindConstraint {
  input: WorkflowValueKind[];
  output: WorkflowValueKind[];
}

export interface WorkflowNodeContract {
  nodeType: string;
  displayState: WorkflowExecutionState;
  title?: string;
  portConstraints: Record<string, WorkflowPortKindConstraint>;
}

export function buildExecutionLevels(nodes: Array<{ id: string }>, edges: GraphEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const { id } of nodes) {
    inDegree.set(id, 0);
    outgoing.set(id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) continue;
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1);
    const neighbors = outgoing.get(edge.sourceNodeId);
    if (neighbors) {
      neighbors.push(edge.targetNodeId);
    }
  }

  const queue: string[] = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort();

  const levelByNode = new Map<string, number>(Array.from(nodeIds).map((id) => [id, 0]));
  const levels: WorkflowNodeExecutionLevel[] = [];

  let processedCount = 0;

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) continue;

    processedCount += 1;
    const currentLevel = levelByNode.get(nodeId) ?? 0;
    levels.push({ nodeId, level: currentLevel });

    for (const nextNodeId of outgoing.get(nodeId) ?? []) {
      const nextLevel = currentLevel + 1;
      const existingLevel = levelByNode.get(nextNodeId) ?? 0;
      if (nextLevel > existingLevel) {
        levelByNode.set(nextNodeId, nextLevel);
      }

      const nextInDegree = (inDegree.get(nextNodeId) ?? 0) - 1;
      inDegree.set(nextNodeId, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(nextNodeId);
        queue.sort();
      }
    }
  }

  if (processedCount !== nodeIds.size) {
    throw new Error('Detected cycle in execution graph.');
  }

  return levels.sort((a, b) => (a.level - b.level) || a.nodeId.localeCompare(b.nodeId));
}

export const WORKFLOW_VALUE_KINDS: WorkflowValueKind[] = [
  'plain-text',
  'formatted-text',
  'html',
  'json',
  'image',
  'image[]',
  'publication',
];

export const WORKFLOW_NODE_INPUT_KINDS_BY_PORT_KIND = {
  text: ['plain-text', 'formatted-text', 'html', 'json'] as const,
  image: ['image', 'image[]'] as const,
  subject: ['plain-text', 'formatted-text', 'html', 'json'] as const,
  location: ['plain-text', 'formatted-text', 'html', 'json'] as const,
  publication: ['publication', 'plain-text', 'formatted-text', 'html', 'json'] as const,
  reference: ['plain-text', 'formatted-text', 'html', 'json', 'image', 'image[]'] as const,
  preset: ['plain-text', 'formatted-text', 'html', 'json'] as const,
  video: ['plain-text', 'formatted-text', 'html', 'json'] as const,
  audio: ['plain-text', 'formatted-text', 'html', 'json'] as const,
} as const;
