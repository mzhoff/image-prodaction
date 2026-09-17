import { fragmentFieldValue, textFragmentSections, type TextFragmentSource, type TextFragmentTarget } from '@/entities/production-graph/model/text-fragments';
import { parseTextSectionFilters } from '@/entities/production-graph/model/text-section-filters';
import { extractLayerTextSectionParseOptions } from '@/entities/production-graph/model/extract-layer-parser';
import { isNodeInsideLockedSection } from '@/entities/production-graph/model/graph-selection-actions';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { selectedFragmentRange } from '@/features/graph-node/ui/text-fragment-selection';

export const FRAGMENT_HANDLE = '[data-text-fragment-handle]';
const FIELD = '[data-text-field]';

export function eventElement(event: Event) {
  return event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
}

function findEditor(node: Element, field: string | undefined) {
  return [...node.querySelectorAll<HTMLElement>(FIELD)].find((item) => item.dataset.textField === field && !item.matches(FRAGMENT_HANDLE));
}

export function getFragmentDragSource(element: Element): TextFragmentSource | null {
  const handle = element.closest<HTMLElement>(FRAGMENT_HANDLE);
  const nearest = element.closest<HTMLElement>(FIELD);
  const card = element.closest<HTMLElement>('[data-node-id]');
  const state = useProductionGraphStore.getState();
  const node = state.nodes.find((item) => item.id === card?.dataset.nodeId);
  if (!node || !card) return null;
  const field = nearest?.dataset.textField;
  const editor = handle ? findEditor(card, field) : nearest ?? element.closest<HTMLElement>('textarea,[contenteditable]');
  if (!editor) return null;
  const value = field ? fragmentFieldValue(node, field) : undefined;
  const stored = field ? (node.data as unknown as Record<string, unknown>)[field] : undefined;
  const expected = value ?? (typeof stored === 'string' ? stored : editor instanceof HTMLTextAreaElement ? editor.value : editor.textContent ?? '');
  let range: { start: number; end: number } | null;
  if (handle) {
    const start = Number(handle.dataset.textRangeStart);
    const section = textFragmentSections(expected).find((item) => item.start === start);
    range = handle.dataset.textSectionLabel ? section ?? null : { start, end: Number(handle.dataset.textRangeEnd) };
  } else range = selectedFragmentRange(editor, expected);
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start >= range.end || range.end > expected.length) return null;
  const data = node.data as unknown as Record<string, unknown>;
  const disabled = (node.type === 'imageToText' ? data.disabledLayerIds : data.disabledResultFilterIds) as string[] | undefined;
  return {
    nodeId: node.id, field: value === undefined ? undefined : field, expectedValue: expected, start: range.start, end: range.end,
    copyOnly: node.type === 'textFormatter' || node.locked || isNodeInsideLockedSection(node, state.sections) || node.status === 'running' || value === undefined
      || handle?.dataset.textReadonly === 'true' || (editor instanceof HTMLTextAreaElement && editor.readOnly) || editor.contentEditable === 'false',
    disabledLabels: parseTextSectionFilters(expected, node.type === 'imageToText' ? extractLayerTextSectionParseOptions : undefined)
      .filter((filter) => disabled?.includes(filter.id)).map((filter) => filter.label),
  };
}

export function resolveFragmentDrop(canvas: HTMLElement, element: Element | null, source: TextFragmentSource,
  position: { x: number; y: number } | null): { target: TextFragmentTarget; element: HTMLElement | null } | null {
  if (!element || !canvas.contains(element)) return null;
  const card = element.closest<HTMLElement>('[data-node-id]');
  const nearest = element.closest<HTMLElement>(FIELD);
  const field = nearest?.matches(FRAGMENT_HANDLE) && card ? findEditor(card, nearest.dataset.textField) : nearest;
  if (field) {
    const state = useProductionGraphStore.getState();
    const node = state.nodes.find((item) => item.id === card?.dataset.nodeId);
    if (!node || node.locked || isNodeInsideLockedSection(node, state.sections) || node.status === 'running' || !field.dataset.textField
      || fragmentFieldValue(node, field.dataset.textField) === undefined
      || (field instanceof HTMLTextAreaElement && field.readOnly) || field.contentEditable === 'false'
      || (source.nodeId === node.id && source.field === field.dataset.textField)) return null;
    return { target: { nodeId: node.id, field: field.dataset.textField }, element: field };
  }
  if (element.closest('[data-node-id],button,input,textarea,[contenteditable],[data-canvas-ui],.document-title-bar,.document-node-palette')) return null;
  return position ? { target: { position }, element: null } : null;
}
