import {
  TEXT_PROMPT_VARIABLE_MAX_INPUTS,
  getTextPromptVariablePortId,
  getTextPromptVariablePortIndex,
} from './node-definitions';

export function normalizeTextPromptVariables(value: unknown) {
  if (!Array.isArray(value)) return [];
  const usedPortIds = new Set<string>();
  return value.slice(0, TEXT_PROMPT_VARIABLE_MAX_INPUTS).map((item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawPortId = typeof candidate.id === 'string' ? candidate.id : '';
    const fallbackPortId = getTextPromptVariablePortId(index);
    const portId = getTextPromptVariablePortIndex(rawPortId) >= 0 && !usedPortIds.has(rawPortId)
      ? rawPortId
      : fallbackPortId;
    usedPortIds.add(portId);
    const alias = typeof candidate.alias === 'string' && candidate.alias.trim()
      ? candidate.alias.trim()
      : `Variable ${getTextPromptVariablePortIndex(portId) + 1}`;
    return { id: portId, alias };
  });
}

export function normalizeTextPromptVariableDisplayMode(value: unknown) {
  return value === 'source' || value === 'value' || value === 'source-value' ? value : 'source-value';
}

export function normalizeTextPromptTextareaHeight(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 248;
  return Math.min(Math.max(Math.round(value), 64), 560);
}
