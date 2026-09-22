import type { AssetObjectStore, AssetObjectLocation } from '@/shared/storage/s3-assets';
import type { MediaSource } from '@/shared/media/media-source';

export async function putMediaObject(store: AssetObjectStore, location: AssetObjectLocation | { bucket: string; storageKey: string }, source: MediaSource, contentType: string, signal?: AbortSignal) {
  const target = { bucket: location.bucket, key: 'key' in location ? location.key : location.storageKey };
  signal?.throwIfAborted();
  if (source instanceof Uint8Array) return store.put({ ...target, body: source, contentType });
  if (!store.putFile) throw new Error('File streaming is unavailable in this object store.');
  return store.putFile({ ...target, path: source.path, contentLength: source.byteLength, contentType, signal });
}
