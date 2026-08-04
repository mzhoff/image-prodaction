import type {
  CompiledPipelinePlan,
  PipelineExecutionContext,
  PipelineExecutionResult,
  PipelineInputBinding,
  PipelineArtifactReference,
  PipelineInputs,
  PipelineNodeDefinition,
  PipelineNodeHandlerRegistry,
  PipelineNodeOutputs,
  PipelineValue,
  PipelineValueContract,
} from '../contracts/pipeline-contracts';
import {
  PipelineDomainError,
  PipelineNodeHandlerError,
} from '../contracts/pipeline-errors';

export interface ExecuteCompiledPipelineInput {
  context: PipelineExecutionContext;
  handlers: PipelineNodeHandlerRegistry;
  inputs: PipelineInputs;
  observer?: PipelineExecutionObserver;
  plan: CompiledPipelinePlan;
  signal: AbortSignal;
}

export interface PipelineExecutionObserver {
  onNodeFailed?(input: {
    error: PipelineDomainError;
    node: PipelineNodeDefinition;
  }): Promise<void> | void;
  onNodeStarted?(input: {
    inputs: PipelineInputs;
    node: PipelineNodeDefinition;
  }): Promise<void> | void;
  onNodeSucceeded?(input: {
    node: PipelineNodeDefinition;
    outputs: PipelineNodeOutputs;
  }): Promise<void> | void;
}

export async function executeCompiledPipeline(
  input: ExecuteCompiledPipelineInput,
): Promise<PipelineExecutionResult> {
  validatePipelineInputValues(input.plan.definition.inputs, input.inputs);
  throwIfAborted(input.signal);

  const nodesById = new Map(
    input.plan.definition.nodes.map((node) => [node.id, node]),
  );
  const nodeOutputs: Record<string, PipelineNodeOutputs> = {};

  for (const level of input.plan.executionLevels) {
    throwIfAborted(input.signal);
    const completed = await Promise.all(level.map(async (nodeId) => {
      const node = nodesById.get(nodeId);
      if (!node) {
        throw new PipelineDomainError({
          code: 'pipeline_definition_invalid',
          message: `Compiled plan references unknown node "${nodeId}".`,
        });
      }
      return [
        nodeId,
        await executeNode(node, input, nodeOutputs),
      ] as const;
    }));

    for (const [nodeId, outputs] of completed) {
      nodeOutputs[nodeId] = outputs;
    }
  }

  throwIfAborted(input.signal);
  return {
    nodeOutputs,
    outputs: resolvePipelineOutputs(input.plan, nodeOutputs),
  };
}

async function executeNode(
  node: PipelineNodeDefinition,
  input: ExecuteCompiledPipelineInput,
  nodeOutputs: Record<string, PipelineNodeOutputs>,
) {
  const handler = input.handlers.resolve(node.handlerType, node.handlerVersion);
  if (!handler) {
    throw new PipelineNodeHandlerError({
      code: 'pipeline_handler_missing',
      message: `Handler ${node.handlerType}@${node.handlerVersion} is not registered.`,
      nodeId: node.id,
    });
  }

  const resolvedInputs = Object.fromEntries(
    Object.entries(node.inputs).map(([inputName, binding]) => [
      inputName,
      resolveBinding(binding, input.inputs, nodeOutputs, node.id, inputName),
    ]),
  );

  try {
    await input.observer?.onNodeStarted?.({
      inputs: structuredClone(resolvedInputs),
      node: structuredClone(node),
    });
    const result = await handler.execute({
      config: structuredClone(node.config),
      context: input.context,
      inputs: resolvedInputs,
      nodeId: node.id,
      signal: input.signal,
    });
    throwIfAborted(input.signal);
    const outputs = structuredClone(result);
    await input.observer?.onNodeSucceeded?.({
      node: structuredClone(node),
      outputs,
    });
    return outputs;
  } catch (error) {
    const normalized = input.signal.aborted
      ? abortedError()
      : error instanceof PipelineNodeHandlerError
        ? new PipelineNodeHandlerError({
          code: error.code,
          message: error.message,
          nodeId: error.nodeId ?? node.id,
          retryable: error.retryable,
        })
        : error instanceof PipelineDomainError
          ? error
          : new PipelineNodeHandlerError({
            message: 'Pipeline node handler failed.',
            nodeId: node.id,
            retryable: false,
          });
    await input.observer?.onNodeFailed?.({
      error: normalized,
      node: structuredClone(node),
    });
    throw normalized;
  }
}

