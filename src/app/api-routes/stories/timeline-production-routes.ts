import { z } from 'zod';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { createTimelineProduction, exportTimelineDocument, importTimelineDocument } from '@/modules/story-projects/server/timeline-production-service';
import { submitMontageJob, readMontageJob, readMontageInternal, cancelMontageJob, applyMontageJob } from '@/modules/generation/server/montage-job-service';
import { montageJobRequestSchema } from '@/modules/story-projects/contracts/timeline-production';
import { StoryError } from '@/modules/story-projects/server/story-service';
import { getAssetContent } from '@/entities/asset/server/asset-service';
import { readAuthServerConfig } from '@/shared/auth/config';
import { isUuid } from '@/shared/lib/id';
import { readBoundedJsonObject, JsonRequestError } from '@/shared/api/read-bounded-json';
import { apiError } from '@/shared/api/api-error';
import { toApiErrorResponse } from '../error-response';
import { toAssetApiErrorResponse } from '../assets/error-response';

type Address = { timelineId?: string; jobId?: string; action: 'create' | 'otio' | 'jobs' | 'job' | 'apply' | 'download' };
const defaults = { session: requireApiSession, origins: () => readAuthServerConfig().trustedOrigins,
  create: createTimelineProduction, exportOtio: exportTimelineDocument, importOtio: importTimelineDocument,
  submit: submitMontageJob, read: readMontageJob, cancel: cancelMontageJob, apply: applyMontageJob,
  readInternal: readMontageInternal, content: getAssetContent };

export async function timelineProductionRequest(request: Request, address: Address, overrides: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...overrides };
  try {
    const methods = { create: ['POST'], otio: ['GET', 'POST'], jobs: ['POST'], job: ['GET', 'DELETE'], apply: ['POST'], download: ['GET'] };
    if (!methods[address.action].includes(request.method)) return apiError('method_not_allowed', 'Метод не поддерживается.', 405);
    if (request.method !== 'GET' && !deps.origins().includes(request.headers.get('origin') ?? '')) return apiError('invalid_origin', 'Недопустимый источник запроса.', 403);
    const { user } = await deps.session(request);
    if ((address.action !== 'create' && !isUuid(address.timelineId ?? ''))
      || (['job', 'apply', 'download'].includes(address.action) && !isUuid(address.jobId ?? ''))) return apiError('invalid_address', 'Неверный адрес монтажа.', 400);
    const id = address.timelineId!, jobId = address.jobId!;
    if (address.action === 'download') {
      const { job, result } = await deps.readInternal(user.id, id, jobId);
      if (job.status !== 'succeeded' || result?.kind !== 'render' || job.cancelRequestedAt) throw new StoryError('Видео ещё не готово.', 409, 'montage_not_ready');
      const media = await deps.content(user.id, result.assetId, undefined, undefined, request.headers.get('range') ?? undefined);
      if (media.asset.workspaceId !== job.workspaceId || media.asset.generationJobId !== job.id || media.asset.mediaKind !== 'video') throw new StoryError('Видео недоступно.', 404, 'montage_result_not_found');
      const headers = new Headers({ 'Content-Type': media.contentType, 'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="timeline-${id}.mp4"`, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
      headers.set('Content-Length', String(media.range ? media.range.end - media.range.start + 1 : media.byteSize));
      if (media.range) headers.set('Content-Range', `bytes ${media.range.start}-${media.range.end}/${media.byteSize}`);
      return new Response(media.object.body, { status: media.range ? 206 : 200, headers });
    }
    if (request.method === 'GET' && address.action === 'otio') return new Response(JSON.stringify(await deps.exportOtio(user.id, id), null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'Content-Disposition': `attachment; filename="timeline-${id}.otio"` },
    });
    if (request.method === 'GET') return json(await deps.read(user.id, id, jobId));
    if (request.method === 'DELETE') return json(await deps.cancel(user.id, id, jobId));
    const body = await readBoundedJsonObject(request, 2 * 1024 * 1024);
    if (address.action === 'create') return json(await deps.create(user.id, body), 201);
    if (address.action === 'otio') return json({ timeline: await deps.importOtio(user.id, id, body) });
    if (address.action === 'apply') {
      const { expectedRevision } = z.object({ expectedRevision: z.number().int().min(0) }).strict().parse(body);
      return json({ timeline: await deps.apply(user.id, id, jobId, expectedRevision) });
    }
    return json(await deps.submit(user.id, id, montageJobRequestSchema.parse(body)), 202);
  } catch (error) {
    if (error instanceof StoryError) return apiError(error.code, error.message, error.status);
    if (error instanceof z.ZodError) return apiError('invalid_timeline_request', error.issues[0]?.message ?? 'Проверьте параметры.', 422);
    if (error instanceof JsonRequestError) return apiError('invalid_request', 'JSON не должен превышать 2 МиБ.', error.status);
    if (address.action === 'download') return toAssetApiErrorResponse(error);
    return toApiErrorResponse(error);
  }
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } }); }
