import {
  DESIGN_ELEMENT_KINDS,
  DESIGN_ELEMENT_ROLES,
  type BaseImageStrategy,
  type DesignElementKind,
  type DesignElementRole,
  type DesignElementSelectionResult,
  type DetectedDesignElement,
  type NormalizedDesignElementFrame,
  type TextStrategy,
} from '../contracts/design-element-selection';

const kindSet = new Set<string>(DESIGN_ELEMENT_KINDS);
const roleSet = new Set<string>(DESIGN_ELEMENT_ROLES);

export function createDesignElementSelection(
  input: Record<string, unknown>,
  interactionId: string,
): DesignElementSelectionResult {
  const intentSummary = readString(input.intentSummary).slice(0, 320);
  if (intentSummary.length < 4) throw new Error('Design selection requires a clear user intent.');

  const elements = readElements(input.elements);
  if (elements.length === 0) throw new Error('Design selection requires at least one detected element.');

  const baseImageStrategy = readBaseImageStrategy(input.baseImageStrategy);
  const textStrategy = readTextStrategy(input.textStrategy);
  const recommendedElementIds = elements.flatMap((element) => {
    if (element.role === 'qr') return [element.id];
    if (element.kind === 'text') return textStrategy === 'separate' ? [element.id] : [];
    return baseImageStrategy === 'layered' ? [element.id] : [];
  });

  return {
    action: 'select-design-elements',
    baseImageStrategy,
    elements,
    interactionId,
    intentSummary,
    nextStep: 'Wait for the user selection. The product will send a structured follow-up; only then prepare one pipeline proposal.',
    recommendedElementIds,
    recommendationReason: baseImageStrategy === 'single-image' && textStrategy === 'embedded'
      ? 'Начинаем с простого рабочего варианта: основа и текст создаются одним изображением, QR остаётся отдельным.'
      : 'Отдельные слои выбраны только для элементов, которыми пользователь явно хочет управлять.',
    summary: 'Выбери, что должно меняться в следующих вариантах макета.',
    textStrategy,
    version: 1,
  };
}

function readElements(value: unknown): DetectedDesignElement[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = readString(candidate.id);
    const detectedKind = readKind(candidate.kind);
    const role = readRole(candidate.role);
    const label = readString(candidate.label).slice(0, 100);
    if (!id || !/^[a-z][a-z0-9-]{1,63}$/u.test(id) || ids.has(id) || !detectedKind || !role || !label) return [];
    ids.add(id);
    const kind = role === 'qr' ? 'image' : detectedKind;
    const observedContent = readString(candidate.observedContent).slice(0, 240) || undefined;
    const confidence = readConfidence(candidate.confidence);
    const referenceFrame = readReferenceFrame(candidate.referenceFrame);
    return [{
      ...(confidence === undefined ? {} : { confidence }),
      id,
      kind,
      label,
      ...(observedContent ? { observedContent } : {}),
      ...(referenceFrame ? { referenceFrame } : {}),
      role,
    }];
  }).slice(0, 24);
}

function readBaseImageStrategy(value: unknown): BaseImageStrategy {
  return value === 'layered' ? 'layered' : 'single-image';
}

function readTextStrategy(value: unknown): TextStrategy {
  return value === 'separate' ? 'separate' : 'embedded';
}

function readKind(value: unknown): DesignElementKind | undefined {
  return typeof value === 'string' && kindSet.has(value) ? value as DesignElementKind : undefined;
}

function readRole(value: unknown): DesignElementRole | undefined {
  return typeof value === 'string' && roleSet.has(value) ? value as DesignElementRole : undefined;
}

function readConfidence(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
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

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
