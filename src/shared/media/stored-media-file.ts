import { join } from 'node:path';
import { createMediaWorkspace, streamMediaFile } from './media-source';
import { AudioProcessingError } from './audio-contracts';

export async function readStoredMediaFile(input: { body: ReadableStream; byteSize: number; checksumSha256: string; maxBytes: number; signal?: AbortSignal }) {
  let workspace: Awaited<ReturnType<typeof createMediaWorkspace>> | undefined;
  try {
    if (input.byteSize < 1 || input.byteSize > input.maxBytes) throw new AudioProcessingError('file_too_large', 'Исходник превышает лимит обработки.', 413);
    workspace = await createMediaWorkspace(input.byteSize);
    const signal = AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(10 * 60_000)]);
    const bytes = await streamMediaFile(input.body, join(workspace.directory, 'source'), input.byteSize, signal);
    if (bytes.byteLength !== input.byteSize || bytes.checksumSha256 !== input.checksumSha256) throw new AudioProcessingError('media_checksum_mismatch', 'Контрольная сумма исходника не совпадает.');
    return { bytes, dispose: workspace.dispose };
  } catch (error) {
    await input.body.cancel().catch(() => undefined); await workspace?.dispose(); throw error;
  }
}
