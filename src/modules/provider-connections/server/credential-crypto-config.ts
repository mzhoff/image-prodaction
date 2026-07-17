import {
  createAes256GcmCredentialCrypto,
  decodeCredentialMasterKey,
  type CredentialCryptoAdapter,
} from '@/modules/provider-connections';

let cachedCredentialCrypto: CredentialCryptoAdapter | undefined;

export function getCredentialCrypto() {
  cachedCredentialCrypto ??= createCredentialCryptoFromEnv();
  return cachedCredentialCrypto;
}

export function createCredentialCryptoFromEnv(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const activeKeyVersion = normalizeKeyVersion(
    environment.PROVIDER_CREDENTIALS_MASTER_KEY_VERSION ?? 'v1',
  );
  const keys = readConfiguredKeys(environment, activeKeyVersion);
  const activeKey = keys[activeKeyVersion];
  if (!activeKey) {
    throw new ProviderCredentialConfigurationError(
      `Credential encryption key ${activeKeyVersion} is not configured.`,
    );
  }
  const encodedFingerprintKey = environment.PROVIDER_CREDENTIALS_FINGERPRINT_KEY?.trim();
  if (!encodedFingerprintKey) {
    throw new ProviderCredentialConfigurationError(
      'PROVIDER_CREDENTIALS_FINGERPRINT_KEY is required.',
    );
  }
  const fingerprintKey = decodeCredentialMasterKey(encodedFingerprintKey);

  return createAes256GcmCredentialCrypto({
    activeKeyVersion,
    fingerprintKey,
    keys,
  });
}

export class ProviderCredentialConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderCredentialConfigurationError';
  }
}

function readConfiguredKeys(
  environment: NodeJS.ProcessEnv,
  activeKeyVersion: string,
) {
  const serializedKeys = environment.PROVIDER_CREDENTIALS_MASTER_KEYS?.trim();
  if (serializedKeys) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(serializedKeys);
    } catch {
      throw new ProviderCredentialConfigurationError(
        'PROVIDER_CREDENTIALS_MASTER_KEYS must be a JSON object.',
      );
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ProviderCredentialConfigurationError(
        'PROVIDER_CREDENTIALS_MASTER_KEYS must be a JSON object.',
      );
    }
    return Object.fromEntries(Object.entries(parsed).map(([version, encoded]) => {
      if (typeof encoded !== 'string') {
        throw new ProviderCredentialConfigurationError(
          `Credential key ${version} must be base64 text.`,
        );
      }
      return [normalizeKeyVersion(version), decodeCredentialMasterKey(encoded.trim())];
    }));
  }

  const singleKey = environment.PROVIDER_CREDENTIALS_MASTER_KEY?.trim();
  if (!singleKey) {
    throw new ProviderCredentialConfigurationError(
      'PROVIDER_CREDENTIALS_MASTER_KEY is required.',
    );
  }
  return {
    [activeKeyVersion]: decodeCredentialMasterKey(singleKey),
  };
}

function normalizeKeyVersion(value: string) {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9._-]{1,40}$/.test(normalized)) {
    throw new ProviderCredentialConfigurationError(
      'Credential encryption key version is invalid.',
    );
  }
  return normalized;
}
