import { createHmac, timingSafeEqual } from 'node:crypto';
const PATH = '/v1/platform/budget-connection';
export function validPlatformSignature(input: { body: string; timestamp: string | null; signature: string | null; secret: string; path?: string; now?: number }) {
  const { body, timestamp, signature, secret, now = Date.now() } = input;
  if (secret.length < 32 || !timestamp || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}\nPOST\n${input.path ?? PATH}\n${body}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
