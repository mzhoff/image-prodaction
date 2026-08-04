import type { ExecutablePipelineCatalogItem } from '../contracts/pipeline-catalog-contracts';
import type { CompiledPipelinePlan, PipelineValueKind } from '../contracts/pipeline-contracts';
import type {
  StudioPipelineBoundary,
  StudioPipelineSourceMetadata,
} from '../contracts/pipeline-publication-contracts';

export interface ExecutablePipelineCatalogRow {
  averageCostUsd: string | null;
  compiledPlan: CompiledPipelinePlan;
  description: string | null;
  endpointPublicId: string;
  invocationCount: number | null;
  name: string;
  originDocumentId: string | null;
  originDocumentName: string | null;
  originSectionId: string | null;
  pipelineId: string;
  publishedAt: Date;
  sourceMetadata: StudioPipelineSourceMetadata | null;
  totalCostUsd: string | null;
  totalTokens: string | null;
  version: number;
}

export function mapExecutablePipelineCatalogRow(
  row: ExecutablePipelineCatalogRow,
): ExecutablePipelineCatalogItem {
  return {
    pipelineId: row.pipelineId,
    name: row.name,
    description: row.description,
    originDocumentId: row.originDocumentId,
    originDocumentName: row.originDocumentName,
    originSectionId: row.originSectionId,
    endpointPublicId: row.endpointPublicId,
    version: row.version,
    publishedAt: row.publishedAt.toISOString(),
    inputs: row.sourceMetadata?.inputs ?? fallbackInputs(row.compiledPlan),
    outputs: row.sourceMetadata?.outputs ?? fallbackOutputs(row.compiledPlan),
    stats: {
      invocationCount: row.invocationCount ?? 0,
      totalTokens: row.totalTokens ?? '0',
      totalCostUsd: row.totalCostUsd ?? '0',
      averageCostUsd: row.averageCostUsd ?? '0',
    },
  };
}

function fallbackInputs(plan: CompiledPipelinePlan): StudioPipelineBoundary[] {
  return Object.entries(plan.definition.inputs).map(([name, contract]) => ({
    kind: contract.kind,
    name,
    nodeId: name,
    nodeTitle: name,
    portId: name,
  }));
}

function fallbackOutputs(plan: CompiledPipelinePlan): StudioPipelineBoundary[] {
  return Object.entries(plan.definition.outputs).map(([name, binding]) => ({
    kind: inferOutputKind(plan, binding.nodeId),
    name,
    nodeId: binding.nodeId,
    nodeTitle: name,
    portId: binding.outputKey,
  }));
}

function inferOutputKind(plan: CompiledPipelinePlan, nodeId: string): PipelineValueKind {
  const handlerType = plan.definition.nodes.find((node) => node.id === nodeId)?.handlerType;
  if (handlerType === 'ai.image.generate') return 'image';
  if (handlerType === 'text.template.render'
    || handlerType === 'text.concat'
    || handlerType === 'ai.text.generate'
    || handlerType === 'ai.image.analyze') return 'text';
  return 'json';
}
