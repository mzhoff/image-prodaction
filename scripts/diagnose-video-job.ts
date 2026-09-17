/** Explicit, auditable, one-shot provider probe. Defaults to read-only; never retries a POST. */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, getPostgresPool } from '@/shared/db/client';
import { generationJob } from '@/shared/db/schema/generation';
import { createGenerationJob, startGenerationJob, getGenerationJob } from '@/entities/generation/server/generation-orchestrator';
import { getGenerationExecutionRecord } from '@/modules/generation/server/generation-execution-repository';
import { createGenerationPayloadStore } from '@/modules/generation/server/generation-payload-store';
import { createVideoGenerationExecutor } from '@/modules/generation/server/video-generation-executor';
import { createOpenRouterVideoAdapter } from '@/modules/provider-connections/adapters/openrouter-video-adapter';
import { GenerationWorker, createGenerationWorkerQueue } from '@/modules/generation/server/generation-worker';
import { uploadImageAsset } from '@/entities/asset/server/asset-upload-service';
import type { QueuedVideoPayload } from '@/modules/generation/server/video-generation-input';

async function main() {
  const [sourceId, variant, execute] = process.argv.slice(2);
  if (!sourceId || !['original', 'neutral', 'silent'].includes(variant)) throw new Error('Usage: diagnose-video-job.ts SOURCE_JOB original|neutral|silent [--execute-paid-test]');
  const source = await getGenerationExecutionRecord(sourceId);
  if (source.operation !== 'generate_video' || !source.requestObjectKey || !source.createdByUserId) throw new Error('Expected an accessible saved video request.');
  const store = createGenerationPayloadStore();
  const payload = await store.read<QueuedVideoPayload>(source.requestObjectKey);
  if (payload.request.duration > 5 || payload.request.resolution !== '480p') throw new Error('Probe is limited to 5 seconds at 480p.');
  const idempotencyKey = `diagnose-video:${sourceId}:${variant}:v1`;
  const [existing] = await getDb().select({ id: generationJob.id, status: generationJob.status }).from(generationJob)
    .where(eq(generationJob.idempotencyKey, idempotencyKey));
  if (existing || execute !== '--execute-paid-test') {
    console.log(JSON.stringify({ existing, model: payload.request.model, duration: payload.request.duration,
      variant, willSubmit: false })); return;
  }
  if (variant === 'neutral') {
    // Geometric transport fixture, deliberately unrelated to the original portrait/prompt.
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="854"><rect width="480" height="854" fill="#f0ebe2"/><ellipse cx="183" cy="570" rx="95" ry="16" fill="#c9c3b8"/><circle cx="180" cy="473" r="85" fill="#147ec2"/><rect x="294" y="460" width="92" height="110" rx="10" fill="#ef924b"/></svg>';
    const frame = await uploadImageAsset({ bytes: await sharp(Buffer.from(svg)).png().toBuffer(), claimedContentType: 'image/png',
      maxBytes: 1024 * 1024, userId: source.createdByUserId, workspaceId: source.workspaceId, documentId: source.documentId,
      originalName: 'video-transport-diagnostic.png', origin: 'unknown', libraryVisible: false, metadata: { diagnostic: true } });
    payload.request = { ...payload.request, mode: 'frames', firstFrame: { assetId: frame.id, description: '' }, lastFrame: undefined,
      references: [], prompt: 'A blue sphere gently rolls beside an orange block on a warm white studio floor. Smooth motion, static camera, soft light. No people or text.' };
  }
  if (variant === 'silent') payload.request = { ...payload.request, generateAudio: false };
  const metadata = { modelKey: payload.request.model, mode: payload.request.mode,
    requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex'), diagnosticSourceJobId: sourceId, diagnosticVariant: variant };
  const job = await createGenerationJob({ userId: source.createdByUserId, workspaceId: source.workspaceId, documentId: source.documentId,
    operation: source.operation, provider: source.provider, modelId: source.modelId, maxAttempts: 3, idempotencyKey, metadata });
  if (job.idempotentReplay) { console.log(JSON.stringify({ jobId: job.id, replay: true })); return; }
  console.log(JSON.stringify({ diagnosticJobId: job.id, variant }));
  const key = await store.write({ workspaceId: source.workspaceId, jobId: job.id, kind: 'request', payload });
  await getDb().update(generationJob).set({ requestObjectKey: key }).where(eq(generationJob.id, job.id));
  const adapter = createOpenRouterVideoAdapter(async (url, options) => {
    const response = await fetch(url, options);
    if (options?.method === 'POST') console.log(JSON.stringify({ submitHttpStatus: response.status }));
    return response;
  });
  let claimed = false;
  const queue = { ...createGenerationWorkerQueue(), claimNext: async () => {
    if (claimed) return null;
    claimed = true;
    // Keep out of the shared queue until the diagnostic runner holds the lease.
    const started = await startGenerationJob(job.id);
    await getDb().update(generationJob).set({ enqueuedAt: new Date() }).where(eq(generationJob.id, job.id));
    return started;
  } };
  await new GenerationWorker({ executor: createVideoGenerationExecutor({ adapter }), queue,
    onEvent: (event) => console.log(JSON.stringify(event)) }).runOnce();
  const result = await getGenerationJob(source.createdByUserId, job.id);
  console.log(JSON.stringify({ status: result.status, error: result.error, usage: result.usage, assetId: result.finalAssetId }));
}

try { await main(); } finally { await getPostgresPool().end(); }
