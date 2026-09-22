/** Upload transfer finishes before durable inspection; callers keep their existing asset contract. */
export async function awaitAssetUpload(response: Response, request: typeof fetch = fetch, signal?: AbortSignal): Promise<Response> {
  if (response.status !== 202) return response;
  const accepted = await response.json();
  const id = accepted?.job?.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Не получен номер обработки файла.');
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const current = await request(`/api/generation-jobs/${id}`, { credentials: 'same-origin', signal, cache: 'no-store' });
    if (!current.ok) return current;
    const payload = await current.json();
    if (payload.job?.status === 'succeeded' && payload.asset?.status === 'ready') return Response.json({ asset: payload.asset });
    if (payload.job?.status === 'canceled' || (payload.job?.status === 'failed' && !payload.job?.error?.retryable)) {
      return Response.json({ error: { code: payload.job?.error?.code ?? 'upload_failed', message: payload.job?.error?.message ?? 'Не удалось обработать файл.' } }, { status: 422 });
    }
    await new Promise<void>((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(done, 1000);
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error(`Обработка продолжается в фоне. Готовый файл появится в библиотеке. Задача: ${id}`);
}
