import type { GraphPort, PipelineContractField, PipelineContractFieldKind, PipelineInputNodeData, PipelineOutputNodeData, ProductionNode, StructuredOutputNodeData } from './types';
import { getPipelineFieldPortId } from './pipeline-contract-fields';

export function pipelineFieldKindToPortKind(kind: PipelineContractFieldKind): GraphPort['kind'] {
  return kind;
}
export function getPipelineInputPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as PipelineInputNodeData;
  return data.fields.map((field) => createPipelineFieldPort(field, 'output'));
}
export function getPipelineOutputPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as PipelineOutputNodeData;
  return data.fields.map((field) => createPipelineFieldPort(field, 'input'));
}
export function getStructuredOutputPorts(node: ProductionNode): GraphPort[] {
  const data = node.data as StructuredOutputNodeData;
  return [
    { id: 'source', label: 'Source', kind: 'any', side: 'input' },
    { id: 'json', label: 'JSON', kind: 'json', side: 'output' },
    ...data.fields.map((field) => createPipelineFieldPort(field, 'output')),
  ];
}

function createPipelineFieldPort(field: PipelineContractField, side: GraphPort['side']): GraphPort {
  return {
    id: getPipelineFieldPortId(field.id),
    label: field.key,
    kind: pipelineFieldKindToPortKind(field.kind),
    side,
  };
}

