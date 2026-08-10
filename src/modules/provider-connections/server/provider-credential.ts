import type { CredentialCryptoAdapter, ProviderAdapter } from '..';
import { ProviderAdapterError } from '../core/provider-errors';
import {
  ProviderConnectionNotConfiguredError,
  ProviderCredentialValidationError,
} from '../core/provider-connection-errors';
import {
  findProviderConnection,
  type ProviderConnectionWithCredential,
} from '../adapters/postgres/provider-connection-repository';

export async function resolveStoredProviderCredential(input: {
  crypto: CredentialCryptoAdapter;
  provider: string;
  requireConnected?: boolean;
  workspaceId: string;
}) {
  const record = await findProviderConnection(input.workspaceId, input.provider);
  assertDecryptableConnection(record, input.requireConnected ?? false);
  const apiKey = input.crypto.decrypt({
    algorithm: 'aes-256-gcm',
    version: 1,
    authenticationTag: record.authenticationTag,
    ciphertext: record.encryptedSecret,
    initializationVector: record.initializationVector,
    keyVersion: record.encryptionKeyVersion,
  }, {
    binding: createCredentialBinding(input.workspaceId, input.provider),
  });
  return { apiKey, connection: record };
}

export async function validateProviderCredential(adapter: ProviderAdapter, apiKey: string) {
  try {
    return await adapter.validateCredential({ credential: apiKey });
  } catch (error) {
    throw new ProviderCredentialValidationError(toProviderAdapterError(adapter, error));
  }
}

export function toProviderAdapterError(adapter: ProviderAdapter, error: unknown) {
  return error instanceof ProviderAdapterError
    ? error
    : new ProviderAdapterError(adapter.classifyError(error));
}

export function normalizeOpenRouterKey(value: string) {
  const normalized = value.trim();
  if (normalized.length < 16 || normalized.length > 512 || /\s/.test(normalized)) {
    throw new ProviderCredentialValidationError(new ProviderAdapterError({
      classification: 'permanent',
      code: 'invalid_credential',
      httpStatus: null,
      message: 'OpenRouter key format is invalid.',
      providerOperationId: null,
      retryAfterMs: null,
    }));
  }
  return normalized;
}

export function createCredentialBinding(workspaceId: string, provider: string) {
  return `workspace:${workspaceId}:provider:${provider}`;
}

function assertDecryptableConnection(
  record: ProviderConnectionWithCredential,
  requireConnected: boolean,
): asserts record is NonNullable<ProviderConnectionWithCredential> & {
  authenticationTag: string;
  encryptedSecret: string;
  encryptionKeyVersion: string;
  initializationVector: string;
} {
  if (!record || !record.encryptedSecret || !record.authenticationTag
    || !record.initializationVector || record.encryptionKeyVersion === null
    || (requireConnected && record.status !== 'connected')) {
    throw new ProviderConnectionNotConfiguredError();
  }
}
