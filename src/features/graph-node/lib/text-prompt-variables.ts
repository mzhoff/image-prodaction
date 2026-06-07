import type { TextPromptVariableDisplayMode } from '@/entities/production-graph/model/types';

export interface TextPromptVariableValue {
  alias: string;
  mentionAliases?: string[];
  value: string;
}

export function composeTextPromptResult(
  text: string,
  variableSlots: TextPromptVariableValue[],
) {
  let result = text ?? '';
  const slots = getMentionAliasEntries(variableSlots)
    .sort((first, second) => second.alias.length - first.alias.length);

  slots.forEach((slot) => {
    result = result.replace(createTextPromptMentionRegex(slot.alias), `$1${slot.value.trim()}`);
  });

  return result.trim();
}

export function formatTextPromptVariable(alias: string, value: string, displayMode: TextPromptVariableDisplayMode) {
  const { sourceText, valueText } = formatTextPromptVariableParts(alias, value, displayMode);
  if (sourceText && valueText) return `${sourceText}: ${valueText}`;
  return sourceText || valueText;
}

export function formatTextPromptVariableParts(alias: string, value: string, displayMode: TextPromptVariableDisplayMode) {
  const safeValue = value.trim() || 'None';
  if (displayMode === 'source') return { sourceText: alias, valueText: '' };
  if (displayMode === 'value') return { sourceText: '', valueText: safeValue };
  return {
    sourceText: alias,
    valueText: safeValue,
  };
}

export function normalizeTextPromptVariableDisplayMode(value: unknown): TextPromptVariableDisplayMode {
  return value === 'source' || value === 'value' || value === 'source-value' ? value : 'source-value';
}

export function getTextPromptMentionToken(alias: string) {
  return `@${alias}`;
}

export function splitTextPromptMentionTokens(
  text: string,
  variableSlots: TextPromptVariableValue[],
  displayMode: TextPromptVariableDisplayMode,
) {
  const slots = getMentionAliasEntries(variableSlots)
    .sort((first, second) => second.alias.length - first.alias.length);
  if (slots.length === 0) return [{ type: 'text' as const, text }];

  const pattern = slots.map((slot) => escapeRegExp(slot.alias)).join('|');
  const regex = new RegExp(`@(${pattern})(?=$|[\\s.,;:!?)}\\]\"'])`, 'g');
  const parts: Array<{
    type: 'mention';
    alias: string;
    sourceText: string;
    text: string;
    value: string;
    valueText: string;
  } | { type: 'text'; text: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ type: 'text', text: text.slice(lastIndex, index) });
    const mentionAlias = match[1] ?? '';
    const slot = slots.find((item) => item.alias === mentionAlias);
    const displayAlias = slot?.displayAlias ?? mentionAlias;
    const formatted = formatTextPromptVariableParts(displayAlias, slot?.value ?? '', displayMode);
    parts.push({
      type: 'mention',
      alias: displayAlias,
      sourceText: formatted.sourceText,
      text: formatTextPromptVariable(displayAlias, slot?.value ?? '', displayMode),
      value: slot?.value ?? '',
      valueText: formatted.valueText,
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ type: 'text', text: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ type: 'text' as const, text }];
}

function createTextPromptMentionRegex(alias: string) {
  return new RegExp(`(^|[\\s([{])@${escapeRegExp(alias)}(?=$|[\\s.,;:!?)}\\]\"'])`, 'g');
}

function getMentionAliasEntries(variableSlots: TextPromptVariableValue[]) {
  return variableSlots.flatMap((slot) => (
    getUniqueMentionAliases(slot)
      .filter(Boolean)
      .map((alias) => ({
        alias,
        displayAlias: slot.alias,
        value: slot.value,
      }))
  ));
}

function getUniqueMentionAliases(slot: TextPromptVariableValue) {
  return Array.from(new Set([slot.alias, ...(slot.mentionAliases ?? [])].map((alias) => alias.trim()).filter(Boolean)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
