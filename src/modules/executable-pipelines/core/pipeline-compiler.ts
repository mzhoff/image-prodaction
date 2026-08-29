import type {
  CompiledPipelinePlan,
  ExecutablePipelineDefinition,
  PipelineInputBinding,
  PipelineNodeDefinition,
} from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import {
  getPipelineValueContractDefinitionError,
  isPublicContractKey,
} from './pipeline-value-validation';

export interface PipelineCompilerOptions {
  isHandlerSupported?: (handlerType: string, handlerVersion: string) => boolean;
}

export function compilePipelineDefinition(
  definition: ExecutablePipelineDefinition,
  options: PipelineCompilerOptions = {},
): CompiledPipelinePlan {
  validateDefinitionShape(definition);
  const nodesById = new Map<string, PipelineNodeDefinition>();

  for (const node of definition.nodes) {
    validateNode(node, definition, nodesById, options);
    nodesById.set(node.id, node);
  }

  validateDependencies(definition.nodes, nodesById);
  validateOutputs(definition, nodesById);

  return {
    definition: structuredClone(definition),
    executionLevels: buildExecutionLevels(definition.nodes, nodesById),
  };
}

function validateDefinitionShape(definition: ExecutablePipelineDefinition) {
  if (definition.schemaVersion !== 1) {
    throw invalidDefinition('Pipeline schemaVersion must be 1.');
  }
  if (!definition.nodes.length) {
    throw invalidDefinition('Pipeline must contain at least one node.');
  }
  if (!Object.keys(definition.outputs).length) {
    throw invalidDefinition('Pipeline must declare at least one output.');
  }

  for (const [inputKey, contract] of Object.entries(definition.inputs)) {
    validatePublicKey(inputKey, 'Pipeline input');
    validateContract(contract, `Pipeline input "${inputKey}"`);
  }

  if (definition.outputContracts !== undefined) {
    for (const [outputKey, contract] of Object.entries(definition.outputContracts)) {
      validatePublicKey(outputKey, 'Pipeline output contract');
      validateContract(contract, `Pipeline output contract "${outputKey}"`);
      if (contract.required && !definition.outputs[outputKey]) {
        throw invalidDefinition(`Required pipeline output "${outputKey}" has no binding.`);
      }
    }
    for (const outputKey of Object.keys(definition.outputs)) {
      if (!definition.outputContracts[outputKey]) {
        throw invalidDefinition(`Pipeline output "${outputKey}" has no output contract.`);
      }
    }
  }
}

function validateNode(
  node: PipelineNodeDefinition,
  definition: ExecutablePipelineDefinition,
  nodesById: ReadonlyMap<string, PipelineNodeDefinition>,
  options: PipelineCompilerOptions,
) {
  validateKey(node.id, 'Node id');
  validateKey(node.handlerType, `Handler type for node "${node.id}"`);
  validateVersion(node.handlerVersion, node.id);

  if (nodesById.has(node.id)) {
    throw invalidDefinition(`Duplicate pipeline node id "${node.id}".`);
  }
  if (options.isHandlerSupported?.(node.handlerType, node.handlerVersion) === false) {
    throw new PipelineDomainError({
      code: 'pipeline_handler_missing',
      message: `Handler ${node.handlerType}@${node.handlerVersion} is not supported.`,
    });
  }

  for (const [inputName, binding] of Object.entries(node.inputs)) {
    validateKey(inputName, `Input name for node "${node.id}"`);
    validateBinding(binding, definition, node.id, inputName);
  }
}

function validateBinding(
  binding: PipelineInputBinding,
  definition: ExecutablePipelineDefinition,
  nodeId: string,
  inputName: string,
) {
  if (binding.source === 'pipeline-input') {
    if (!definition.inputs[binding.inputKey]) {
      throw invalidDefinition(
        `Node "${nodeId}" input "${inputName}" references unknown pipeline input "${binding.inputKey}".`,
      );
    }
    return;
  }

  if (binding.source === 'node-output') {
    validateKey(binding.nodeId, `Source node for "${nodeId}.${inputName}"`);
    validateKey(binding.outputKey, `Source output for "${nodeId}.${inputName}"`);
    if (binding.nodeId === nodeId) {
      throw new PipelineDomainError({
        code: 'pipeline_cycle_detected',
        message: `Node "${nodeId}" cannot depend on itself.`,
      });
    }
    return;
  }

  if (binding.source !== 'literal') {
    throw invalidDefinition(`Node "${nodeId}" input "${inputName}" has an invalid binding.`);
  }
}

