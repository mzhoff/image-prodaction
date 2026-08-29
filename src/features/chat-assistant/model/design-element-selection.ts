import type { ChatMessage } from '@prodactionpro/chat-domain';
import type {
  BaseImageStrategy,
  DesignElementSelectionPayload,
  DesignElementSelectionResult,
  DetectedDesignElement,
  NormalizedDesignElementFrame,
  TextStrategy,
} from '@/modules/chat-assistant/contracts/design-element-selection';

export interface DesignElementSelectionDraft {
  baseImageStrategy: BaseImageStrategy;
  customElements: string[];
  selectedElementIds: string[];
  textStrategy: TextStrategy;
}

export function readDesignElementSelectionResult(
  value: Record<string, unknown> | undefined,
): DesignElementSelectionResult | undefined {
  if (!value || value.action !== 'select-design-elements' || value.version !== 1) return undefined;
  const interactionId = readString(value.interactionId);
  const intentSummary = readString(value.intentSummary);
  const elements = readElements(value.elements);
  if (!interactionId || !intentSummary || elements.length === 0) return undefined;
  const baseImageStrategy = value.baseImageStrategy === 'layered' ? 'layered' : 'single-image';
  const textStrategy = value.textStrategy === 'separate' ? 'separate' : 'embedded';
  const validIds = new Set(elements.map((element) => element.id));
  const recommendedElementIds = Array.isArray(value.recommendedElementIds)
    ? uniqueStrings(value.recommendedElementIds).filter((id) => validIds.has(id))
    : [];
  for (const element of elements) {
    if (element.role === 'qr' && !recommendedElementIds.includes(element.id)) {
      recommendedElementIds.push(element.id);
    }
  }
  return {
    action: 'select-design-elements',
    baseImageStrategy,
    elements,
    interactionId,
    intentSummary,
    nextStep: readString(value.nextStep),
    recommendedElementIds,
    recommendationReason: readString(value.recommendationReason),
    summary: readString(value.summary) || 'Выбери, что должно меняться в следующих вариантах макета.',
    textStrategy,
    version: 1,
  };
}

export function createRecommendedDesignElementSelection(
  result: DesignElementSelectionResult,
): DesignElementSelectionDraft {
  return enforceQrSelection(result, {
    baseImageStrategy: result.baseImageStrategy,
    customElements: [],
    selectedElementIds: result.recommendedElementIds,
    textStrategy: result.textStrategy,
  });
}

export function createAllDesignElementSelection(
  result: DesignElementSelectionResult,
  customElements: string[] = [],
): DesignElementSelectionDraft {
  return {
    baseImageStrategy: 'layered',
    customElements: normalizeCustomElements(customElements),
    selectedElementIds: result.elements.map((element) => element.id),
    textStrategy: 'separate',
  };
}

export function normalizeDesignElementSelection(
  result: DesignElementSelectionResult,
  draft: DesignElementSelectionDraft,
): DesignElementSelectionDraft {
  const elementById = new Map(result.elements.map((element) => [element.id, element]));
  const validIds = uniqueStrings(draft.selectedElementIds).filter((id) => elementById.has(id));
  const hasText = validIds.some((id) => elementById.get(id)?.kind === 'text');
  const hasVisualPart = validIds.some((id) => {
    const kind = elementById.get(id)?.kind;
    return kind === 'image' && elementById.get(id)?.role !== 'qr';
  });
  return enforceQrSelection(result, {
    baseImageStrategy: hasVisualPart ? 'layered' : draft.baseImageStrategy,
    customElements: normalizeCustomElements(draft.customElements),
    selectedElementIds: validIds,
    textStrategy: hasText ? 'separate' : draft.textStrategy,
  });
}

