import { createStore } from 'zustand/vanilla';
import type { AssetRecord } from '@/entities/production-graph/model/types';

export interface CanvasImportProgress {
  phase: 'preparing' | 'converting' | 'uploading' | 'adding' | 'done';
  total: number;
  completed: number;
  failed: number;
  imagesOnly: boolean;
  fileName?: string;
  lastError?: string;
  elapsedMs?: number;
}

// Only the status card subscribes; progress does not rerender the whole canvas.
export const createCanvasImportProgress = () => createStore<{ progress: CanvasImportProgress | null }>(() => ({ progress: null }));
export type CanvasImportProgressStore = ReturnType<typeof createCanvasImportProgress>;

export async function collectCanvasImports(options: {
  files: readonly File[];
  save: (file: File, onStage: (phase: 'converting' | 'uploading') => void) => Promise<AssetRecord>;
  isCurrent: () => boolean;
  update: (progress: Partial<CanvasImportProgress>) => void;
}) {
  const assets: Array<{ asset: AssetRecord; index: number }> = [];
  let failed = 0;
  const startedAt = Date.now();
  for (const [index, file] of options.files.entries()) {
    if (!options.isCurrent()) return null;
    options.update({ phase: 'preparing', fileName: file.name });
    // Let the first status paint before loading the HEIC decoder or the next file.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!options.isCurrent()) return null;
    try {
      const asset = await options.save(file, (phase) => {
        if (options.isCurrent()) options.update({ phase });
      });
      if (!options.isCurrent()) return null;
      assets.push({ asset, index });
    } catch (error) {
      if (!options.isCurrent()) return null;
      failed++;
      options.update({ lastError: `${file.name}: ${error instanceof Error ? error.message : 'Не удалось загрузить файл.'}` });
    }
    options.update({ completed: assets.length, failed, elapsedMs: Date.now() - startedAt });
  }
  return assets;
}
