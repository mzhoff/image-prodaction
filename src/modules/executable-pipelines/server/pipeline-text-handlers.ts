import { TEXT_SPLITTER_MAX_ITEMS } from '@/entities/production-graph/model/node-definitions';
import { splitProductionText } from '@/entities/production-graph/model/text-splitter';
import type { PipelineNodeHandler, PipelineValue } from '../contracts/pipeline-contracts';
import {
  compareInputKeys,
  isString,
  readString,
  readTextSplitterMode,
} from './pipeline-handler-values';

export function createDeterministicTextHandlers(): PipelineNodeHandler[] {
  return [
    createTextTemplateHandler(),
    createTextConcatHandler(),
    createTextSplitHandler(),
    createTextFormatHandler(),
  ];
}

function createTextSplitHandler(): PipelineNodeHandler {
  return {
    handlerType: 'text.split',
    handlerVersion: '1',
    async execute(input) {
      const text = Object.values(input.inputs).filter(isString).join('\n\n');
      const items = splitProductionText(
        text,
        readTextSplitterMode(input.config.mode),
        readString(input.config.delimiter),
      ).slice(0, TEXT_SPLITTER_MAX_ITEMS);
      return { items, ...Object.fromEntries(items.map((item, index) => [`item-${index}`, item])) };
    },
  };
}

function createTextFormatHandler(): PipelineNodeHandler {
  return {
    handlerType: 'text.format',
    handlerVersion: '1',
    async execute(input) {
      const connectedText = Object.values(input.inputs).filter(isString).join('\n\n');
      return { text: (connectedText || readString(input.config.fallbackText)).replace(/\u00a0/g, ' ').trim() };
    },
  };
}

function createTextTemplateHandler(): PipelineNodeHandler {
  return {
    handlerType: 'text.template.render',
    handlerVersion: '1',
    async execute(input) {
      const template = readString(input.config.template);
      const variables = readTemplateVariables(input.config.variables);
      const connectedValues = Object.values(input.inputs).filter(isString);
      if (!template.trim() && connectedValues.length === 1) return { text: connectedValues[0] };
      let text = template;
      const mentions = variables.flatMap((variable) => variable.aliases.map((alias) => ({
        alias, id: variable.id,
      }))).sort((first, second) => second.alias.length - first.alias.length);
      for (const mention of mentions) {
        const value = input.inputs[mention.id];
        if (typeof value !== 'string') continue;
        text = text.replace(createTemplateMentionRegex(mention.alias), (_match, prefix: string) => `${prefix}${value}`);
      }
      return { text };
    },
  };
}

function createTextConcatHandler(): PipelineNodeHandler {
  return {
    handlerType: 'text.concat',
    handlerVersion: '1',
    async execute(input) {
      const separator = resolveSeparator(
        readString(input.config.separator),
        readString(input.config.customSeparator),
      );
      const parts = Object.entries(input.inputs)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .sort(([first], [second]) => compareInputKeys(first, second))
        .map(([, value]) => value.trim())
        .filter(Boolean);
      return {
        text: [readString(input.config.prefix).trim(), parts.join(separator), readString(input.config.suffix).trim()]
          .filter(Boolean).join(separator),
      };
    },
  };
}

function readTemplateVariables(value: PipelineValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { id, alias } = item;
    if (typeof id !== 'string' || typeof alias !== 'string' || !id || !alias) return [];
    const mentionAliases = Array.isArray(item.mentionAliases)
      ? item.mentionAliases.filter((candidate): candidate is string => typeof candidate === 'string' && Boolean(candidate.trim()))
      : [];
    return [{ id, aliases: Array.from(new Set([alias, ...mentionAliases].map((candidate) => candidate.trim()))) }];
  });
}

function createTemplateMentionRegex(alias: string) {
  return new RegExp(`(^|[\\s([{])@${escapeRegExp(alias)}(?=$|[\\s.,;:!?)}\\]"'])`, 'gu');
}

function resolveSeparator(separator: string, customSeparator: string) {
  if (separator === 'newline') return '\n';
  if (separator === 'space') return ' ';
  if (separator === 'custom') return customSeparator || '\n\n';
  return '\n\n';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
