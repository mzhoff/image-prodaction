import type {
  ProviderErrorClassificationContext,
  ProviderErrorCode,
  ProviderErrorDescriptor,
  ProviderFailureClassification,
} from '../contracts/provider-error-contracts';

type HttpClassificationContext = ProviderErrorClassificationContext & {
  errorType?: string | null;
  retryAfterMs?: number | null;
};

export function classifyHttpStatus(
  status: number,
  context: HttpClassificationContext,
): ProviderErrorDescriptor {
  const typedDescriptor = classifyProviderErrorType(context.errorType ?? null, status, context);
  if (typedDescriptor) return typedDescriptor;

  if (status === 401) return httpDescriptor('invalid_credential', status, context, 'Provider credential is invalid or revoked.');
  if (status === 402) return httpDescriptor('payment_required', status, context, 'Provider account or credential has insufficient credits.');
  if (status === 403) return httpDescriptor('forbidden', status, context, 'Provider rejected the operation because the credential lacks permission.');
  if (status === 404) return httpDescriptor('not_found', status, context, 'Provider resource was not found.');
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
  if (status === 429) return transientDescriptor('rate_limited', status, context, 'Provider rate limit was reached.');
  if (status >= 500) return transientDescriptor('upstream_unavailable', status, context, 'Provider is temporarily unavailable.');
  return httpDescriptor('invalid_request', status, context, 'Provider rejected the request.');
}

function classifyProviderErrorType(
  errorType: string | null,
  status: number,
  context: HttpClassificationContext,
): ProviderErrorDescriptor | null {
  if (!errorType) return null;
  if (errorType === 'authentication') return httpDescriptor('invalid_credential', status, context, 'Provider credential is invalid or revoked.');
  if (errorType === 'payment_required') return httpDescriptor('payment_required', status, context, 'Provider account or credential has insufficient credits.');
  if (errorType === 'permission_denied' || errorType === 'content_policy_violation') {
    return httpDescriptor('forbidden', status, context, 'Provider rejected the operation because it is not permitted.');
  }
  if (errorType === 'rate_limit_exceeded') return transientDescriptor('rate_limited', status, context, 'Provider rate limit was reached.');
  if (errorType === 'timeout') {
    return descriptor('timeout', 'ambiguous', {
      httpStatus: status,
      message: 'Provider timed out after dispatch; reconciliation is required before retry.',
      providerOperationId: context.providerOperationId,
    });
  }
  if (['provider_overloaded', 'provider_unavailable', 'server'].includes(errorType)) {
    return transientDescriptor('upstream_unavailable', status, context, 'Provider is temporarily unavailable.');
  }
  if ([
    'context_length_exceeded', 'invalid_request', 'invalid_prompt', 'max_tokens_exceeded',
    'payload_too_large', 'precondition_failed', 'string_too_long', 'token_limit_exceeded',
    'unprocessable',
  ].includes(errorType)) {
    return httpDescriptor('invalid_request', status, context, 'Provider rejected the request.');
  }
  if (errorType === 'not_found') return httpDescriptor('not_found', status, context, 'Provider resource was not found.');
  return null;
}

function httpDescriptor(
  code: ProviderErrorCode,
  status: number,
  context: HttpClassificationContext,
  message: string,
) {
  return descriptor(code, 'permanent', {
    httpStatus: status,
    message,
    providerOperationId: context.providerOperationId,
  });
}

function transientDescriptor(
  code: ProviderErrorCode,
  status: number,
  context: HttpClassificationContext,
  retryableMessage: string,
) {
  const ambiguous = Boolean(context.providerOperationId);
  return descriptor(code, ambiguous ? 'ambiguous' : 'retryable', {
    httpStatus: status,
    message: ambiguous
      ? code === 'rate_limited'
        ? 'Provider returned a rate-limit response after accepting an operation; reconciliation is required.'
        : 'Provider failed after accepting an operation; reconciliation is required.'
      : retryableMessage,
    providerOperationId: context.providerOperationId,
    retryAfterMs: context.retryAfterMs,
  });
}

export function descriptor(
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
