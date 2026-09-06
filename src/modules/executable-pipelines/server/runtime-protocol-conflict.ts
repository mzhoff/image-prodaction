/** Database guard also protects unchanged v1 callers during a protocol cutover. */
export function isRuntimeProtocolConflict(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== 'object') return false;
    const record = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (record.code === '23514' && record.constraint === 'runtime_protocol_idempotency_collision') return true;
    current = record.cause;
  }
  return false;
}
