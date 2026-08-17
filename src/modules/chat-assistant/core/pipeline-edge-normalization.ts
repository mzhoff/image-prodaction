import { canConnectPorts, getNodePorts } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode } from '@/entities/production-graph/model/types';

export function normalizeUnambiguousEdgePorts(input: {
  source: ProductionNode;
  sourceLabel: string;
  sourcePortId: string;
  target: ProductionNode;
  targetLabel: string;
  targetPortId: string;
  warnings: string[];
}) {
  if (canConnectPorts(input.source, input.sourcePortId, input.target, input.targetPortId)) {
    return { sourcePortId: input.sourcePortId, targetPortId: input.targetPortId };
  }
  const compatible = getNodePorts(input.source).flatMap((sourcePort) => (
    sourcePort.side !== 'output' ? [] : getNodePorts(input.target).flatMap((targetPort) => (
      targetPort.side === 'input'
      && canConnectPorts(input.source, sourcePort.id, input.target, targetPort.id)
        ? [{ sourcePortId: sourcePort.id, targetPortId: targetPort.id }]
        : []
    ))
  ));
  if (compatible.length !== 1 || !compatible[0]) {
    return { sourcePortId: input.sourcePortId, targetPortId: input.targetPortId };
  }
  const normalized = compatible[0];
  input.warnings.push([
    `Порты ${input.sourceLabel}.${input.sourcePortId} -> ${input.targetLabel}.${input.targetPortId}`,
    `исправлены на ${input.sourceLabel}.${normalized.sourcePortId} -> ${input.targetLabel}.${normalized.targetPortId}:`,
    'это единственная совместимая пара для этих нод.',
  ].join(' '));
  return normalized;
}
