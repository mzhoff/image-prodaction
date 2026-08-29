export type PipelineErrorCode =
  | 'pipeline_aborted'
  | 'pipeline_cycle_detected'
  | 'pipeline_definition_invalid'
  | 'pipeline_handler_failed'
  | 'pipeline_handler_missing'
  | 'pipeline_idempotency_conflict'
  | 'pipeline_input_invalid'
  | 'pipeline_node_output_missing'
  | 'pipeline_output_invalid'
  | 'pipeline_run_not_found'
  | 'pipeline_run_transition_invalid';

export class PipelineDomainError extends Error {
  readonly code: PipelineErrorCode;
  readonly retryable: boolean;

  constructor(input: {
    code: PipelineErrorCode;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = 'PipelineDomainError';
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}

export class PipelineNodeHandlerError extends PipelineDomainError {
  readonly nodeId?: string;

  constructor(input: {
    code?: PipelineErrorCode;
    message: string;
    nodeId?: string;
    retryable?: boolean;
  }) {
    super({
      code: input.code ?? 'pipeline_handler_failed',
      message: input.message,
      retryable: input.retryable,
    });
    this.name = 'PipelineNodeHandlerError';
    this.nodeId = input.nodeId;
  }
}
