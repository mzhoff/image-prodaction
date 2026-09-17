import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetRecord } from '@/entities/production-graph/model/types';
import { collectCanvasImports, type CanvasImportProgress } from './canvas-import-progress';

const asset = (name: string): AssetRecord => ({ id: name, kind: 'image', name, mimeType: 'image/jpeg',
  createdAt: '2026-09-10T00:00:00Z', storage: { type: 'remote', assetId: name } });

test('42-file import reports conversion and completed files, bounds concurrency, and retains successes after a failure', async () => {
  const files = Array.from({ length: 42 }, (_, i) => new File(['fixture'], `IMG_${i}.HEIC`));
  const updates: Partial<CanvasImportProgress>[] = [];
  let inFlight = 0;
  const result = await collectCanvasImports({ files, isCurrent: () => true, update: (state) => updates.push(state),
    save: async (file, onStage) => {
      assert.equal(++inFlight, 1);
      onStage('converting');
      await new Promise((resolve) => setTimeout(resolve, 0));
      onStage('uploading');
      inFlight--;
      if (file.name === 'IMG_8.HEIC') throw new Error('Broken HEIC');
      return asset(file.name);
    },
  });
  assert.equal(result?.length, 41);
  assert.deepEqual(result?.at(-1), { asset: asset('IMG_41.HEIC'), index: 41 });
  assert.equal(updates.at(-1)?.completed, 41);
  assert.equal(updates.at(-1)?.failed, 1);
  assert.ok((updates.at(-1)?.elapsedMs ?? -1) >= 0);
  assert.equal(updates.filter((state) => state.phase === 'converting').length, 42);
  assert.deepEqual(updates.find((state) => state.lastError), { lastError: 'IMG_8.HEIC: Broken HEIC' });
});

test('switching document during conversion stops the batch and never returns assets to the new canvas', async () => {
  let current = true;
  let saves = 0;
  const updates: Partial<CanvasImportProgress>[] = [];
  const result = await collectCanvasImports({ files: [new File([''], 'a.heic'), new File([''], 'b.heic')],
    isCurrent: () => current, update: (state) => updates.push(state),
    save: async (file, onStage) => {
      saves++;
      current = false;
      onStage('uploading');
      return asset(file.name);
    },
  });
  assert.equal(result, null);
  assert.equal(saves, 1);
  assert.equal(updates.length, 1);
});
