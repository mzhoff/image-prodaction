/** XHR exposes real upload progress; the response then enters the usual durable processing flow. */
export function uploadWithProgress(url: string, body: FormData, onProgress: (percent: number) => void, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    xhr.open('POST', url); xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => { cleanup(); resolve(new Response(xhr.responseText, { status: xhr.status, headers: { 'Content-Type': xhr.getResponseHeader('Content-Type') ?? 'application/json' } })); };
    xhr.onerror = () => { cleanup(); reject(new Error('Не удалось загрузить файл. Проверьте подключение.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Загрузка отменена.', 'AbortError')); };
    signal?.addEventListener('abort', abort, { once: true }); xhr.send(body);
  });
}
