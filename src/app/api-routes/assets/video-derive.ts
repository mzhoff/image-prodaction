import { z } from 'zod';
import { deriveWorkspaceVideoAsset } from '@/entities/asset/server/video-derivation-service';
import { requireWorkspaceMembership } from '@/entities/workspace/server/workspace-service';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { apiError } from '@/shared/api/api-error';
import { isUuidV7, isUuid } from '@/shared/lib/id';
import { readAuthServerConfig } from '@/shared/auth/config';
import { AudioProcessingError } from '@/shared/media/audio-contracts';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import { VideoProcessingError, videoDeriveOptionsSchema } from '@/shared/media/video-contracts';
import { toAssetApiErrorResponse } from './error-response';

// safeExtend retains the authoritative cross-field refinements, unlike spreading .shape.
const inputSchema = videoDeriveOptionsSchema.safeExtend({ workspaceId: z.string().refine(isUuid), assetId: z.string().refine(isUuidV7) });

export async function postDeriveVideo(request: Request) {
  try {
    const origin = request.headers.get('origin');
    if (!origin || !readAuthServerConfig().trustedOrigins.includes(origin)) return apiError('invalid_origin', 'The request origin is not trusted.', 403);
    const session = await requireApiSession(request);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return apiError('invalid_content_type', 'JSON is required.', 415);
    if (!request.body) return apiError('invalid_request', 'A request body is required.', 400);
    const input = inputSchema.parse(JSON.parse(Buffer.from(await readBoundedAudioStream(request.body, 8192, request.signal)).toString('utf8')));
    await requireWorkspaceMembership(session.user.id, input.workspaceId);
    const asset = await deriveWorkspaceVideoAsset({ ...input, userId: session.user.id, signal: request.signal });
    return Response.json({ asset }, { headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return apiError('invalid_video_request', 'Video extraction settings are invalid.', 400);
    if (error instanceof VideoProcessingError || error instanceof AudioProcessingError) return apiError(error.code, error.message, error.status);
    return toAssetApiErrorResponse(error);
  }
}
