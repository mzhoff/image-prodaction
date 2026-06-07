import type { SubjectBuilderNodeData, SubjectPreserveStrength, SubjectType } from './types';

export interface SubjectPassportTextInput {
  label?: string;
  text: string;
}

export const subjectTypeLabels: Record<SubjectType, string> = {
  animal: 'Animal',
  character: 'Character',
  object: 'Object',
  person: 'Person',
  place: 'Place',
  product: 'Product',
  vehicle: 'Vehicle',
};

export const subjectPreserveStrengthLabels: Record<SubjectPreserveStrength, string> = {
  balanced: 'Balanced',
  flexible: 'Flexible',
  strict: 'Strict',
};

export function buildSubjectPassportText(data: SubjectBuilderNodeData, connectedTexts: SubjectPassportTextInput[] = []) {
  const libraryBlock = formatSubjectBlock('LIBRARY OBJECT', [
    formatSubjectLine('Name / working ID', data.name),
    formatSubjectLine('Object type', subjectTypeLabels[data.subjectType] ?? data.subjectType),
    formatSubjectLine('Preserve mode', getPreserveInstruction(data.preserveStrength)),
  ]);
  const descriptionBlock = formatSubjectBlock('DESCRIPTION', [
    data.identitySummary?.trim(),
  ]);
  const passportLayersBlock = formatSubjectBlock('SEMANTIC LAYERS', [
    formatSubjectLine('Stable identity / cannot change', data.immutableTraits),
    formatSubjectLine('Mutable scene attributes / can change', data.mutableAttributes),
  ]);
  const constraintsBlock = formatSubjectBlock('CONSTRAINTS', [
    formatSubjectLine('Negative constraints', data.negativeConstraints),
    formatSubjectLine('Additional notes', data.notes),
  ]);
  const connectedBlocks = connectedTexts
    .map((input, index) => {
      const text = input.text.trim();
      if (!text) return '';
      const label = input.label?.trim() || `Connected text ${index + 1}`;
      return `[${label}]\n${text}`;
    })
    .filter(Boolean);

  const manualBlocks = [
    libraryBlock,
    descriptionBlock,
    passportLayersBlock,
    constraintsBlock,
  ].filter(Boolean);

  if (manualBlocks.length === 0 && connectedBlocks.length === 0) return '';

  return [
    '[SUBJECT PASSPORT]',
    manualBlocks.join('\n\n'),
    connectedBlocks.length ? `[CONNECTED SOURCE NOTES]\n${connectedBlocks.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function hasSubjectPassportData(data: SubjectBuilderNodeData, connectedTexts: SubjectPassportTextInput[] = []) {
  return Boolean(buildSubjectPassportText(data, connectedTexts));
}

function formatSubjectLine(label: string, value?: string) {
  const cleanValue = value?.trim();
  return cleanValue ? `${label}: ${cleanValue}` : '';
}

function formatSubjectBlock(label: string, lines: Array<string | undefined>) {
  const cleanLines = lines.map((line) => line?.trim()).filter(Boolean);
  return cleanLines.length ? `[${label}]\n${cleanLines.join('\n')}` : '';
}

function getPreserveInstruction(value: SubjectPreserveStrength) {
  if (value === 'strict') return 'Strict. Preserve identity, proportions, face, key silhouette, material marks, and recognizable traits unless the prompt explicitly overrides them.';
  if (value === 'flexible') return 'Flexible. Keep the concept and recognizable core, but allow adaptation to the target scene, style, pose, and production context.';
  return 'Balanced. Preserve recognizable identity and core traits while adapting pose, lighting, styling, and scene details when needed.';
}