function validateDependencies(
  nodes: PipelineNodeDefinition[],
  nodesById: ReadonlyMap<string, PipelineNodeDefinition>,
) {
  for (const node of nodes) {
    for (const binding of Object.values(node.inputs)) {
      if (binding.source !== 'node-output') continue;
      if (!nodesById.has(binding.nodeId)) {
        throw invalidDefinition(
          `Node "${node.id}" references unknown source node "${binding.nodeId}".`,
        );
      }
    }
  }
}

function validateOutputs(
  definition: ExecutablePipelineDefinition,
  nodesById: ReadonlyMap<string, PipelineNodeDefinition>,
) {
  for (const [outputName, binding] of Object.entries(definition.outputs)) {
    validatePublicKey(outputName, 'Pipeline output');
    validateKey(binding.outputKey, `Output key for pipeline output "${outputName}"`);
    if (!nodesById.has(binding.nodeId)) {
      throw invalidDefinition(
        `Pipeline output "${outputName}" references unknown node "${binding.nodeId}".`,
      );
    }
  }
}

function validateContract(
  contract: ExecutablePipelineDefinition['inputs'][string],
  label: string,
) {
  const issue = getPipelineValueContractDefinitionError(contract);
  if (issue) throw invalidDefinition(`${label} ${issue}.`);
}

function validatePublicKey(value: string, label: string) {
  if (!isPublicContractKey(value)) {
    throw invalidDefinition(`${label} has an invalid format.`);
  }
}

function buildExecutionLevels(
  nodes: PipelineNodeDefinition[],
  nodesById: ReadonlyMap<string, PipelineNodeDefinition>,
) {
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const node of nodes) {
    const nodeDependencies = new Set(
      Object.values(node.inputs)
        .filter((binding) => binding.source === 'node-output')
        .map((binding) => binding.nodeId),
    );
    dependencies.set(node.id, nodeDependencies);
    dependents.set(node.id, new Set());
  }

  for (const [nodeId, nodeDependencies] of dependencies) {
    for (const dependencyId of nodeDependencies) {
      dependents.get(dependencyId)?.add(nodeId);
    }
  }

  const remainingCounts = new Map(
    [...dependencies].map(([nodeId, nodeDependencies]) => [
      nodeId,
      nodeDependencies.size,
    ]),
  );
  let ready = [...remainingCounts]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort();
  const levels: string[][] = [];
  let visited = 0;

  while (ready.length) {
    const level = ready;
    levels.push(level);
    visited += level.length;
    const next = new Set<string>();

    for (const nodeId of level) {
      for (const dependentId of dependents.get(nodeId) ?? []) {
        const count = (remainingCounts.get(dependentId) ?? 0) - 1;
        remainingCounts.set(dependentId, count);
        if (count === 0) next.add(dependentId);
      }
    }
    ready = [...next].sort();
  }

  if (visited !== nodesById.size) {
    throw new PipelineDomainError({
      code: 'pipeline_cycle_detected',
      message: 'Pipeline graph contains a cycle.',
    });
  }
  return levels;
}

function validateKey(value: string, label: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_.:-]{0,119}$/.test(value)) {
    throw invalidDefinition(`${label} has an invalid format.`);
  }
}

function validateVersion(value: string, nodeId: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)) {
    throw invalidDefinition(`Handler version for node "${nodeId}" has an invalid format.`);
  }
}

function invalidDefinition(message: string) {
  return new PipelineDomainError({
    code: 'pipeline_definition_invalid',
    message,
  });
}
