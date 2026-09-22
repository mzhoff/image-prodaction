import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';

const require = createRequire(import.meta.url);
export const HEIC_REFERENCE_MAX_BYTES = 8 * 1024 * 1024;
let running = 0;

/** Decode outside the request thread; discard metadata and keep a bounded reference image. */
export async function convertHeicReference(bytes: Uint8Array, signal?: AbortSignal): Promise<Buffer> {
  if (!bytes.length || bytes.length > HEIC_REFERENCE_MAX_BYTES) throw new Error('Файл должен быть не больше 8 МБ.');
  if (Buffer.from(bytes.subarray(4, 12)).toString('ascii').slice(0, 4) !== 'ftyp') throw new Error('Это не HEIC/HEIF изображение.');
  if (running >= 2) throw new Error('Обрабатываем другие изображения. Повторите загрузку через несколько секунд.');
  signal?.throwIfAborted(); running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const worker = new Worker(HEIC_WORKER, { eval: true, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 512 },
        workerData: { bytes, heif: require.resolve('libheif-js/wasm-bundle'), sharp: require.resolve('sharp') } });
      let settled = false;
      const finish = (error?: Error, result?: Uint8Array) => {
        if (settled) return; settled = true;
        clearTimeout(timer); signal?.removeEventListener('abort', abort); void worker.terminate();
        if (error) reject(error); else resolve(Buffer.from(result!));
      };
      const abort = () => finish(new Error('Загрузка отменена.'));
      const timer = setTimeout(() => finish(new Error('Обработка заняла слишком много времени. Попробуйте JPEG или PNG.')), 30_000);
      signal?.addEventListener('abort', abort, { once: true });
      worker.once('message', (result) => finish(result.error ? new Error(result.error) : undefined, result.bytes));
      worker.once('error', () => finish(new Error('Не удалось обработать HEIC. Попробуйте другой файл.')));
      worker.once('exit', (code) => { if (code) finish(new Error('Обработка изображения прервана. Повторите загрузку.')); });
    });
  } finally { running--; }
}

const HEIC_WORKER = `
const { workerData, parentPort } = require('node:worker_threads');
(async () => {
  const lib = require(workerData.heif);
  const images = new lib.HeifDecoder().decode(workerData.bytes);
  try {
    const image = images.find(item => item.is_primary?.()) || images[0];
    if (!image) throw Error('В HEIC нет изображения.');
    const width = image.get_width(), height = image.get_height();
    if (width < 1 || height < 1 || width * height > 60_000_000) throw Error('Изображение слишком большое: максимум 60 мегапикселей.');
    const raw = await new Promise((resolve, reject) => image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, result => result ? resolve(result.data) : reject(Error('Не удалось прочитать HEIC.'))));
    const bytes = await require(workerData.sharp)(Buffer.from(raw), { raw: { width, height, channels: 4 } }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    parentPort.postMessage({ bytes });
  } finally { for (const image of images) image.free(); }
})().catch(() => parentPort.postMessage({ error: 'Не удалось прочитать HEIC. Проверьте файл или сохраните его в JPEG.' }));
`;
