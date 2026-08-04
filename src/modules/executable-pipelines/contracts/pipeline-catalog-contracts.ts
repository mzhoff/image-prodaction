import type { StudioPipelineBoundary } from './pipeline-publication-contracts';

export interface ExecutablePipelineCatalogMetrics {
  averageCostUsd: string;
  invocationCount: number;
  totalCostUsd: string;
  totalTokens: string;
}

export interface ExecutablePipelineCatalogItem {
  description: string | null;
  endpointPublicId: string;
  inputs: StudioPipelineBoundary[];
  name: string;
  originDocumentId: string | null;
  originDocumentName: string | null;
  originSectionId: string | null;
  outputs: StudioPipelineBoundary[];
  pipelineId: string;
  publishedAt: string;
  stats: ExecutablePipelineCatalogMetrics;
  version: number;
}

export interface ExecutablePipelineCatalog {
  pipelines: ExecutablePipelineCatalogItem[];
}
