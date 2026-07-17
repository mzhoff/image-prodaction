export interface EncryptedCredentialEnvelopeV1 {
  algorithm: 'aes-256-gcm';
  authenticationTag: string;
  ciphertext: string;
  initializationVector: string;
  keyVersion: string;
  version: 1;
}

export type EncryptedCredentialEnvelope = EncryptedCredentialEnvelopeV1;

export interface CredentialCryptoContext {
  binding: string;
}

export interface CredentialCryptoAdapter {
  readonly activeKeyVersion: string;
  decrypt(
    envelope: EncryptedCredentialEnvelope,
    context: CredentialCryptoContext,
  ): string;
  encrypt(
    secret: string,
    context: CredentialCryptoContext,
  ): EncryptedCredentialEnvelope;
  fingerprint(secret: string): string;
  maskedLabel(secret: string): string;
}
