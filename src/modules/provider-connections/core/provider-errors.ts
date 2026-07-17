import type {
  ProviderErrorClassificationContext,
  ProviderErrorCode,
  ProviderErrorDescriptor,
  ProviderFailureClassification,
} from '../contracts/provider-error-contracts';
import type { ProviderUsage } from '../contracts/provider-contracts';

export class ProviderAdapterError extends Error {
  readonly descriptor: ProviderErrorDescriptor;

  constructor(descriptor: ProviderErrorDescriptor, cause?: unknown) {
    super(descriptor.message, cause === undefined ? undefined : { cause });
    this.name = 'ProviderAdapterError';
    this.descriptor = descriptor;
  }
}

export class ProviderHttpError extends Error {
  readonly errorType: string | null;
  readonly providerOperationId: string | null;
  readonly retryAfterMs: number | null;
  readonly status: number;
  readonly usage: ProviderUsage | null;

  constructor(input: {
    errorType?: string | null;
    providerOperationId?: string | null;
    retryAfterMs?: number | null;
    status: number;
    usage?: ProviderUsage | null;
  }) {
    super(`Provider HTTP request failed with status ${input.status}.`);
    this.name = 'ProviderHttpError';
    this.errorType = input.errorType ?? null;
    this.providerOperationId = input.providerOperationId ?? null;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.status = input.status;
    this.usage = input.usage ?? null;
  }
}

export class ProviderTimeoutError extends Error {
  readonly providerOperationId: string | null;
  readonly requestDispatched: boolean;

  constructor(input: {
    providerOperationId?: string | null;
    requestDispatched: boolean;
  }) {
    super('Provider request timed out.');
    this.name = 'ProviderTimeoutError';
    this.providerOperationId = input.providerOperationId ?? null;
    this.requestDispatched = input.requestDispatched;
  }
}

export class ProviderCanceledError extends Error {
  readonly requestDispatched: boolean;

  constructor(requestDispatched = false) {
    super('Provider request was canceled.');
    this.name = 'ProviderCanceledError';
    this.requestDispatched = requestDispatched;
  }
}