export function createDesignElementSelectionSubmission(
  result: DesignElementSelectionResult,
  draft: DesignElementSelectionDraft,
) {
  const normalized = normalizeDesignElementSelection(result, draft);
  const selectedElements = normalized.selectedElementIds.flatMap((id) => {
    const element = result.elements.find((candidate) => candidate.id === id);
    return element ? [element] : [];
  });
  const payload: DesignElementSelectionPayload = {
    baseImageStrategy: normalized.baseImageStrategy,
    customElements: normalized.customElements,
    interactionId: result.interactionId,
    kind: 'design-element-selection',
    selectedElementIds: selectedElements.map((element) => element.id),
    selectedElements,
    textStrategy: normalized.textStrategy,
    version: 1,
  };
  const selectedLabels = [
    ...selectedElements.map((element) => element.label),
    ...normalized.customElements,
  ];
  const message = [
    'Выбор для повторяемого макета:',
    `Основа изображения: ${formatBaseImageStrategy(normalized.baseImageStrategy)}.`,
    `Текст: ${formatTextStrategy(normalized.textStrategy)}.`,
    `Отдельно редактировать: ${selectedLabels.length ? selectedLabels.join(', ') : 'ничего дополнительно'}.`,
    'Подготовь по этому выбору один preview пайплайна без дополнительных подтверждений в чате.',
  ].join('\n');
  return { message, payload };
}

export function readSubmittedDesignElementSelection(
  messages: readonly ChatMessage[],
  interactionId: string,
): DesignElementSelectionPayload | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = messages[index]?.metadata;
    if (!isRecord(metadata) || !isRecord(metadata.selectedAction)) continue;
    const payload = metadata.selectedAction.payload;
    if (!isRecord(payload)
      || payload.kind !== 'design-element-selection'
      || payload.version !== 1
      || payload.interactionId !== interactionId) continue;
    return {
      baseImageStrategy: payload.baseImageStrategy === 'layered' ? 'layered' : 'single-image',
      customElements: uniqueStrings(payload.customElements),
      interactionId,
      kind: 'design-element-selection',
      selectedElementIds: uniqueStrings(payload.selectedElementIds),
      selectedElements: readElements(payload.selectedElements),
      textStrategy: payload.textStrategy === 'separate' ? 'separate' : 'embedded',
      version: 1,
    };
  }
  return undefined;
}

export function formatBaseImageStrategy(value: BaseImageStrategy) {
  return value === 'layered'
    ? 'фон, герой и декор отдельными слоями'
    : 'фон, герой и декор одним изображением';
}

export function formatTextStrategy(value: TextStrategy) {
  return value === 'separate'
    ? 'отдельными редактируемыми слоями'
    : 'внутри изображения';
}

function enforceQrSelection(
  result: DesignElementSelectionResult,
  draft: DesignElementSelectionDraft,
): DesignElementSelectionDraft {
  const qrIds = result.elements.filter((element) => element.role === 'qr').map((element) => element.id);
  return {
    ...draft,
    selectedElementIds: uniqueStrings([...draft.selectedElementIds, ...qrIds]),
  };
}

function readElements(value: unknown): DetectedDesignElement[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((element) => {
    if (!isRecord(element)) return [];
    const id = readString(element.id);
    const label = readString(element.label);
    const detectedKind = readKind(element.kind);
    const role = readString(element.role) as DetectedDesignElement['role'];
    if (!id || ids.has(id) || !label || !detectedKind || !role) return [];
    ids.add(id);
    const kind = role === 'qr' ? 'image' : detectedKind;
    const confidence = typeof element.confidence === 'number' ? element.confidence : undefined;
    const observedContent = readString(element.observedContent) || undefined;
    const referenceFrame = readReferenceFrame(element.referenceFrame);
    return [{
      ...(confidence === undefined ? {} : { confidence }),
      id,
      kind,
      label,
      ...(observedContent ? { observedContent } : {}),
      ...(referenceFrame ? { referenceFrame } : {}),
      role,
    }];
  });
}

function readKind(value: unknown): DetectedDesignElement['kind'] | undefined {
  return value === 'text' || value === 'image'
    ? value
    : undefined;
}

function readReferenceFrame(value: unknown): NormalizedDesignElementFrame | undefined {
  if (!isRecord(value)) return undefined;
  const x = readFiniteNumber(value.x);
  const y = readFiniteNumber(value.y);
  const width = readFiniteNumber(value.width);
  const height = readFiniteNumber(value.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return undefined;
  return { height, width, x, y };
}

function readFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeCustomElements(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim().slice(0, 80)).filter(Boolean))].slice(0, 8);
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim()))];
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
