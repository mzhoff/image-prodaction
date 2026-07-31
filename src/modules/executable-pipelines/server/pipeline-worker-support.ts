import {
  PipelineDomainError,
  PipelineNodeHandlerError,
} from '../contracts/pipeline-errors';

export function normalizePipelineExecutionFailure(error: unknown) {
  if (error instanceof PipelineNodeHandlerError || error instanceof PipelineDomainError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  return {
    code: 'pipeline_handler_failed',
    message: 'Pipeline execution failed.',
    retryable: false,
  };
}

export function normalizePipelineWorkerPositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

export function waitForPipelineWorker(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

export function isPipelineWorkerAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
    || error instanceof Error && /aborted|canceled|cancelled|lease/i.test(error.message);
}