export function classifyProviderError(
  error: unknown,
  context: ProviderErrorClassificationContext = {},
): ProviderErrorDescriptor {
  if (error instanceof ProviderAdapterError) return error.descriptor;
  if (error instanceof ProviderCanceledError) {
    return descriptor('canceled', error.requestDispatched ? 'ambiguous' : 'permanent', {
      message: error.requestDispatched
        ? 'Provider request was canceled after dispatch; its outcome must be reconciled.'
        : 'Provider request was canceled before dispatch.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (error instanceof ProviderTimeoutError) {
    const providerOperationId = error.providerOperationId ?? context.providerOperationId ?? null;
    const requestDispatched = error.requestDispatched || context.requestDispatched === true;
    return descriptor('timeout', requestDispatched || providerOperationId ? 'ambiguous' : 'retryable', {
      message: requestDispatched || providerOperationId
        ? 'Provider request timed out after dispatch; reconciliation is required before retry.'
        : 'Provider request timed out before dispatch and may be retried.',
      providerOperationId,
    });
  }
  if (error instanceof ProviderHttpError) {
    return classifyHttpStatus(error.status, {
      errorType: error.errorType,
      providerOperationId: error.providerOperationId ?? context.providerOperationId,
      requestDispatched: context.requestDispatched ?? true,
      retryAfterMs: error.retryAfterMs,
    });
  }

  const status = readStatus(error);
  if (status !== null) {
    return classifyHttpStatus(status, {
      providerOperationId: context.providerOperationId,
      requestDispatched: context.requestDispatched,
    });
  }

  if (isAbortError(error)) {
    return context.requestDispatched
      ? descriptor('timeout', 'ambiguous', {
        message: 'Provider request ended after dispatch; reconciliation is required before retry.',
        providerOperationId: context.providerOperationId,
      })
      : descriptor('canceled', 'permanent', {
        message: 'Provider request was canceled before dispatch.',
        providerOperationId: context.providerOperationId,
      });
  }

  if (isNetworkError(error)) {
    return descriptor('network_error', context.requestDispatched ? 'ambiguous' : 'retryable', {
      message: context.requestDispatched
        ? 'Provider connection failed after dispatch; reconciliation is required before retry.'
        : 'Provider connection failed before dispatch and may be retried.',
      providerOperationId: context.providerOperationId,
    });
  }

  return descriptor('unknown', context.requestDispatched ? 'ambiguous' : 'permanent', {
    message: context.requestDispatched
      ? 'Provider outcome is unknown; reconciliation is required before retry.'
      : 'Provider request failed before dispatch.',
    providerOperationId: context.providerOperationId,
  });
}

export function createMissingModalityError(input: {
  actualModalities: string[];
  expectedModalities: string[];
  providerOperationId?: string | null;
}) {
  const providerOperationId = input.providerOperationId ?? null;
  return new ProviderAdapterError(descriptor(
    'missing_modality',
    providerOperationId ? 'ambiguous' : 'permanent',
    {
      message: providerOperationId
        ? 'Provider completed without the required output modality; reconciliation is required.'
        : 'Provider response does not contain the required output modality.',
      providerOperationId,
    },
  ));
}

export function createInvalidProviderResponseError(providerOperationId?: string | null) {
  const normalizedOperationId = providerOperationId ?? null;
  return new ProviderAdapterError(descriptor(
    'invalid_response',
    normalizedOperationId ? 'ambiguous' : 'retryable',
    {
      message: normalizedOperationId
        ? 'Provider returned an invalid response after accepting the operation.'
        : 'Provider returned an invalid response.',
      providerOperationId: normalizedOperationId,
    },
  ));
}

function classifyHttpStatus(
  status: number,
  context: ProviderErrorClassificationContext & {
    errorType?: string | null;
    retryAfterMs?: number | null;
  },
): ProviderErrorDescriptor {
  const typedDescriptor = classifyProviderErrorType(
    'errorType' in context && typeof context.errorType === 'string'
      ? context.errorType
      : null,
    status,
    context,
  );
  if (typedDescriptor) return typedDescriptor;
  if (status === 401) {
    return descriptor('invalid_credential', 'permanent', {
      httpStatus: status,
      message: 'Provider credential is invalid or revoked.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (status === 402) {
    return descriptor('payment_required', 'permanent', {
      httpStatus: status,
      message: 'Provider account or credential has insufficient credits.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (status === 403) {
    return descriptor('forbidden', 'permanent', {
      httpStatus: status,
      message: 'Provider rejected the operation because the credential lacks permission.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (status === 408) {
    const ambiguous = context.requestDispatched !== false;
    return descriptor('timeout', ambiguous ? 'ambiguous' : 'retryable', {
      httpStatus: status,
      message: ambiguous
        ? 'Provider timed out after dispatch; reconciliation is required before retry.'
        : 'Provider timed out before dispatch and may be retried.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (status === 429) {
    return descriptor('rate_limited', context.providerOperationId ? 'ambiguous' : 'retryable', {
      httpStatus: status,
      message: context.providerOperationId
        ? 'Provider returned a rate-limit response after accepting an operation; reconciliation is required.'
        : 'Provider rate limit was reached.',
      providerOperationId: context.providerOperationId,
      retryAfterMs: context.retryAfterMs,
    });
  }
  if (status >= 500) {
    return descriptor(
      'upstream_unavailable',
      context.providerOperationId ? 'ambiguous' : 'retryable',
      {
      httpStatus: status,
      message: context.providerOperationId
        ? 'Provider failed after accepting an operation; reconciliation is required.'
        : 'Provider is temporarily unavailable.',
      providerOperationId: context.providerOperationId,
      retryAfterMs: context.retryAfterMs,
      },
    );
  }
  if (status === 404) {
    return descriptor('not_found', 'permanent', {
      httpStatus: status,
      message: 'Provider resource was not found.',
      providerOperationId: context.providerOperationId,
    });
  }
  return descriptor('invalid_request', 'permanent', {
    httpStatus: status,
    message: 'Provider rejected the request.',
    providerOperationId: context.providerOperationId,
  });
}

function classifyProviderErrorType(
  errorType: string | null,
  status: number,
  context: ProviderErrorClassificationContext & { retryAfterMs?: number | null },
): ProviderErrorDescriptor | null {
  if (!errorType) return null;
  if (errorType === 'authentication') {
    return descriptor('invalid_credential', 'permanent', {
      httpStatus: status,
      message: 'Provider credential is invalid or revoked.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (errorType === 'payment_required') {
    return descriptor('payment_required', 'permanent', {
      httpStatus: status,
      message: 'Provider account or credential has insufficient credits.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (errorType === 'permission_denied' || errorType === 'content_policy_violation') {
    return descriptor('forbidden', 'permanent', {
      httpStatus: status,
      message: 'Provider rejected the operation because it is not permitted.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (errorType === 'rate_limit_exceeded') {
    return descriptor('rate_limited', context.providerOperationId ? 'ambiguous' : 'retryable', {
      httpStatus: status,
      message: context.providerOperationId
        ? 'Provider returned a rate-limit response after accepting an operation; reconciliation is required.'
        : 'Provider rate limit was reached.',
      providerOperationId: context.providerOperationId,
      retryAfterMs: context.retryAfterMs,
    });
  }
  if (errorType === 'timeout') {
    return descriptor('timeout', 'ambiguous', {
      httpStatus: status,
      message: 'Provider timed out after dispatch; reconciliation is required before retry.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (errorType === 'provider_overloaded' || errorType === 'provider_unavailable' || errorType === 'server') {
    return descriptor(
      'upstream_unavailable',
      context.providerOperationId ? 'ambiguous' : 'retryable',
      {
      httpStatus: status,
      message: context.providerOperationId
        ? 'Provider failed after accepting an operation; reconciliation is required.'
        : 'Provider is temporarily unavailable.',
      providerOperationId: context.providerOperationId,
      retryAfterMs: context.retryAfterMs,
      },
    );
  }
  if ([
    'context_length_exceeded',
    'invalid_request',
    'invalid_prompt',
    'max_tokens_exceeded',
    'payload_too_large',
    'precondition_failed',
    'string_too_long',
    'token_limit_exceeded',
    'unprocessable',
  ].includes(errorType)) {
    return descriptor('invalid_request', 'permanent', {
      httpStatus: status,
      message: 'Provider rejected the request.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (errorType === 'not_found') {
    return descriptor('not_found', 'permanent', {
      httpStatus: status,
      message: 'Provider resource was not found.',
      providerOperationId: context.providerOperationId,
    });
  }
  return null;
}

function descriptor(
  code: ProviderErrorCode,
  classification: ProviderFailureClassification,
  options: {
    httpStatus?: number | null;
    message: string;
    providerOperationId?: string | null;
    retryAfterMs?: number | null;
  },
): ProviderErrorDescriptor {
  return {
    classification,
    code,
    httpStatus: options.httpStatus ?? null,
    message: options.message,
    providerOperationId: options.providerOperationId ?? null,
    retryAfterMs: options.retryAfterMs ?? null,
  };
}

function readStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return Number.isSafeInteger(status) && Number(status) >= 100 && Number(status) <= 599
    ? Number(status)
    : null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError
    || (error instanceof Error && ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(
      String((error as Error & { code?: unknown }).code ?? ''),
    ));
}