function resolveBinding(
  binding: PipelineInputBinding,
  pipelineInputs: PipelineInputs,
  nodeOutputs: Record<string, PipelineNodeOutputs>,
  targetNodeId: string,
  targetInputName: string,
): PipelineValue {
  if (binding.source === 'literal') return structuredClone(binding.value);
  if (binding.source === 'pipeline-input') {
    const value = pipelineInputs[binding.inputKey];
    if (value === undefined) {
      throw new PipelineDomainError({
        code: 'pipeline_input_invalid',
        message: `Node "${targetNodeId}" input "${targetInputName}" requires pipeline input "${binding.inputKey}".`,
      });
    }
    return structuredClone(value);
  }

  const value = nodeOutputs[binding.nodeId]?.[binding.outputKey];
  if (value === undefined) {
    throw new PipelineDomainError({
      code: 'pipeline_node_output_missing',
      message: `Node "${binding.nodeId}" did not produce output "${binding.outputKey}" required by "${targetNodeId}.${targetInputName}".`,
    });
  }
  return structuredClone(value);
}

function resolvePipelineOutputs(
  plan: CompiledPipelinePlan,
  nodeOutputs: Record<string, PipelineNodeOutputs>,
) {
  return Object.fromEntries(
    Object.entries(plan.definition.outputs).map(([outputName, binding]) => {
      const value = nodeOutputs[binding.nodeId]?.[binding.outputKey];
      if (value === undefined) {
        throw new PipelineDomainError({
          code: 'pipeline_node_output_missing',
          message: `Pipeline output "${outputName}" is missing "${binding.nodeId}.${binding.outputKey}".`,
        });
      }
      return [outputName, structuredClone(value)];
    }),
  );
}

export function validatePipelineInputValues(
  contracts: Record<string, PipelineValueContract>,
  values: PipelineInputs,
) {
  for (const inputKey of Object.keys(values)) {
    if (!contracts[inputKey]) {
      throw new PipelineDomainError({
        code: 'pipeline_input_invalid',
        message: `Unknown pipeline input "${inputKey}".`,
      });
    }
  }

  for (const [inputKey, contract] of Object.entries(contracts)) {
    const value = values[inputKey];
    if (value === undefined) {
      if (contract.required) {
        throw new PipelineDomainError({
          code: 'pipeline_input_invalid',
          message: `Required pipeline input "${inputKey}" is missing.`,
        });
      }
      continue;
    }
    if (!matchesValueContract(value, contract)) {
      throw new PipelineDomainError({
        code: 'pipeline_input_invalid',
        message: `Pipeline input "${inputKey}" does not match kind "${contract.kind}".`,
      });
    }
  }
}

function matchesValueContract(value: PipelineValue, contract: PipelineValueContract) {
  if (contract.kind === 'json') return true;
  if (contract.kind === 'boolean') return typeof value === 'boolean';
  if (contract.kind === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (contract.kind === 'text') return typeof value === 'string';
  if (contract.kind === 'text_collection') {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  }
  if (contract.kind === 'image_collection') {
    return Array.isArray(value) && value.every((entry) => isArtifactReference(entry, 'image'));
  }
  if (contract.kind === 'image') return isArtifactReference(value, 'image');
  if (contract.kind === 'audio') return isArtifactReference(value, 'audio');
  return isStructuredObject(value);
}

export function isPipelineArtifactReference(
  value: PipelineValue,
  kind?: PipelineArtifactReference['kind'],
): value is PipelineArtifactReference & Record<string, PipelineValue> {
  return isArtifactReference(value, kind);
}

function isArtifactReference(
  value: PipelineValue,
  kind?: PipelineArtifactReference['kind'],
) {
  if (!isStructuredObject(value)) return false;
  if (value.kind !== 'image' && value.kind !== 'audio') return false;
  if (kind && value.kind !== kind) return false;
  if (typeof value.assetId !== 'string' || !value.assetId.trim()) return false;
  if (value.mimeType !== undefined && typeof value.mimeType !== 'string') return false;
  if (value.sizeBytes !== undefined && (
    typeof value.sizeBytes !== 'number'
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes < 0
  )) return false;
  return true;
}

function isStructuredObject(value: PipelineValue): value is Record<string, PipelineValue> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortedError();
}

function abortedError() {
  return new PipelineDomainError({
    code: 'pipeline_aborted',
    message: 'Pipeline execution was aborted.',
  });
}
