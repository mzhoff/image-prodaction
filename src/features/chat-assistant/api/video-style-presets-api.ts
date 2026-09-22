import { z } from 'zod';
import { videoStylePresetSchema, type SaveVideoStylePreset } from '@/modules/video-style-presets/contracts/video-style-preset';

const endpoint = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/video-styles`;
export async function loadVideoStylePresets(workspaceId: string, signal: AbortSignal) {
  const response = await fetch(endpoint(workspaceId), { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error' });
  const body = await readResponse(response);
  return z.object({ presets: z.array(videoStylePresetSchema) }).parse(body).presets;
}
export async function saveVideoStyle(workspaceId: string, id: string, fields: SaveVideoStylePreset) {
  const response = await fetch(`${endpoint(workspaceId)}/${encodeURIComponent(id)}`, {
    method: 'PUT', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields),
  });
  return z.object({ preset: videoStylePresetSchema }).parse(await readResponse(response)).preset;
}
export async function deleteVideoStyle(workspaceId: string, id: string, expectedRevision: number) {
  const response = await fetch(`${endpoint(workspaceId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision }),
  });
  if (!response.ok) await readResponse(response);
}
async function readResponse(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(response.status === 401 ? 'Войдите снова, чтобы открыть стили.'
    : response.status === 403 ? 'Нет доступа к стилям этого пространства.'
      : response.status === 409 || response.status === 422 ? body?.error?.message ?? 'Обновите список и повторите.'
        : 'Не удалось открыть Library. Проверьте подключение и повторите.');
  if (!body) throw new Error('Не удалось прочитать ответ. Повторите попытку.');
  return body;
}
