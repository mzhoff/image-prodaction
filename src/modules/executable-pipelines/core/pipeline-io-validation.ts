import type {
  PipelineInputs,
  PipelineNodeOutputs,
  PipelineValueContract,
} from '../contracts/pipeline-contracts';
import { PipelineDomainError } from '../contracts/pipeline-errors';
import {
  getPipelineJsonValueIssue,
  getPipelineValueContractIssue,
} from './pipeline-value-validation';
import type { SemanticContractSnapshot } from '@/shared/contracts/semantic-contract';

export function validatePipelineInputValues(
  contracts: Record<string, PipelineValueContract>,
  values: PipelineInputs,
  semanticContract?: SemanticContractSnapshot,
) {
  preparePipelineInputValues(contracts, values, semanticContract);
}

export function preparePipelineInputValues(
  contracts: Record<string, PipelineValueContract>,
  values: PipelineInputs,
  semanticContract?: SemanticContractSnapshot,
): PipelineInputs {
  for (const inputKey of Object.keys(values)) {
    if (!contracts[inputKey]) {
      throw new PipelineDomainError({
        code: 'pipeline_input_invalid',
        message: `Unknown pipeline input "${inputKey}".`,
      });
    }
  }

  const prepared: PipelineInputs = {};
  for (const [inputKey, contract] of Object.entries(contracts)) {
    const supplied = values[inputKey];
    const value = supplied === undefined ? contract.defaultValue : supplied;
    if (value === undefined) {
      if (contract.required) {
        throw new PipelineDomainError({
          code: 'pipeline_input_invalid',
          message: `Required pipeline input "${inputKey}" is missing.`,
        });
      }
      continue;
    }
    const issue = getPipelineValueContractIssue(value, contract);
    if (issue) {
      throw new PipelineDomainError({
        code: 'pipeline_input_invalid',
        message: `Pipeline input "${inputKey}" does not match kind "${contract.kind}": ${issue}.`,
      });
    }
    prepared[inputKey] = structuredClone(value);
  }
  validateSemanticBoundaryValues(prepared, semanticContract, 'pipeline_input_invalid', 'Pipeline input');
  return prepared;
}

export function validatePipelineOutputValues(
  contracts: Record<string, PipelineValueContract>,
  values: PipelineNodeOutputs,
  semanticContract?: SemanticContractSnapshot,
) {
  for (const outputKey of Object.keys(values)) {
    if (!contracts[outputKey]) {
      throw new PipelineDomainError({
        code: 'pipeline_output_invalid',
        message: `Unknown pipeline output "${outputKey}".`,
      });
    }
  }
  for (const [outputKey, contract] of Object.entries(contracts)) {
    const value = values[outputKey];
    if (value === undefined) {
      if (contract.required) {
        throw new PipelineDomainError({
          code: 'pipeline_output_invalid',
          message: `Required pipeline output "${outputKey}" is missing.`,
        });
      }
      continue;
    }
    const issue = getPipelineValueContractIssue(value, contract);
    if (issue) {
      throw new PipelineDomainError({
        code: 'pipeline_output_invalid',
        message: `Pipeline output "${outputKey}" does not match kind "${contract.kind}": ${issue}.`,
      });
    }
  }
  validateSemanticBoundaryValues(values, semanticContract, 'pipeline_output_invalid', 'Pipeline output');
}

function validateSemanticBoundaryValues(
  values: PipelineInputs | PipelineNodeOutputs,
  semanticContract: SemanticContractSnapshot | undefined,
  code: 'pipeline_input_invalid' | 'pipeline_output_invalid',
  label: string,
) {
  if (!semanticContract) return;
  const issue = getPipelineJsonValueIssue(values, semanticContract.schema);
  if (!issue) return;
  throw new PipelineDomainError({
    code,
    message: `${label} does not match semantic contract "${semanticContract.contractKey}@${semanticContract.contractVersion}": ${issue}.`,
  });
}
