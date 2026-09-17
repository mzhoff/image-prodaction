export class JsonRequestError extends Error {
  readonly code: 'generation_request_too_large' | 'invalid_json';
  readonly status: 400 | 413;
  constructor(code: JsonRequestError['code'], message: string, status: 400 | 413) {
    super(message);
    this.name = 'JsonRequestError';
    this.code = code;
    this.status = status;
  }
}

/** Bound real bytes, including chunked bodies and incorrect/missing length headers. */
export async function readBoundedJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const tooLarge = () => new JsonRequestError('generation_request_too_large',
    `Запрос с изображениями превышает лимит приложения ${(maxBytes / 1024 / 1024).toFixed(0)} МиБ. Уменьшите размер или число референсов. Запрос не отправлен в модель.`, 413);
  const invalid = () => new JsonRequestError('invalid_json',
    'Не удалось прочитать запрос генерации: данные повреждены или переданы не полностью. Обновите страницу и повторите отправку.', 400);
  if (Number(request.headers.get('content-length')) > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > maxBytes) throw tooLarge();
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid();
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof JsonRequestError) throw error;
    throw invalid();
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
