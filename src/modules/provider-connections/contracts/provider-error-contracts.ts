export const PROVIDER_FAILURE_CLASSIFICATIONS = ['permanent', 'retryable', 'ambiguous'] as const;

export type ProviderFailureClassification = typeof PROVIDER_FAILURE_CLASSIFICATIONS[number];

export type ProviderErrorCode =
  | 'invalid_request'
  | 'invalid_credential'
  | 'payment_required'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'upstream_unavailable'
  | 'network_error'
  | 'missing_modality'
  | 'invalid_response'
  | 'canceled'
  | 'unknown';

export interface ProviderErrorDescriptor {
  classification: ProviderFailureClassification;
  code: ProviderErrorCode;
  httpStatus: number | null;
  message: string;
  providerOperationId: string | null;
  retryAfterMs: number | null;
}

export interface ProviderErrorClassificationContext {
  expectedModalities?: string[];
  providerOperationId?: string | null;
  requestDispatched?: boolean;
}
