import type { ProviderResult } from '@/modules/provider-connections';
import { executeInternalOpenRouterChat } from '@/modules/generation';
import type {
  PipelineArtifactReference,
  PipelineExecutionContext,
  PipelineNodeHandler,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import { isPipelineArtifactReference } from '../core/pipeline-executor';
import type {
  PipelineImageAnalyzer,
  PipelineImageExporter,
  PipelineImageGenerator,
} from './pipeline-image-operations';
import {
  compareInputKeys,
  isString,
  readReasoning,
  readString,
  readTemperature,
  requireString,
} from './pipeline-handler-values';
import {
  createAiStructuredHandler,
  type PipelineStructuredGenerator,
} from './pipeline-structured-ai-handler';

export {
  createOpenRouterStructuredGenerator,
  type PipelineStructuredGenerator,
} from './pipeline-structured-ai-handler';

export interface PipelineHandlerScope {
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

export function createAiPipelineHandlers(input: {
  analyzeImage: PipelineImageAnalyzer;
  exportImage: PipelineImageExporter;
  generateImage: PipelineImageGenerator;
  generateStructured: PipelineStructuredGenerator;
  generateText: PipelineTextGenerator;
}): PipelineNodeHandler[] {
  return [
    createAiTextHandler(input.generateText),
    createAiStructuredHandler(input.generateStructured),
    createAiImageAnalysisHandler(input.analyzeImage),
    createAiImageGenerationHandler(input.generateImage),
    createImageExportHandler(input.exportImage),
  ];
}

export function createOpenRouterTextGenerator(scope: PipelineHandlerScope): PipelineTextGenerator {
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
        messages: [{ role: 'user', parts: [{
          modality: 'text',
          text: composeTextGenerationPrompt(input.text, input.config),
        }] }],
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

function createAiTextHandler(generateText: PipelineTextGenerator): PipelineNodeHandler {
  return {
    handlerType: 'ai.text.generate',
    handlerVersion: '1',
    async execute(input) {
      const text = Object.values(input.inputs).filter(isString).join('\n\n').trim();
      if (!text && !readString(input.config.instruction).trim()) {
        throw handlerError('Text generation requires text or an instruction.', input.nodeId);
      }
      return { text: await generateText({
        config: input.config,
        context: input.context,
        nodeId: input.nodeId,
        signal: input.signal,
        text,
      }) };
    },
  };
}

function createAiImageAnalysisHandler(analyzeImage: PipelineImageAnalyzer): PipelineNodeHandler {
  return {
    handlerType: 'ai.image.analyze',
    handlerVersion: '1',
    async execute(input) {
      const artifact = Object.values(input.inputs).find((value) => isPipelineArtifactReference(value, 'image'));
      if (!artifact) throw handlerError('Image analysis requires an image artifact.', input.nodeId);
      return { text: await analyzeImage({
        artifact, config: input.config, context: input.context,
        nodeId: input.nodeId, signal: input.signal,
      }) };
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
        isPipelineArtifactReference(value, 'image') ? [{ artifact: value, inputKey }] : []
      ));
      if (!textInputs.some((entry) => entry.text.trim())
        && !readString(input.config.prompt).trim() && imageInputs.length === 0) {
        throw handlerError('Image generation requires a prompt or an image reference.', input.nodeId);
      }
      return { image: await generateImage({
        config: input.config, context: input.context, imageInputs,
        nodeId: input.nodeId, signal: input.signal, textInputs,
      }) };
    },
  };
}

function createImageExportHandler(exportImage: PipelineImageExporter): PipelineNodeHandler {
  return {
    handlerType: 'image.export',
    handlerVersion: '1',
    async execute(input) {
      const artifacts = Object.entries(input.inputs)
        .filter((entry): entry is [string, PipelineArtifactReference] => isPipelineArtifactReference(entry[1], 'image'))
        .sort(([first], [second]) => compareInputKeys(first, second))
        .map(([, artifact]) => artifact);
      if (artifacts.length === 0) throw handlerError('Image export requires at least one image artifact.', input.nodeId);
      const images = await exportImage({
        artifacts, config: input.config, context: input.context,
        nodeId: input.nodeId, signal: input.signal,
      });
      const image = images[0];
      if (!image) throw handlerError('Image export did not produce an artifact.', input.nodeId);
      return { image, images };
    },
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

function handlerError(message: string, nodeId: string) {
  return new PipelineNodeHandlerError({ message, nodeId });
}
