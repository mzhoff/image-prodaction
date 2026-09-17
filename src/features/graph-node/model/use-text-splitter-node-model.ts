'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { getTextSplitterItemPortIndex, TEXT_SPLITTER_MAX_ITEMS } from '@/entities/production-graph/model/node-definitions';
import { splitProductionText } from '@/entities/production-graph/model/text-splitter';
import { getTextSplitterSlotLabel, reconcileTextSplitterSlots } from '@/entities/production-graph/model/text-splitter-slots';
import type { ProductionNode, TextSplitterMode, TextSplitterNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { valueSelectOptions } from '../lib/node-select-options';
import { textSplitterModeOptions } from './text-workflow-options';
import { arraysEqual, clampIndex } from './text-workflow-values';

export function useTextSplitterNodeModel(node: ProductionNode) {
  const data = node.data as TextSplitterNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const addNode = useProductionGraphStore((state) => state.addNode);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const updateTextPrompt = useProductionGraphStore((state) => state.updateTextPrompt);
  const sourceText = useMemo(() => getIncomingTextInputs(node.id, 'text', { edges, nodes })
    .map((input) => input.text).join('\n\n'), [edges, node.id, nodes]);
  const items = useMemo(
    () => splitProductionText(sourceText, data.mode, data.delimiter),
    [data.delimiter, data.mode, sourceText],
  );
  const slots = useMemo(() => reconcileTextSplitterSlots(items, data, edges
    .filter((edge) => edge.sourceNodeId === node.id)
    .map((edge) => getTextSplitterItemPortIndex(edge.sourcePortId))), [items, data, edges, node.id]);
  const visibleItems = slots.items;
  const message = slots.overflowCount > 0
    ? `Не помещается фрагментов: ${slots.overflowCount}. Лимит — ${TEXT_SPLITTER_MAX_ITEMS} выходов, включая сохранённые связи. Используйте ещё один Splitter.`
    : '';
  const activeItemIndex = clampIndex(data.activeItemIndex ?? 0, visibleItems.length);
  const result = visibleItems[activeItemIndex] ?? '';

  useEffect(() => {
    const isCurrent = data.sourceText === sourceText
      && arraysEqual(data.items ?? [], visibleItems)
      && arraysEqual(data.itemKeys ?? [], slots.itemKeys)
      && data.result === result
      && data.activeItemIndex === activeItemIndex
      && data.message === message;
    if (!isCurrent) updateNodeDataSilent(node.id, { activeItemIndex, items: visibleItems, itemKeys: slots.itemKeys, message, result, sourceText });
  }, [activeItemIndex, data.activeItemIndex, data.items, data.itemKeys, data.message, data.result, data.sourceText, message, node.id, result, slots.itemKeys, sourceText, updateNodeDataSilent, visibleItems]);

  const handleCreateTextNodes = useCallback(() => {
    visibleItems.filter(Boolean).slice(0, 12).forEach((item, index) => {
      const nodeId = addNode('textPrompt', {
        x: node.position.x + 430,
        y: node.position.y + index * 260,
      });
      updateTextPrompt(nodeId, item);
    });
  }, [addNode, node.position.x, node.position.y, updateTextPrompt, visibleItems]);

  return {
    activeItemIndex,
    data,
    handleActiveItemChange: (value: string) => updateNodeData(node.id, { activeItemIndex: Number(value) }),
    handleCreateTextNodes,
    handleDelimiterChange: (delimiter: string) => updateNodeData(node.id, { delimiter }),
    handleModeChange: (mode: string) => updateNodeData(node.id, { mode: mode as TextSplitterMode }),
    handleSplitRuleChange: (delimiter: string) => updateNodeData(node.id, { delimiter, mode: 'delimiter' }),
    itemOptions: valueSelectOptions(visibleItems.map((_, index) => String(index))),
    items: visibleItems,
    itemLabels: slots.itemKeys.map(getTextSplitterSlotLabel),
    activeItemCount: visibleItems.filter(Boolean).length,
    message,
    modeOptions: textSplitterModeOptions,
    result,
    sourceText,
  };
}
