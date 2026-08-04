import type { ProviderResult } from '@/modules/provider-connections';
import { executeInternalOpenRouterChat } from '@/modules/generation';
import { TEXT_SPLITTER_MAX_ITEMS } from '@/entities/production-graph/model/node-definitions';
import { splitProductionText } from '@/entities/production-graph/model/text-splitter';
import type { TextSplitterMode } from '@/entities/production-graph/model/types';
import type {
  PipelineExecutionContext,
  PipelineNodeHandler,
  PipelineNodeHandlerRegistry,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';
import {
  createOpenRouterImageAnalyzer,
  createQueuedImageGenerator,
  type PipelineImageAnalyzer,
  type PipelineImageGenerator,
} from './pipeline-image-operations';

interface PipelineHandlerScope {
  actorUserId: string;
  documentId?: string;
}

export type PipelineTextGenerator = (input: {
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  documentId?: string;
  nodeId: string;
  signal: AbortSignal;
  text: string;
}) => Promise<string>;

export function createProductionPipelineHandlerRegistry(
  scope: PipelineHandlerScope,
  dependencies: {
    analyzeImage?: PipelineImageAnalyzer;
    generateImage?: PipelineImageGenerator;
    generateText?: PipelineTextGenerator;
  } = {},
): PipelineNodeHandlerRegistry {
  const handlers = [
    createTextTemplateHandler(),
    createTextConcatHandler(),
    createTextSplitHandler(),
    createTextFormatHandler(),
    createAiTextHandler(
      dependencies.generateText ?? createOpenRouterTextGenerator(scope),
    ),
    createAiImageAnalysisHandler(
      dependencies.analyzeImage ?? createOpenRouterImageAnalyzer(scope),
    ),
    createAiImageGenerationHandler(
      dependencies.generateImage ?? createQueuedImageGenerator(scope),
    ),
  ];
  const byKey = new Map(handlers.map((handler) => [
    `${handler.handlerType}@${handler.handlerVersion}`,
    handler,
  ]));
  return {
    resolve(handlerType, handlerVersion) {
      return byKey.get(`${handlerType}@${handlerVersion}`) ?? null;
    },
  };
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
      return {
        items,
        ...Object.fromEntries(items.map((item, index) => [`item-${index}`, item])),
      };
    },
  };
}

