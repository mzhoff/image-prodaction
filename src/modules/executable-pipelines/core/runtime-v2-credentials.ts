import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RuntimeV2Scope } from '../contracts/runtime-v2-contracts';
import { RuntimeV2Error } from '../contracts/runtime-v2-errors';

export function generateRuntimeClientToken() {
  const secret = randomBytes(32).toString('base64url');
  return `rvr_client_${secret.slice(0, 12)}.${secret}`;
}
export function parseRuntimeClientToken(token: string) {
  const match = /^rvr_client_([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return match && match[2]?.slice(0, 12) === match[1] ? { tokenPrefix: match[1]! } : null;
}
export function hashRuntimeClientToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function runtimeClientTokenMatches(token: string, hash: string) {
  const actual = Buffer.from(hashRuntimeClientToken(token), 'hex');
  const expected = Buffer.from(hash, 'hex');
  return expected.length === 32 && timingSafeEqual(actual, expected);
}
export function requireRuntimeScope(scopes: readonly RuntimeV2Scope[], required: RuntimeV2Scope) {
  if (!scopes.includes(required)) throw new RuntimeV2Error('missing_scope', 'This credential does not allow this operation.', 403);
}
export function assertRuntimeCredentialActive(record: {
  enabled: boolean; revokedAt: Date | null; expiresAt: Date | null;
}, now = new Date()) {
  if (record.revokedAt) throw new RuntimeV2Error('revoked_credential', 'The credential was revoked.', 401);
  if (record.expiresAt && record.expiresAt <= now) throw new RuntimeV2Error('expired_credential', 'The credential has expired.', 401);
  if (!record.enabled) throw new RuntimeV2Error('disabled_service_client', 'The connection is disabled.', 403);
}
