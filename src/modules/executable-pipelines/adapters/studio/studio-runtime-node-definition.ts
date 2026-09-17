import type { GraphEdge, ProductionNode, TimelineHandoffNodeData } from '@/entities/production-graph/model/types';
import { getNodeVideoAssetId } from '@/entities/production-graph/model/graph-video-io';
import type {
  PipelineInputBinding,
  PipelineNodeDefinition,
} from '../../contracts/pipeline-contracts';
import {
  getNodeTitle,
  getRuntimeOutput,
  invalidPipeline,
  resolveTransparentSource,
} from './studio-graph-resolution';
import { getRuntimeDescriptor } from './studio-runtime-descriptor';

export function createRuntimeNodeDefinition(input: {
  edges: GraphEdge[];
  inputNameByNodeId?: ReadonlyMap<string, string>;
  inputNameBySourcePort?: ReadonlyMap<string, string>;
  incomingByNode: ReadonlyMap<string, GraphEdge[]>;
  node: ProductionNode;
  nodeById: ReadonlyMap<string, ProductionNode>;
  outputPortIds?: string[];
  runtimeNodeIdSet: ReadonlySet<string>;
}): PipelineNodeDefinition {
  const descriptor = getRuntimeDescriptor(input.node, input);
  const bindings: Record<string, PipelineInputBinding> = {};
  const inputCounts = new Map<string, number>();
  for (const edge of input.edges) {
    const resolved = resolveTransparentSource(edge, input.incomingByNode, input.nodeById);
    if (!resolved) continue;
    const count = inputCounts.get(edge.targetPortId) ?? 0;
    inputCounts.set(edge.targetPortId, count + 1);
    const inputKey = count === 0 ? edge.targetPortId : `${edge.targetPortId}.${count + 1}`;
    const pipelineInputName = input.inputNameBySourcePort?.get(sourcePortKey(
      resolved.source.id,
      resolved.sourcePortId,
    )) ?? input.inputNameByNodeId?.get(resolved.source.id);
    if (pipelineInputName) {
      bindings[inputKey] = { source: 'pipeline-input', inputKey: pipelineInputName };
      continue;
    }
    if (!input.runtimeNodeIdSet.has(resolved.source.id)) {
      throw invalidPipeline(`Нода «${getNodeTitle(resolved.source)}» не поддерживается как источник серверной операции.`);
    }
    const sourceOutput = getRuntimeOutput(resolved.source, resolved.sourcePortId);
    if (!sourceOutput) {
      throw invalidPipeline(`Выход «${edge.sourcePortId}» ноды «${getNodeTitle(resolved.source)}» нельзя исполнить на сервере.`);
    }
    bindings[inputKey] = {
      source: 'node-output', nodeId: resolved.source.id, outputKey: sourceOutput.outputKey,
    };
  }
  if (input.node.type === 'timelineHandoff') {
    if (!bindings.video || Object.keys(bindings).length !== 1) throw invalidPipeline('Timeline Handoff требует ровно один video-вход.');
    const edge = input.edges.find((entry) => entry.targetPortId === 'video');
    const source = edge ? resolveTransparentSource(edge, input.incomingByNode, input.nodeById) : null;
    if (source?.source.type === 'importImage' && getNodeVideoAssetId(source.source, source.sourcePortId)
      !== (input.node.data as TimelineHandoffNodeData).analysis?.sourceAssetId) {
      throw invalidPipeline('Видео Timeline Handoff изменилось. Выполните новый разбор и проверку перед публикацией.');
    }
  }
  return {
    id: input.node.id,
    handlerType: descriptor.handlerType,
    handlerVersion: '1',
    config: descriptor.config,
    inputs: bindings,
  };
}

export function sourcePortKey(nodeId: string, portId: string) {
  return `${nodeId}\u0000${portId}`;
}
