import { ProviderAdapterError } from './provider-errors';

export class ProviderConnectionNotConfiguredError extends Error {
  constructor() {
    super('OpenRouter is not connected for this Workspace.');
    this.name = 'ProviderConnectionNotConfiguredError';
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
