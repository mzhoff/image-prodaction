import { createDefaultNode } from '@/entities/production-graph/model/create-default-node';
import { validateGenerateImageReferenceLimit } from '@/entities/production-graph/model/connection-rules';
import { canConnectPorts, getNodePorts } from '@/entities/production-graph/model/node-definitions';
import { isPipelineContractFieldKind } from '@/entities/production-graph/model/pipeline-contract-fields';
import { resolveTargetPortConnectionConflict } from '@/entities/production-graph/model/port-contract';
import type { GraphEdge, GraphPort, PipelineInputNodeData, ProductionNode, ProductionNodeType } from '@/entities/production-graph/model/types';

export type BatchConnectionDirection = 'input' | 'output';
export interface BatchConnectionPair {
  selectedNode: ProductionNode;
  newNode: ProductionNode;
  sourcePortId: string;
  targetPortId: string;
}

/** One independent candidate per selected node, not one shared fan-in/fan-out. */
export function getBatchConnectionPlan(
  selectedNodes: ProductionNode[],
  type: ProductionNodeType,
  direction: BatchConnectionDirection,
  edges: GraphEdge[] = [],
  graphNodes: ProductionNode[] = selectedNodes,
): BatchConnectionPair[] | undefined {
  if (selectedNodes.length === 0) return undefined;
  const plan: BatchConnectionPair[] = [];
  for (const selectedNode of selectedNodes) {
    const ports = getNodePorts(selectedNode).filter((port) => (
      port.side === direction && (direction === 'output' || !resolveTargetPortConnectionConflict({
        edges, targetNode: selectedNode, targetPortId: port.id,
      }).isBlocked)
    ));
    let pair: BatchConnectionPair | undefined;
    const candidate = createDefaultNode(type, selectedNode.position);
    for (const port of ports) {
      const newNode = prepareCandidate(candidate, port);
      const newPort = getNodePorts(newNode).find((other) => {
        const source = direction === 'output' ? selectedNode : newNode;
        const target = direction === 'output' ? newNode : selectedNode;
        const sourcePortId = direction === 'output' ? port.id : other.id;
        const targetPortId = direction === 'output' ? other.id : port.id;
        return canConnectPorts(source, sourcePortId, target, targetPortId)
          && !validateGenerateImageReferenceLimit({
            edges, nodes: [...graphNodes, newNode], sourceNodeId: source.id, sourcePortId,
            target, targetNodeId: target.id, targetPortId,
          });
      });
      if (!newPort) continue;
      pair = { selectedNode, newNode,
        sourcePortId: direction === 'output' ? port.id : newPort.id,
        targetPortId: direction === 'output' ? newPort.id : port.id };
      break;
    }
    // Intersection: a candidate must work for EVERY selected node.
    if (!pair) return undefined;
    plan.push(pair);
  }
  return plan;
}

function prepareCandidate(candidate: ProductionNode, neighborPort: GraphPort): ProductionNode {
  // Match the existing wire-drag workflow for configurable pipeline fields.
  if ((candidate.type === 'pipelineInput' || candidate.type === 'pipelineOutput')
    && isPipelineContractFieldKind(neighborPort.kind)) {
    const data = candidate.data as PipelineInputNodeData;
    return { ...candidate, data: { ...data, fields: data.fields.map((field) => ({
      ...field, kind: neighborPort.kind, defaultValue: undefined,
      fields: neighborPort.kind === 'json' ? [] : undefined,
    })) } } as ProductionNode;
  }
  return candidate;
}
