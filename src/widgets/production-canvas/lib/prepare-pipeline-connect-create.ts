import {
  getPipelineFieldPortId,
  type PipelineContractField,
} from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import {
  CONNECT_CREATE_PIPELINE_FIELD_PORT,
  type ConnectCreateOption,
} from './connect-create-menu';

export function preparePipelineConnectCreate(
  nodeId: string,
  option: ConnectCreateOption,
) {
  let targetPortId = option.targetPortId;
  let sourcePortId = option.sourcePortId;
  if (!option.pipelineFieldKind) return { sourcePortId, targetPortId };

  const graph = useProductionGraphStore.getState();
  const createdNode = graph.nodes.find((node) => node.id === nodeId);
  const field = (createdNode?.data as { fields?: PipelineContractField[] } | undefined)?.fields?.[0];
  if (!field) return { sourcePortId, targetPortId };

  graph.updateNodeDataSilent(nodeId, {
    fields: [{
      ...field,
      kind: option.pipelineFieldKind,
      defaultValue: undefined,
      ...(option.pipelineFieldKind === 'json'
        ? { fields: field.fields ?? [] }
        : { fields: undefined }),
    }],
  });
  const resolvedPortId = getPipelineFieldPortId(field.id);
  if (targetPortId === CONNECT_CREATE_PIPELINE_FIELD_PORT) targetPortId = resolvedPortId;
  if (sourcePortId === CONNECT_CREATE_PIPELINE_FIELD_PORT) sourcePortId = resolvedPortId;
  return { sourcePortId, targetPortId };
}
