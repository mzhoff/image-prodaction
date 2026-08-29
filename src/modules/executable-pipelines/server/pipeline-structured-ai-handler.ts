import type { ProviderResult } from '@/modules/provider-connections';
import { executeInternalOpenRouterChat } from '@/modules/generation';
import type {
  PipelineExecutionContext,
  PipelineJsonSchema,
  PipelineNodeHandler,
  PipelineValue,
} from '../contracts/pipeline-contracts';
import { PipelineNodeHandlerError } from '../contracts/pipeline-errors';
import {
  getPipelineJsonSchemaDefinitionError,
  getPipelineJsonValueIssue,
} from '../core/pipeline-value-validation';
import {
  readReasoning,
  readString,
  readTemperature,
  requireString,
} from './pipeline-handler-values';

export type PipelineStructuredGenerator = (input: {
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  nodeId: string;
  schema: PipelineJsonSchema;
  signal: AbortSignal;
  source: PipelineValue;
}) => Promise<Record<string, PipelineValue>>;

export function createAiStructuredHandler(
  generateStructured: PipelineStructuredGenerator,
): PipelineNodeHandler {
  return {
    handlerType: 'ai.structured.generate',
    handlerVersion: '1',
    async execute(input) {
      const schema = readStructuredSchema(input.config.schema, input.nodeId);
      const inputValues = Object.values(input.inputs);
      const source: PipelineValue = inputValues.length === 1
        ? inputValues[0]!
        : structuredClone(input.inputs);
      if (inputValues.length === 0 && !readString(input.config.message).trim()
        && !readString(input.config.instruction).trim()) {
        throw handlerError('Structured generation requires a source or an instruction.', input.nodeId);
      }
      const result = await generateStructured({
        config: input.config,
        context: input.context,
        nodeId: input.nodeId,
        schema,
        signal: input.signal,
        source,
      });
      const issue = getPipelineJsonValueIssue(result, schema);
      if (issue) throw handlerError(`Structured generation result is invalid: ${issue}.`, input.nodeId);

      const outputs: Record<string, PipelineValue> = { json: result };
      for (const field of readStructuredFields(input.config.fields)) {
        const value = result[field.key];
        if (value !== undefined) outputs[`field:${field.id}`] = structuredClone(value);
      }
      return outputs;
    },
  };
}

export function createOpenRouterStructuredGenerator(scope: {
  actorUserId: string;
  documentId?: string;
}): PipelineStructuredGenerator {
  return async (input) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const execution = await executeInternalOpenRouterChat({
          actorUserId: scope.actorUserId,
          documentId: scope.documentId,
          idempotencyKey: `pipeline:${input.context.runId}:node:${input.nodeId}:structured:${attempt + 1}`,
          metadata: {
            pipelineId: input.context.pipelineId,
            pipelineRunId: input.context.runId,
            pipelineNodeId: input.nodeId,
            structuredOutputAttempt: attempt + 1,
          },
          providerRequest: {
            modelId: requireString(input.config.model, 'Model'),
            operation: 'generate_structured_data',
            expectedOutputModalities: ['text'],
            messages: createStructuredMessages(input, attempt),
            parameters: {
              maxOutputTokens: 64_000,
              reasoningEffort: readReasoning(input.config.reasoning),
              structuredOutput: {
                name: normalizeSchemaName(readString(input.config.schemaName)),
                schema: structuredClone(input.schema) as unknown as Record<string, unknown>,
                strict: true,
              },
              temperature: readTemperature(input.config.temperature),
            },
          },
          signal: input.signal,
          transform: (result) => getProviderStructuredObject(result, input.schema),
          workspaceId: input.context.workspaceId,
        });
        return execution.result;
      } catch (error) {
        if (attempt === 0 && isInvalidProviderResponse(error)) continue;
        throw error;
      }
    }
    throw new Error('Structured generation did not return a valid result.');
  };
}

function getProviderStructuredObject(
  result: ProviderResult,
  schema: PipelineJsonSchema,
): Record<string, PipelineValue> {
  const output = result.outputs.find((candidate) => candidate.modality === 'text');
  if (!output || output.modality !== 'text' || !output.text.trim()) {
    throw new Error('Provider response does not contain text.');
  }
  const parsed = JSON.parse(output.text.trim()) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Provider response is not a JSON object.');
  }
  const value = parsed as Record<string, PipelineValue>;
  const issue = getPipelineJsonValueIssue(value, schema);
  if (issue) throw new Error(issue);
  return value;
}

function readStructuredSchema(value: PipelineValue | undefined, nodeId: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw handlerError('Structured generation requires a JSON schema.', nodeId);
  }
  const schema = value as unknown as PipelineJsonSchema;
  const issue = getPipelineJsonSchemaDefinitionError(schema);
  if (issue || schema.type !== 'object') {
    throw handlerError(`Structured generation schema is invalid${issue ? `: ${issue}` : ''}.`, nodeId);
  }
  return schema;
}

function readStructuredFields(value: PipelineValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    return id && key ? [{ id, key }] : [];
  });
}

function createStructuredMessages(
  input: Parameters<PipelineStructuredGenerator>[0],
  attempt: number,
) {
  const instruction = readString(input.config.instruction).trim()
    || 'Extract structured data that matches the supplied JSON schema.';
  const userMessage = readString(input.config.message).trim();
  const source = typeof input.source === 'string' ? input.source : JSON.stringify(input.source);
  return [{
    role: 'system' as const,
    parts: [{
      modality: 'text' as const,
      text: [
        'You are a structured data processor inside an executable pipeline.',
        instruction,
        'Return only a JSON object that exactly matches the provided schema.',
        'Never add Markdown fences or explanatory text.',
        attempt > 0 ? 'The previous response was invalid. Repair the response and follow the schema exactly.' : '',
      ].filter(Boolean).join('\n'),
    }],
  }, {
    role: 'user' as const,
    parts: [{
      modality: 'text' as const,
      text: [userMessage, source].filter(Boolean).join('\n\n'),
    }],
  }];
}

function normalizeSchemaName(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z_]/.test(normalized) ? normalized.slice(0, 64) : `schema_${normalized}`.slice(0, 64);
}

function isInvalidProviderResponse(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const descriptor = 'descriptor' in error ? error.descriptor : undefined;
  return Boolean(descriptor && typeof descriptor === 'object'
    && 'code' in descriptor && descriptor.code === 'invalid_response');
}

function handlerError(message: string, nodeId: string) {
  return new PipelineNodeHandlerError({ message, nodeId });
}
