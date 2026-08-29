export type PipelinePrimitive = boolean | number | string | null;

export type PipelineValue =
  | PipelinePrimitive
  | PipelineValue[]
  | { [key: string]: PipelineValue };

export type PipelineInputs = Record<string, PipelineValue>;
export type PipelineNodeOutputs = Record<string, PipelineValue>;

export type PipelineArtifactReference = {
  assetId: string;
  checksumSha256?: string;
  contentUrl?: string;
  height?: number | null;
  kind: 'audio' | 'image';
  mimeType?: string;
  sizeBytes?: number;
  width?: number | null;
} & Record<string, PipelineValue>;

export type PipelineValueKind =
  | 'audio'
  | 'boolean'
  | 'image'
  | 'image_collection'
  | 'json'
  | 'number'
  | 'publication'
  | 'text'
  | 'text_collection';

interface PipelineJsonSchemaBase {
  description?: string;
}

export type PipelineJsonSchema =
  | (PipelineJsonSchemaBase & {
    enum?: string[];
    type: 'string';
  })
  | (PipelineJsonSchemaBase & {
    enum?: number[];
    type: 'number';
  })
  | (PipelineJsonSchemaBase & {
    enum?: number[];
    type: 'integer';
  })
  | (PipelineJsonSchemaBase & {
    enum?: boolean[];
    type: 'boolean';
  })
  | (PipelineJsonSchemaBase & {
    items: PipelineJsonSchema;
    type: 'array';
  })
  | (PipelineJsonSchemaBase & {
    additionalProperties: false;
    properties: Record<string, PipelineJsonSchema>;
    required?: string[];
    type: 'object';
  });

export interface PipelineValueContract {
  defaultValue?: PipelineValue;
  description?: string;
  kind: PipelineValueKind;
  required: boolean;
  schema?: PipelineJsonSchema;
}

export type PipelineInputBinding =
  | {
    inputKey: string;
    source: 'pipeline-input';
  }
  | {
    nodeId: string;
    outputKey: string;
    source: 'node-output';
  }
  | {
    source: 'literal';
    value: PipelineValue;
  };

export interface PipelineNodeDefinition {
  config: Record<string, PipelineValue>;
  handlerType: string;
  handlerVersion: string;
  id: string;
  inputs: Record<string, PipelineInputBinding>;
}

export interface PipelineOutputBinding {
  nodeId: string;
  outputKey: string;
}

export interface ExecutablePipelineDefinition {
  inputs: Record<string, PipelineValueContract>;
  nodes: PipelineNodeDefinition[];
  /** Absent only on legacy schemaVersion 1 publications. */
  outputContracts?: Record<string, PipelineValueContract>;
  outputs: Record<string, PipelineOutputBinding>;
  schemaVersion: 1;
}

export interface CompiledPipelinePlan {
  definition: ExecutablePipelineDefinition;
  executionLevels: string[][];
}

export interface PipelineExecutionContext {
  pipelineId: string;
  pipelineVersion: number;
  runId: string;
  sourceApplication: string;
  workspaceId: string;
}

export interface PipelineNodeHandlerInput {
  config: Record<string, PipelineValue>;
  context: PipelineExecutionContext;
  inputs: PipelineInputs;
  nodeId: string;
  signal: AbortSignal;
}

export interface PipelineNodeHandler {
  execute(input: PipelineNodeHandlerInput): Promise<PipelineNodeOutputs>;
  handlerType: string;
  handlerVersion: string;
}

export interface PipelineNodeHandlerRegistry {
  resolve(handlerType: string, handlerVersion: string): PipelineNodeHandler | null;
}

export interface PipelineExecutionResult {
  nodeOutputs: Record<string, PipelineNodeOutputs>;
  outputs: PipelineNodeOutputs;
}

export type PipelineRunStatus =
  | 'canceled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface PipelineRunJob {
  apiKeyId: string | null;
  attemptCount: number;
  cancelRequestedAt: Date | null;
  consumerId: string | null;
  createdAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  finishedAt: Date | null;
  id: string;
  idempotencyKey: string;
  input: PipelineInputs;
  leaseExpiresAt: Date | null;
  maxAttempts: number;
  pipelineId: string;
  pipelineVersion: number;
  requestFingerprint: string;
  retryAvailableAt: Date | null;
  retryable: boolean | null;
  sourceApplication: string;
  startedAt: Date | null;
  status: PipelineRunStatus;
  workspaceId: string;
}

export interface PipelineRunCompletion {
  nodeOutputs: Record<string, PipelineNodeOutputs>;
  outputs: PipelineNodeOutputs;
  usage?: {
    actualCostUsd: string | null;
    totalTokens: string | null;
  };
}

export type PipelineHeartbeatResult = 'canceled' | 'lost' | 'renewed';

export interface PipelineRunQueue {
  cancel(input: {
    attemptCount: number;
    canceledAt: Date;
    runId: string;
  }): Promise<boolean>;
  claimNext(input: {
    claimedAt: Date;
    leaseExpiresAt: Date;
  }): Promise<PipelineRunJob | null>;
  fail(input: {
    attemptCount: number;
    errorCode: string;
    errorMessage: string;
    failedAt: Date;
    retryAvailableAt: Date | null;
    retryable: boolean;
    runId: string;
  }): Promise<boolean>;
  heartbeat(input: {
    attemptCount: number;
    heartbeatAt: Date;
    leaseExpiresAt: Date;
    runId: string;
  }): Promise<PipelineHeartbeatResult>;
  succeed(input: {
    attemptCount: number;
    completedAt: Date;
    result: PipelineRunCompletion;
    runId: string;
  }): Promise<boolean>;
}

export interface PipelineRunExecutor {
  execute(input: {
    run: PipelineRunJob;
    signal: AbortSignal;
  }): Promise<PipelineRunCompletion>;
}

export interface NewPipelineRun {
  apiKeyId?: string | null;
  consumerId?: string | null;
  id: string;
  idempotencyKey: string;
  input: PipelineInputs;
  maxAttempts: number;
  pipelineId: string;
  pipelineVersion: number;
  requestFingerprint: string;
  sourceApplication: string;
  workspaceId: string;
}

export interface PipelineRunStore {
  createOrFind(input: NewPipelineRun): Promise<{
    created: boolean;
    run: PipelineRunJob;
  }>;
  findById(runId: string): Promise<PipelineRunJob | null>;
  requestCancel(input: {
    requestedAt: Date;
    runId: string;
  }): Promise<PipelineRunJob | null>;
}