function createTextFormatHandler(): PipelineNodeHandler {
  return {
    handlerType: 'text.format',
    handlerVersion: '1',
    async execute(input) {
      const connectedText = Object.values(input.inputs).filter(isString).join('\n\n');
      return {
        text: normalizePlainText(
          connectedText || readString(input.config.fallbackText),
        ),
      };
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
      if (!template.trim() && connectedValues.length === 1) {
        return { text: connectedValues[0] };
      }

      let text = template;
      for (const variable of variables.sort((first, second) => (
        second.alias.length - first.alias.length
      ))) {
        const value = input.inputs[variable.id];
        if (typeof value !== 'string') continue;
        text = text.replace(new RegExp(`@${escapeRegExp(variable.alias)}\\b`, 'gu'), value);
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
      const composed = [
        readString(input.config.prefix).trim(),
        parts.join(separator),
        readString(input.config.suffix).trim(),
      ].filter(Boolean).join(separator);
      return { text: composed };
    },
  };
}

function createAiTextHandler(generateText: PipelineTextGenerator): PipelineNodeHandler {
  return {
    handlerType: 'ai.text.generate',
    handlerVersion: '1',
    async execute(input) {
      const text = Object.values(input.inputs).filter(isString).join('\n\n').trim();
      if (!text && !readString(input.config.instruction).trim()) {
        throw new PipelineNodeHandlerError({
          message: 'Text generation requires text or an instruction.',
          nodeId: input.nodeId,
        });
      }
      return {
        text: await generateText({
          config: input.config,
          context: input.context,
          nodeId: input.nodeId,
          signal: input.signal,
          text,
        }),
      };
    },
  };
}

function createAiImageAnalysisHandler(analyzeImage: PipelineImageAnalyzer): PipelineNodeHandler {
  return {
    handlerType: 'ai.image.analyze',
    handlerVersion: '1',
    async execute(input) {
      const artifact = Object.values(input.inputs).find((value) => (
        isPipelineArtifactReference(value, 'image')
      ));
      if (!artifact) {
        throw new PipelineNodeHandlerError({
          message: 'Image analysis requires an image artifact.',
          nodeId: input.nodeId,
        });
      }
      return {
        text: await analyzeImage({
          artifact,
          config: input.config,
          context: input.context,
          nodeId: input.nodeId,
          signal: input.signal,
        }),
      };
    },
  };
}

function createAiImageGenerationHandler(generateImage: PipelineImageGenerator): PipelineNodeHandler {
  return {
    handlerType: 'ai.image.generate',
    handlerVersion: '1',
    async execute(input) {
      const textInputs = Object.entries(input.inputs).flatMap(([inputKey, value]) => (
        typeof value === 'string' ? [{ inputKey, text: value }] : []
      ));
      const imageInputs = Object.entries(input.inputs).flatMap(([inputKey, value]) => (
        isPipelineArtifactReference(value, 'image')
          ? [{ artifact: value, inputKey }]
          : []
      ));
      if (!textInputs.some((entry) => entry.text.trim()) && !readString(input.config.prompt).trim() && imageInputs.length === 0) {
        throw new PipelineNodeHandlerError({
          message: 'Image generation requires a prompt or an image reference.',
          nodeId: input.nodeId,
        });
      }
      return {
        image: await generateImage({
          config: input.config,
          context: input.context,
          imageInputs,
          nodeId: input.nodeId,
          signal: input.signal,
          textInputs,
        }),
      };
    },
  };
}

function createOpenRouterTextGenerator(scope: PipelineHandlerScope): PipelineTextGenerator {
  return async (input) => {
    const execution = await executeInternalOpenRouterChat({
      actorUserId: scope.actorUserId,
      documentId: scope.documentId,
      idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}`,
      metadata: {
        pipelineId: input.context.pipelineId,
        pipelineRunId: input.context.runId,
        pipelineNodeId: input.nodeId,
      },
      providerRequest: {
        modelId: requireString(input.config.model, 'Model'),
        operation: 'generate_text',
        expectedOutputModalities: ['text'],
        messages: [{
          role: 'user',
          parts: [{
            modality: 'text',
            text: composeTextGenerationPrompt(input.text, input.config),
          }],
        }],
        parameters: {
          maxOutputTokens: 64_000,
          reasoningEffort: readReasoning(input.config.reasoning),
          temperature: readTemperature(input.config.temperature),
        },
      },
      signal: input.signal,
      transform: getProviderText,
      workspaceId: input.context.workspaceId,
    });
    return execution.result;
  };
}

function composeTextGenerationPrompt(text: string, config: Record<string, PipelineValue>) {
  const outputStyle = readString(config.outputStyle);
  const styleInstruction = outputStyle === 'markdown'
    ? 'Return clean Markdown only.'
    : outputStyle === 'numbered-list'
      ? 'Return a numbered list. Put each item on its own line.'
      : 'Return plain text only.';
  const sections = [
    'You are a production text assistant for an AI pipeline.',
    styleInstruction,
    'Do not add explanations outside the requested output.',
  ];
  const instruction = readString(config.instruction).trim();
  if (instruction) sections.push('', 'Instruction:', instruction);
  if (text) sections.push('', 'Input text:', text);
  return sections.join('\n');
}

function getProviderText(result: ProviderResult) {
  const output = result.outputs.find((candidate) => candidate.modality === 'text');
  if (!output || output.modality !== 'text' || !output.text.trim()) {
    throw new Error('Provider response does not contain text.');
  }
  return output.text.trim();
}

function readTemplateVariables(value: PipelineValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const id = item.id;
    const alias = item.alias;
    return typeof id === 'string' && typeof alias === 'string' && id && alias
      ? [{ id, alias }]
      : [];
  });
}

function resolveSeparator(separator: string, customSeparator: string) {
  if (separator === 'newline') return '\n';
  if (separator === 'space') return ' ';
  if (separator === 'custom') return customSeparator || '\n\n';
  return '\n\n';
}

function compareInputKeys(first: string, second: string) {
  const firstIndex = Number(first.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  const secondIndex = Number(second.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
  return firstIndex - secondIndex || first.localeCompare(second);
}

function readString(value: PipelineValue | undefined) {
  return typeof value === 'string' ? value : '';
}

function requireString(value: PipelineValue | undefined, label: string) {
  const normalized = readString(value).trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function readReasoning(value: PipelineValue | undefined) {
  return value === 'medium' || value === 'high' ? value : 'low';
}

function readTemperature(value: PipelineValue | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(2, Math.max(0, value))
    : 1;
}

function readTextSplitterMode(value: PipelineValue | undefined): TextSplitterMode {
  return value === 'newline'
    || value === 'paragraph'
    || value === 'numbered-list'
    || value === 'delimiter'
    ? value
    : 'delimiter';
}

function normalizePlainText(value: string) {
  return value.replace(/\u00a0/g, ' ').trim();
}

function isString(value: PipelineValue): value is string {
  return typeof value === 'string';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
