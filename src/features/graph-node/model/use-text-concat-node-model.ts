'use client';

import { useEffect, useMemo } from 'react';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { getTextConcatInputCount, getTextConcatInputPortId } from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, TextConcatNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { useTextSectionFilters } from './use-text-section-filters';
import { clampTextConcatOptionalHeight, composeConcatText } from './text-workflow-values';

export function useTextConcatNodeModel(node: ProductionNode) {
  const data = node.data as TextConcatNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const inputCount = getTextConcatInputCount(node);
  const optionalTextHeight = clampTextConcatOptionalHeight(data.optionalTextHeight);
  const inputSlots = useMemo(() => Array.from({ length: inputCount }, (_, index) => {
    const portId = getTextConcatInputPortId(index);
    const incoming = getIncomingTextInputs(node.id, portId, { edges, nodes });
    return {
      connected: edges.some((edge) => edge.targetNodeId === node.id && edge.targetPortId === portId),
      index,
      portId,
      text: incoming.map((input) => input.text).join('\n\n'),
    };
  }), [edges, inputCount, node.id, nodes]);
  const sourceCount = inputSlots.filter((slot) => slot.text.trim()).length;
  const result = useMemo(() => composeConcatText(data, inputSlots.map((input) => input.text)), [data, inputSlots]);
  const filters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: result,
  });

  useEffect(() => {
    const nextData: Partial<TextConcatNodeData> = {};
    if (data.result !== result) nextData.result = result;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (data.optionalTextHeight !== optionalTextHeight) nextData.optionalTextHeight = optionalTextHeight;
    if (Object.keys(nextData).length > 0) updateNodeDataSilent(node.id, nextData);
  }, [data.optionalTextHeight, data.result, data.sourceCount, node.id, optionalTextHeight, result, sourceCount, updateNodeDataSilent]);

  return {
    data,
    disabledResultFilterIds: filters.disabledFilterIds,
    handleAddInput: () => updateNodeData(node.id, { inputCount: inputCount + 1 }),
    handleOptionalTextChange: (suffix: string) => updateNodeData(node.id, { suffix }),
    handleOptionalTextHeightChange: (height: number) => updateNodeData(node.id, {
      optionalTextHeight: clampTextConcatOptionalHeight(height),
    }),
    handleResultFilterToggle: filters.toggleFilter,
    inputSlots,
    optionalText: data.suffix,
    optionalTextHeight,
    result,
    resultFilterIssues: filters.duplicateIssues,
    sourceCount,
  };
}
