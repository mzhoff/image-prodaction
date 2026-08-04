import type { CompiledPipelinePlan, PipelineValueKind } from './pipeline-contracts';

export interface StudioPipelineBoundary {
  kind: PipelineValueKind;
  name: string;
  nodeId: string;
  nodeTitle: string;
  portId: string;
}

export interface StudioPipelineSourceMetadata {
  inputs: StudioPipelineBoundary[];
  nodeCount: number;
  outputs: StudioPipelineBoundary[];
  sectionId: string;
  sectionTitle: string;
}

export interface StudioPipelinePublication {
  compiledPlan: CompiledPipelinePlan;
  endpointPublicId: string;
  inputs: StudioPipelineBoundary[];
  outputs: StudioPipelineBoundary[];
  pipelineId: string;
  publishedAt: string;
  sectionId: string;
  sectionTitle: string;
  version: number;
}
