import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type {
  CredentialCryptoAdapter,
  CredentialCryptoContext,
  EncryptedCredentialEnvelope,
} from '../contracts/credential-crypto-contracts';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const KEY_BYTES = 32;
const MAX_SECRET_BYTES = 16 * 1024;
const AAD_DOMAIN = 'reverie:provider-credential:v1';

export interface Aes256GcmCredentialCryptoOptions {
  activeKeyVersion: string;
  fingerprintKey: Uint8Array;
  keys: Record<string, Uint8Array>;
}

export class CredentialCryptoError extends Error {
  readonly code: 'invalid_configuration' | 'invalid_envelope' | 'decrypt_failed';

  constructor(code: CredentialCryptoError['code'], message: string) {
    super(message);
    this.name = 'CredentialCryptoError';
    this.code = code;
  }
}

export function createAes256GcmCredentialCrypto(
  options: Aes256GcmCredentialCryptoOptions,
): CredentialCryptoAdapter {
  const keys = new Map(
    Object.entries(options.keys).map(([version, key]) => [version, normalizeKey(key, `key ${version}`)]),
  );
  const activeKey = keys.get(options.activeKeyVersion);
  if (!activeKey) {
    throw new CredentialCryptoError(
      'invalid_configuration',
      'Active credential encryption key version is not configured.',
    );
  }
  const fingerprintKey = normalizeKey(options.fingerprintKey, 'fingerprint key');

  return {
    activeKeyVersion: options.activeKeyVersion,

    encrypt(secret, context) {
      const secretBytes = validateSecret(secret);
      const binding = validateBinding(context);
      const initializationVector = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, activeKey, initializationVector, {
        authTagLength: AUTHENTICATION_TAG_BYTES,
      });
      cipher.setAAD(createAssociatedData(options.activeKeyVersion, binding));
      const ciphertext = Buffer.concat([cipher.update(secretBytes), cipher.final()]);
      const authenticationTag = cipher.getAuthTag();
      secretBytes.fill(0);
      return {
        algorithm: ALGORITHM,
        authenticationTag: authenticationTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        initializationVector: initializationVector.toString('base64'),
        keyVersion: options.activeKeyVersion,
        version: ENVELOPE_VERSION,
      };
    },

    decrypt(envelope, context) {
      const binding = validateBinding(context);
      const normalized = validateEnvelope(envelope);
      const key = keys.get(normalized.keyVersion);
      if (!key) {
        throw new CredentialCryptoError(
          'invalid_envelope',
          'Credential envelope references an unavailable key version.',
        );
      }
      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          key,
          Buffer.from(normalized.initializationVector, 'base64'),
          { authTagLength: AUTHENTICATION_TAG_BYTES },
        );
        decipher.setAAD(createAssociatedData(normalized.keyVersion, binding));
        decipher.setAuthTag(Buffer.from(normalized.authenticationTag, 'base64'));
        const plaintext = Buffer.concat([
          decipher.update(Buffer.from(normalized.ciphertext, 'base64')),
          decipher.final(),
        ]);
        const secret = plaintext.toString('utf8');
        plaintext.fill(0);
        validateSecret(secret).fill(0);
        return secret;
      } catch (error) {
        if (error instanceof CredentialCryptoError) throw error;
        throw new CredentialCryptoError(
          'decrypt_failed',
          'Credential could not be decrypted with the supplied key and binding.',
        );
      }
    },

    fingerprint(secret) {
      const secretBytes = validateSecret(secret);
      const digest = createHmac('sha256', fingerprintKey)
        .update(AAD_DOMAIN)
        .update('\0')
        .update(secretBytes)
        .digest('hex');
      secretBytes.fill(0);
      return `hmac-sha256:v1:${digest}`;
    },

    maskedLabel(secret) {
      return createMaskedCredentialLabel(secret);
    },
  };
}

export function decodeCredentialMasterKey(base64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new CredentialCryptoError('invalid_configuration', 'Credential master key must be base64.');
  }
  return normalizeKey(Buffer.from(base64, 'base64'), 'credential master key');
}

export function createMaskedCredentialLabel(secret: string) {
  validateSecret(secret).fill(0);
  const versionedOpenRouterPrefix = secret.match(/^sk-or-v\d+-/)?.[0];
  const prefix = versionedOpenRouterPrefix ?? (secret.startsWith('sk-or-') ? 'sk-or-' : '');
  if (secret.length <= 4) return '••••';
  return `${prefix}••••${secret.slice(-4)}`;
}

function normalizeKey(value: Uint8Array, label: string) {
  const key = Buffer.from(value);
  if (key.length !== KEY_BYTES) {
    key.fill(0);
    throw new CredentialCryptoError(
      'invalid_configuration',
      `${label} must contain exactly ${KEY_BYTES} bytes.`,
    );
  }
  return key;
}

function validateSecret(secret: string) {
  const bytes = Buffer.from(secret, 'utf8');
  if (bytes.length === 0 || bytes.length > MAX_SECRET_BYTES) {
    bytes.fill(0);
    throw new CredentialCryptoError(
      'invalid_configuration',
      `Credential secret must contain between 1 and ${MAX_SECRET_BYTES} UTF-8 bytes.`,
    );
  }
  return bytes;
}

function validateBinding(context: CredentialCryptoContext) {
  const binding = context.binding.trim();
  if (!binding || binding.length > 1_000) {
    throw new CredentialCryptoError(
      'invalid_configuration',
      'Credential encryption binding is required and must not exceed 1000 characters.',
    );
  }
  return binding;
}

function validateEnvelope(envelope: EncryptedCredentialEnvelope) {
  if (
    envelope.version !== ENVELOPE_VERSION
    || envelope.algorithm !== ALGORITHM
    || !envelope.keyVersion
    || !isBase64WithByteLength(envelope.initializationVector, IV_BYTES)
    || !isBase64WithByteLength(envelope.authenticationTag, AUTHENTICATION_TAG_BYTES)
    || !isBase64(envelope.ciphertext)
  ) {
    throw new CredentialCryptoError('invalid_envelope', 'Credential envelope is invalid.');
  }
  return envelope;
}

function createAssociatedData(keyVersion: string, binding: string) {
  return Buffer.from(`${AAD_DOMAIN}\0${keyVersion}\0${binding}`, 'utf8');
}

function isBase64WithByteLength(value: string, byteLength: number) {
  return isBase64(value) && Buffer.from(value, 'base64').length === byteLength;
}

function isBase64(value: string) {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return false;
  }
  return Buffer.from(value, 'base64').toString('base64') === value;
}
