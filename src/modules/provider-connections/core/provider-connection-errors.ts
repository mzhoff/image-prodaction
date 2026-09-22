import { ProviderAdapterError } from './provider-errors';
import { AI_BUDGET_NOT_ACTIVATED, AI_CONNECTION_UNAVAILABLE } from './ai-access-messages';

export class ProviderConnectionNotConfiguredError extends Error {
  readonly code: 'provider_not_configured' | 'provider_connection_unavailable';
  readonly unavailable: boolean;
  constructor(unavailable = false) {
    super(unavailable ? AI_CONNECTION_UNAVAILABLE : AI_BUDGET_NOT_ACTIVATED);
    this.name = 'ProviderConnectionNotConfiguredError';
    this.unavailable = unavailable;
    this.code = unavailable ? 'provider_connection_unavailable' : 'provider_not_configured';
  }
}

export class ProviderCredentialValidationError extends Error {
  readonly providerError: ProviderAdapterError;

  constructor(error: ProviderAdapterError) {
    super('OpenRouter rejected this key. Check the key and its permissions.');
    this.name = 'ProviderCredentialValidationError';
    this.providerError = error;
  }
}

export class ManagedProviderConnectionError extends Error {
  constructor() {
    super('AI-бюджетом управляет платформа. Для изменения подключения обратитесь к оператору.');
    this.name = 'ManagedProviderConnectionError';
  }
}
