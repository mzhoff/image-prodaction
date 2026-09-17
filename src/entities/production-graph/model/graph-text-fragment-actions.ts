import { createDefaultNode } from './create-default-node';
import { appendFormatterTextFragment } from './formatter-text-fragment';
import { withHistory } from './graph-history';
import { updateTextResult } from './text-result-history';
import { normalizeTextSectionFilterId, parseTextSectionFilters } from './text-section-filters';
import { extractLayerTextSectionParseOptions } from './extract-layer-parser';
import { appendTextFragment, fragmentFieldValue, hasBoundFragmentVariables, textFragmentSections } from './text-fragments';
import { isNodeInsideLockedSection } from './graph-selection-actions';
import type { StoreSet } from './store-action-types';
import type { ConnectResult, ProductionGraphState } from './store-types';
import type { ProductionNode, TextGenerationNodeData, TextPromptNodeData, TextFormatterNodeData } from './types';

export function createGraphTextFragmentActions(set: StoreSet): Pick<ProductionGraphState, 'dropTextFragment'> {
  return { dropTextFragment: (source, target, copy) => {
    let result: ConnectResult = { ok: false, reason: 'Перенос отменён: текст изменился. Выдели его ещё раз.' };
    set((state) => {
      const from = state.nodes.find((node) => node.id === source.nodeId);
      if (!from || source.start < 0 || source.end > source.expectedValue.length || source.start >= source.end) return state;
      const text = source.expectedValue.slice(source.start, source.end);
      const labels = new Set(textFragmentSections(text).map((section) => section.label));
      const disabledLabels = source.disabledLabels?.filter((label) => labels.has(label));
      if (!text.trim()) return state;
      const value = source.field ? fragmentFieldValue(from, source.field) : undefined;
      if (source.field && value !== source.expectedValue) return state;
      if (hasBoundFragmentVariables(from, text)) {
        result = { ok: false, reason: 'Фрагмент содержит связанную @переменную. Перенеси всю Prompt-ноду, чтобы сохранить её подключения.' };
        return state;
      }
      const moving = !copy && !source.copyOnly && from.type !== 'textFormatter' && !from.locked && !isNodeInsideLockedSection(from, state.sections) && from.status !== 'running' && value !== undefined;
      const to = 'nodeId' in target ? state.nodes.find((node) => node.id === target.nodeId) : undefined;
      if ('nodeId' in target && (!to || to.locked || isNodeInsideLockedSection(to, state.sections) || to.status === 'running' || fragmentFieldValue(to, target.field) === undefined)) {
        result = { ok: false, reason: 'Эта область сейчас не принимает текст.' }; return state;
      }
      if ('nodeId' in target && target.nodeId === from.id && target.field === source.field) {
        result = { ok: false, reason: 'Выбери другое поле или свободное место канваса.' }; return state;
      }
      if ('position' in target && (!Number.isFinite(target.position.x) || !Number.isFinite(target.position.y))) return state;
      let destinationId: string;
      let nodes = state.nodes;
      if ('position' in target) {
        const prompt = createDefaultNode('textPrompt', target.position);
        prompt.data = { ...prompt.data, text, result: text, presentation: 'card' } as TextPromptNodeData;
        nodes = [...nodes, writeField(prompt, 'text', text, disabledLabels)];
        destinationId = prompt.id;
      } else {
        destinationId = target.nodeId;
        nodes = nodes.map((node) => node.id === target.nodeId
          ? node.type === 'textFormatter'
            ? { ...node, data: appendFormatterTextFragment(node.data as TextFormatterNodeData, text) }
            : writeField(node, target.field, appendTextFragment(fragmentFieldValue(node, target.field)!, text), disabledLabels)
          : node);
      }
      if (moving) {
        const remainingText = source.expectedValue.slice(0, source.start) + source.expectedValue.slice(source.end);
        const moveWholePrompt = 'nodeId' in target
          && from.type === 'textPrompt'
          && source.field === 'text'
          && !remainingText.trim();
        nodes = moveWholePrompt
          ? nodes.filter((node) => node.id !== from.id)
          : nodes.map((node) => node.id === from.id ? writeField(node, source.field!, remainingText) : node);
        if (moveWholePrompt) {
          const edges = state.edges.filter((edge) => edge.sourceNodeId !== from.id && edge.targetNodeId !== from.id);
          result = { ok: true };
          return { ...withHistory(state), nodes, edges, selectedNodeIds: [destinationId], selectedSectionIds: [] };
        }
      }
      result = { ok: true };
      return { ...withHistory(state), nodes, selectedNodeIds: [destinationId], selectedSectionIds: [] };
    });
    return result;
  } };
}

function writeField(node: ProductionNode, field: string, text: string, disabledLabels: string[] = []): ProductionNode {
  let data = { ...node.data, [field]: text };
  if (node.type === 'textGeneration' && field === 'result') data = { ...data, ...updateTextResult(node.data as TextGenerationNodeData, text) };
  if (node.type === 'textPrompt' && field === 'text') data = { ...data, result: '' };
  if (field === 'result' || (node.type === 'textPrompt' && field === 'text')) {
    const key = node.type === 'imageToText' ? 'disabledLayerIds' : 'disabledResultFilterIds';
    const old = (node.data as unknown as Record<string, unknown>)[key] as string[] | undefined;
    const options = node.type === 'imageToText' ? extractLayerTextSectionParseOptions : undefined;
    const filters = parseTextSectionFilters(text, options);
    const mutedLabels = new Set(disabledLabels.map(normalizeTextSectionFilterId));
    // Muted sections stay muted, including collisions, rather than silently re-enabling content.
    data = { ...data, [key]: filters.filter((filter) => old?.includes(filter.id) || mutedLabels.has(normalizeTextSectionFilterId(filter.label))).map((filter) => filter.id) };
  }
  return { ...node, data } as ProductionNode;
}
