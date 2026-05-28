import type { AssetRecord } from '@/entities/production-graph/model/types';
import { readImageSize } from './file-to-image-size';
import { createId } from './id';

const DB_NAME = 'reverie-image-production-assets';
const DB_VERSION = 1;
const STORE_NAME = 'assets';

interface StoredAssetBlob {
  key: string;
  blob: Blob;
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

export async function saveImageAsset(file: File): Promise<AssetRecord> {
  const assetId = createId('asset');
  const blobKey = `${assetId}:${file.name}`;
  const dimensions = await readImageSize(file).catch(() => undefined);

  await withAssetStore('readwrite', (store) => store.put({ key: blobKey, blob: file } satisfies StoredAssetBlob));

  return {
    id: assetId,
    kind: 'image',
    name: file.name,
    mimeType: file.type || 'image/png',
    width: dimensions?.width,
    height: dimensions?.height,
    createdAt: new Date().toISOString(),
    storage: {
      type: 'indexeddb',
      blobKey,
    },
  };
}

export async function loadAssetBlob(asset: AssetRecord) {
  const record = await withAssetStore<StoredAssetBlob | undefined>('readonly', (store) => store.get(asset.storage.blobKey));
  return record?.blob ?? null;
}

export async function deleteAssetBlob(asset: AssetRecord) {
  await withAssetStore('readwrite', (store) => store.delete(asset.storage.blobKey));
}
