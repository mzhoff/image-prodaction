export function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createUuidV7(now = Date.now()) {
  const bytes = new Uint8Array(16);
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);

  const timestamp = Math.floor(Math.max(0, Math.min(now, 0xffffffffffff)));
  bytes[0] = Math.floor(timestamp / 0x10000000000) & 0xff;
  bytes[1] = Math.floor(timestamp / 0x100000000) & 0xff;
  bytes[2] = Math.floor(timestamp / 0x1000000) & 0xff;
  bytes[3] = Math.floor(timestamp / 0x10000) & 0xff;
  bytes[4] = Math.floor(timestamp / 0x100) & 0xff;
  bytes[5] = timestamp & 0xff;

  const randomA = ((randomBytes[0] << 8) | randomBytes[1]) & 0x0fff;
  bytes[6] = 0x70 | (randomA >> 8);
  bytes[7] = randomA & 0xff;
  bytes[8] = 0x80 | (randomBytes[2] & 0x3f);
  bytes.set(randomBytes.slice(3), 9);

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUuidV7(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
