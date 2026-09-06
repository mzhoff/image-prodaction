import type { BaseNodeData } from './node-data-image';
import type {
  PipelineContractField,
  PipelineSemanticContractSnapshot,
} from './pipeline-contract-fields';
import type { TextGenerationReasoning } from './node-data-text';

export interface PipelineInputNodeData extends BaseNodeData {
  fields: PipelineContractField[];
  semanticContract?: PipelineSemanticContractSnapshot;
}

export interface PipelineOutputNodeData extends BaseNodeData {
  fields: PipelineContractField[];
  semanticContract?: PipelineSemanticContractSnapshot;
}

export interface StructuredOutputNodeData extends BaseNodeData {
  fields: PipelineContractField[];
  instruction: string;
  message?: string;
  model: string;
  reasoning?: TextGenerationReasoning;
  result?: Record<string, unknown>;
  schemaName: string;
  temperature?: number;
}
