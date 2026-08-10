import type { ProviderErrorDescriptor } from '../contracts/provider-error-contracts';
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

  constructor(input: { providerOperationId?: string | null; requestDispatched: boolean }) {
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
