'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import {
  TEXT_PROMPT_VARIABLE_MAX_INPUTS,
  getTextPromptVariablePortId,
  getTextPromptVariablePortIndex,
  getTextPromptVariables,
} from '@/entities/production-graph/model/node-definitions';
import type { ProductionNode, TextPromptNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { composeTextPromptResult, normalizeTextPromptVariableDisplayMode } from '../lib/text-prompt-variables';
import { useTextSectionFilters } from './use-text-section-filters';
import {
  clampTextPromptTextareaHeight,
  getCustomTextPromptSourceAlias,
  samePromptVariables,
} from './text-workflow-values';

export function useTextPromptNodeModel(node: ProductionNode) {
  const data = node.data as TextPromptNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const redo = useProductionGraphStore((state) => state.redo);
  const undo = useProductionGraphStore((state) => state.undo);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const updateNodeDataSilent = useProductionGraphStore((state) => state.updateNodeDataSilent);
  const variables = useMemo(() => getTextPromptVariables(node), [node]);
  const variableDisplayMode = normalizeTextPromptVariableDisplayMode(data.variableDisplayMode);
  const variableSlots = useMemo(() => variables.map((variable, index) => {
    const incomingEdge = edges.find((edge) => edge.targetNodeId === node.id && edge.targetPortId === variable.id);
    const incoming = getIncomingTextInputs(node.id, variable.id, { edges, nodes });
    const sourceNode = incoming[0]?.sourceNode
      ?? (incomingEdge ? nodes.find((item) => item.id === incomingEdge.sourceNodeId) : undefined);
    const sourceAlias = getCustomTextPromptSourceAlias(sourceNode);
    const connected = Boolean(incomingEdge);
    return {
      ...variable,
      alias: sourceAlias ?? variable.alias,
      connected,
      index,
      mentionAliases: sourceAlias && sourceAlias !== variable.alias ? [variable.alias] : undefined,
      portId: variable.id,
      sourceLabel: sourceNode?.data.title ?? incoming[0]?.sourceLabel,
      value: incoming.map((input) => input.text).join('\n\n'),
    };
  }), [edges, node.id, nodes, variables]);
  const connectedSlots = variableSlots.filter((slot) => slot.connected);
  const singleSlot = connectedSlots.length === 1 ? connectedSlots[0] : undefined;
  const storedVariable = singleSlot ? variables.find((variable) => variable.id === singleSlot.portId) : undefined;
  const storedMention = singleSlot ? `@${storedVariable?.alias ?? singleSlot.alias}` : undefined;
  const sourceMention = singleSlot ? `@${singleSlot.alias}` : undefined;
  const passthroughMention = storedMention && (!data.text.trim() || data.text.trim() === sourceMention)
    ? storedMention
    : undefined;
  const sourceCount = variableSlots.filter((slot) => slot.value.trim()).length;
  const result = useMemo(
    () => composeTextPromptResult(passthroughMention ?? data.text, variableSlots),
    [data.text, passthroughMention, variableSlots],
  );
  const filters = useTextSectionFilters({
    disabledFilterIds: data.disabledResultFilterIds,
    onDisabledFilterIdsChange: (disabledResultFilterIds) => updateNodeData(node.id, { disabledResultFilterIds }),
    text: result,
  });
  const textareaHeight = clampTextPromptTextareaHeight(data.textareaHeight);

  useEffect(() => {
    const nextData: Partial<TextPromptNodeData> = {};
    if (passthroughMention && data.text !== passthroughMention) nextData.text = passthroughMention;
    if (data.result !== result) nextData.result = result;
    if (data.sourceCount !== sourceCount) nextData.sourceCount = sourceCount;
    if (data.textareaHeight !== textareaHeight) nextData.textareaHeight = textareaHeight;
    if (data.variableDisplayMode !== variableDisplayMode) nextData.variableDisplayMode = variableDisplayMode;
    if (!samePromptVariables(data.variables, variables)) nextData.variables = variables;
    if (Object.keys(nextData).length > 0) updateNodeDataSilent(node.id, nextData);
  }, [data.result, data.sourceCount, data.text, data.textareaHeight, data.variableDisplayMode, data.variables, node.id, passthroughMention, result, sourceCount, textareaHeight, updateNodeDataSilent, variableDisplayMode, variables]);

  const handleAddVariable = useCallback(() => {
    if (variables.length >= TEXT_PROMPT_VARIABLE_MAX_INPUTS) return undefined;
    const usedIndexes = new Set(variables.map((variable) => getTextPromptVariablePortIndex(variable.id)));
    const nextIndex = Array.from({ length: TEXT_PROMPT_VARIABLE_MAX_INPUTS }, (_, index) => index)
      .find((index) => !usedIndexes.has(index));
    if (typeof nextIndex !== 'number') return undefined;
    const variable = { id: getTextPromptVariablePortId(nextIndex), alias: `Variable ${nextIndex + 1}` };
    updateNodeData(node.id, { variables: [...variables, variable] });
    return variable;
  }, [node.id, updateNodeData, variables]);

  return {
    canAddVariable: variables.length < TEXT_PROMPT_VARIABLE_MAX_INPUTS,
    data,
    disabledResultFilterIds: filters.disabledFilterIds,
    handleAddVariable,
    handleDisplayModeChange: (value: string) => updateNodeData(node.id, {
      variableDisplayMode: normalizeTextPromptVariableDisplayMode(value),
    }),
    handleRedo: redo,
    handleResultFilterToggle: filters.toggleFilter,
    handleTextareaHeightChange: (height: number) => updateNodeData(node.id, {
      textareaHeight: clampTextPromptTextareaHeight(height),
    }),
    handleTextChange: (text: string) => updateNodeData(node.id, { text }),
    handleUndo: undo,
    hasVariables: variables.length > 0,
    result,
    resultFilterIssues: filters.duplicateIssues,
    sourceCount,
    textareaHeight,
    variableDisplayMode,
    variableSlots,
    variables,
  };
}
