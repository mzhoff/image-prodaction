import type { AssetRecord } from '../model/types';
import { readImageSize } from '@/shared/lib/file-to-image-size';
import { createId } from '@/shared/lib/id';

const DB_NAME = 'reverie-image-production-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

interface StoredAssetBlob {
  key: string;
  blob: Blob;
}

interface SaveAssetBlobOptions {
  kind?: AssetRecord['kind'];
  name?: string;
  mimeType?: string;
}

function openAssetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withAssetStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openAssetDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = run(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function saveAssetBlob(blob: Blob, options: SaveAssetBlobOptions = {}): Promise<AssetRecord> {
  const kind = options.kind ?? inferAssetKind(options.mimeType ?? blob.type);
  const name = options.name ?? (blob instanceof File ? blob.name : `${kind}-${Date.now()}`);
  const mimeType = options.mimeType || blob.type || defaultMimeType(kind);
  const assetId = createId('asset');
  const blobKey = `${assetId}:${name}`;
  const file = blob instanceof File && blob.name === name && blob.type === mimeType
    ? blob
    : new File([blob], name, { type: mimeType });
  const dimensions = kind === 'image' ? await readImageSize(file).catch(() => undefined) : undefined;

  await withAssetStore('readwrite', (store) => store.put({ key: blobKey, blob: file } satisfies StoredAssetBlob));

  return {
    id: assetId,
    kind,
    name,
    mimeType,
    width: dimensions?.width,
    height: dimensions?.height,
    createdAt: new Date().toISOString(),
    storage: {
      type: 'indexeddb',
      blobKey,
    },
  };
}

export async function saveImageAsset(file: File): Promise<AssetRecord> {
  return saveAssetBlob(file, {
    kind: 'image',
    name: file.name,
    mimeType: file.type || 'image/png',
  });
}

export async function loadAssetBlobByKey(blobKey: string) {
  const record = await withAssetStore<StoredAssetBlob | undefined>('readonly', (store) => store.get(blobKey));
  return record?.blob ?? null;
}

export async function loadAssetBlob(asset: AssetRecord) {
  return loadAssetBlobByKey(asset.storage.blobKey);
}

export async function deleteAssetBlob(asset: AssetRecord) {
  await withAssetStore('readwrite', (store) => store.delete(asset.storage.blobKey));
}

function inferAssetKind(mimeType?: string): AssetRecord['kind'] {
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'image';
}

function defaultMimeType(kind: AssetRecord['kind']) {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'audio') return 'audio/mpeg';
  return 'image/png';
}
