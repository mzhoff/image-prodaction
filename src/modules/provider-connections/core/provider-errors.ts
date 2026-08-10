import type {
  ProviderErrorClassificationContext,
  ProviderErrorDescriptor,
} from '../contracts/provider-error-contracts';
import { classifyHttpStatus, descriptor } from './provider-error-descriptors';
import {
  ProviderAdapterError,
  ProviderCanceledError,
  ProviderHttpError,
  ProviderTimeoutError,
} from './provider-error-types';

export {
  ProviderAdapterError,
  ProviderCanceledError,
  ProviderHttpError,
  ProviderTimeoutError,
} from './provider-error-types';

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
    const dispatched = error.requestDispatched || context.requestDispatched === true;
    return descriptor('timeout', dispatched || providerOperationId ? 'ambiguous' : 'retryable', {
      message: dispatched || providerOperationId
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
