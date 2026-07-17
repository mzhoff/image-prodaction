import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CredentialCryptoError,
  createAes256GcmCredentialCrypto,
  decodeCredentialMasterKey,
} from '../index';

const secret = 'sk-or-v1-this-is-a-sensitive-provider-key-1234';
const binding = { binding: 'workspace-1:connection-1' };
const v1Key = Buffer.alloc(32, 0x11);
const v2Key = Buffer.alloc(32, 0x22);
const fingerprintKey = Buffer.alloc(32, 0x33);

test('AES-256-GCM envelope is versioned, randomized and does not contain plaintext', () => {
  const crypto = createAes256GcmCredentialCrypto({
    activeKeyVersion: 'v1',
    fingerprintKey,
    keys: { v1: v1Key },
  });
  const first = crypto.encrypt(secret, binding);
  const second = crypto.encrypt(secret, binding);

  assert.equal(first.algorithm, 'aes-256-gcm');
  assert.equal(first.version, 1);
  assert.equal(first.keyVersion, 'v1');
  assert.notEqual(first.initializationVector, second.initializationVector);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(JSON.stringify(first).includes(secret), false);
  assert.equal(crypto.decrypt(first, binding), secret);
});

test('credential envelope is bound to its owner and detects tampering', () => {
  const crypto = createAes256GcmCredentialCrypto({
    activeKeyVersion: 'v1',
    fingerprintKey,
    keys: { v1: v1Key },
  });
  const envelope = crypto.encrypt(secret, binding);

  assert.throws(
    () => crypto.decrypt(envelope, { binding: 'workspace-2:connection-1' }),
    (error: unknown) => error instanceof CredentialCryptoError && error.code === 'decrypt_failed',
  );
  assert.throws(
    () => crypto.decrypt({
      ...envelope,
      ciphertext: Buffer.from('tampered').toString('base64'),
    }, binding),
    (error: unknown) => error instanceof CredentialCryptoError && error.code === 'decrypt_failed',
  );
});

test('key rotation keeps old envelopes decryptable by key version', () => {
  const oldCrypto = createAes256GcmCredentialCrypto({
    activeKeyVersion: 'v1',
    fingerprintKey,
    keys: { v1: v1Key },
  });
  const envelope = oldCrypto.encrypt(secret, binding);
  const rotatedCrypto = createAes256GcmCredentialCrypto({
    activeKeyVersion: 'v2',
    fingerprintKey,
    keys: { v1: v1Key, v2: v2Key },
  });

  assert.equal(rotatedCrypto.decrypt(envelope, binding), secret);
  assert.equal(rotatedCrypto.encrypt(secret, binding).keyVersion, 'v2');
});

test('fingerprint is keyed and masked label reveals only provider prefix and suffix', () => {
  const crypto = createAes256GcmCredentialCrypto({
    activeKeyVersion: 'v1',
    fingerprintKey,
    keys: { v1: v1Key },
  });
  const fingerprint = crypto.fingerprint(secret);
  const label = crypto.maskedLabel(secret);

  assert.equal(fingerprint, crypto.fingerprint(secret));
  assert.match(fingerprint, /^hmac-sha256:v1:[a-f0-9]{64}$/);
  assert.equal(fingerprint.includes(secret), false);
  assert.equal(label, 'sk-or-v1-••••1234');
  assert.equal(label.includes(secret), false);
});

test('master key decoder accepts exactly 32 base64 bytes', () => {
  assert.deepEqual(decodeCredentialMasterKey(v1Key.toString('base64')), v1Key);
  assert.throws(
    () => decodeCredentialMasterKey(Buffer.alloc(31).toString('base64')),
    CredentialCryptoError,
  );
});
