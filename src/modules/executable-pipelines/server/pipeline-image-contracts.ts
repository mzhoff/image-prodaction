import type {
  ExportImageBackground,
  ExportImageFormat,
  ExportImageScale,
} from '@/entities/production-graph/model/types';
import type {
  PipelineArtifactReference,
  PipelineExecutionContext,
  PipelineValue,
} from '../contracts/pipeline-contracts';

export interface PipelineImageOperationScope {
  actorUserId: string;
  documentId?: string;
}

export type PipelineImageAnalyzer = (input: {
  artifact: PipelineArtifactReference;
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  nodeId: string;
  signal: AbortSignal;
}) => Promise<string>;

export type PipelineImageGenerator = (input: {
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  imageInputs: Array<{ artifact: PipelineArtifactReference; inputKey: string }>;
  nodeId: string;
  signal: AbortSignal;
  textInputs: Array<{ inputKey: string; text: string }>;
}) => Promise<PipelineArtifactReference>;

export type PipelineImageExporter = (input: {
  artifacts: PipelineArtifactReference[];
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  nodeId: string;
  signal: AbortSignal;
}) => Promise<PipelineArtifactReference[]>;

export interface PipelineImageExportOptions {
  background: ExportImageBackground;
  format: ExportImageFormat;
  quality: number;
  scale: ExportImageScale;
}
