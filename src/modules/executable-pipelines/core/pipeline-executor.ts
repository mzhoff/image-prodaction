import type {
  CompiledPipelinePlan,
  PipelineExecutionContext,
  PipelineExecutionResult,
  PipelineInputBinding,
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
import { preparePipelineInputValues, validatePipelineOutputValues } from './pipeline-io-validation';

export { isPipelineArtifactReference } from './pipeline-value-validation';
export {
  preparePipelineInputValues,
  validatePipelineInputValues,
  validatePipelineOutputValues,
} from './pipeline-io-validation';

const MISSING_OPTIONAL_INPUT = Symbol('missing-optional-pipeline-input');

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
  const pipelineInputs = preparePipelineInputValues(
    input.plan.definition.inputs,
    input.inputs,
  );
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
        await executeNode(node, input, pipelineInputs, nodeOutputs),
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
  pipelineInputs: PipelineInputs,
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

  const resolvedInputs: PipelineInputs = {};
  for (const [inputName, binding] of Object.entries(node.inputs)) {
    const resolved = resolveBinding(
      binding,
      pipelineInputs,
      input.plan.definition.inputs,
      nodeOutputs,
      node.id,
      inputName,
    );
    if (resolved !== MISSING_OPTIONAL_INPUT) resolvedInputs[inputName] = resolved;
  }

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
  contracts: Record<string, PipelineValueContract>,
  nodeOutputs: Record<string, PipelineNodeOutputs>,
  targetNodeId: string,
  targetInputName: string,
): PipelineValue | typeof MISSING_OPTIONAL_INPUT {
  if (binding.source === 'literal') return structuredClone(binding.value);
  if (binding.source === 'pipeline-input') {
    const value = pipelineInputs[binding.inputKey];
    if (value === undefined) {
      if (contracts[binding.inputKey]?.required === false) return MISSING_OPTIONAL_INPUT;
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
  const outputs: PipelineNodeOutputs = {};
  for (const [outputName, binding] of Object.entries(plan.definition.outputs)) {
    const value = nodeOutputs[binding.nodeId]?.[binding.outputKey];
    const contract = plan.definition.outputContracts?.[outputName];
    if (value === undefined) {
      if (contract?.required === false) continue;
      throw new PipelineDomainError({
        code: contract ? 'pipeline_output_invalid' : 'pipeline_node_output_missing',
        message: `Pipeline output "${outputName}" is missing "${binding.nodeId}.${binding.outputKey}".`,
      });
    }
    outputs[outputName] = structuredClone(value);
  }
  if (plan.definition.outputContracts) {
    validatePipelineOutputValues(plan.definition.outputContracts, outputs);
  }
  return outputs;
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
