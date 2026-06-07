import type { LocationBuilderNodeData, LocationPreserveStrength, LocationType } from './types';

export interface LocationPassportTextInput {
  label?: string;
  text: string;
}

export const locationTypeLabels: Record<LocationType, string> = {
  abstract: 'Abstract',
  exterior: 'Exterior',
  interior: 'Interior',
  nature: 'Nature',
  studio: 'Studio',
  urban: 'Urban',
};

export const locationPreserveStrengthLabels: Record<LocationPreserveStrength, string> = {
  balanced: 'Balanced',
  flexible: 'Flexible',
  strict: 'Strict',
};

export function buildLocationPassportText(data: LocationBuilderNodeData, connectedTexts: LocationPassportTextInput[] = []) {
  const libraryBlock = formatLocationBlock('LIBRARY OBJECT', [
    formatLocationLine('Name / working ID', data.name),
    formatLocationLine('Object type', locationTypeLabels[data.locationType] ?? data.locationType),
    formatLocationLine('Preserve mode', getPreserveInstruction(data.preserveStrength)),
  ]);
  const descriptionBlock = formatLocationBlock('DESCRIPTION', [
    data.description?.trim(),
  ]);
  const environmentLayersBlock = formatLocationBlock('SEMANTIC LAYERS', [
    formatLocationLine('Spatial layout / geometry', data.spatialLayout),
    formatLocationLine('Atmosphere / surfaces / environmental cues', data.atmosphere),
    formatLocationLine('Mutable scene attributes / can change', data.mutableAttributes),
  ]);
  const constraintsBlock = formatLocationBlock('CONSTRAINTS', [
    formatLocationLine('Negative constraints', data.negativeConstraints),
    formatLocationLine('Additional notes', data.notes),
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
    environmentLayersBlock,
    constraintsBlock,
  ].filter(Boolean);

  if (manualBlocks.length === 0 && connectedBlocks.length === 0) return '';

  return [
    '[LOCATION PASSPORT]',
    manualBlocks.join('\n\n'),
    connectedBlocks.length ? `[CONNECTED SOURCE NOTES]\n${connectedBlocks.join('\n\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export function hasLocationPassportData(data: LocationBuilderNodeData, connectedTexts: LocationPassportTextInput[] = []) {
  return Boolean(buildLocationPassportText(data, connectedTexts));
}

function formatLocationLine(label: string, value?: string) {
  const cleanValue = value?.trim();
  return cleanValue ? `${label}: ${cleanValue}` : '';
}

function formatLocationBlock(label: string, lines: Array<string | undefined>) {
  const cleanLines = lines.map((line) => line?.trim()).filter(Boolean);
  return cleanLines.length ? `[${label}]\n${cleanLines.join('\n')}` : '';
}

function getPreserveInstruction(value: LocationPreserveStrength) {
  if (value === 'strict') return 'Strict. Preserve recognizable layout, architecture, surfaces, environmental identity, scale, and atmosphere unless the prompt explicitly overrides them.';
  if (value === 'flexible') return 'Flexible. Keep the location concept and core environmental language, but allow adaptation to scene, camera, style, time, and production context.';
  return 'Balanced. Preserve recognizable spatial identity and core environment traits while adapting lighting, weather, dressing, camera, and action when needed.';
}
