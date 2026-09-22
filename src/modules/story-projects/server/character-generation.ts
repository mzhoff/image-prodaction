import { createHash } from 'node:crypto';
import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import type { z } from 'zod';
import { getAssetContent } from '@/entities/asset/server/asset-service';
import { resolveOpenRouterCredential } from '@/modules/provider-connections/server/provider-connection-service';
import { openRouterImageCatalog } from '@/modules/provider-connections/adapters/openrouter-image-catalog';
import { submitGenerationJob, toPublicGenerationJob } from '@/modules/generation/server/generation-submission-service';
import type { QueuedGenerateImagePayload } from '@/modules/generation/server/image-generation-contracts';
import { characterGenerationSchema } from '../contracts/story-character';
import { characterGenerationPrompt } from '../core/character-passport';
import { getStory, StoryError } from './story-service';
import { characterGenerationRows } from './character-generation-repository';

const defaults = { story: getStory, credential: resolveOpenRouterCredential,
  model: (...args: Parameters<typeof openRouterImageCatalog.resolve>) => openRouterImageCatalog.resolve(...args),
  submit: submitGenerationJob, content: getAssetContent, history: characterGenerationRows };

export async function generateStoryCharacter(userId: string, storyId: string, input: z.infer<typeof characterGenerationSchema>, dependencies = defaults) {
  const request = characterGenerationSchema.parse(input);
  const story = await dependencies.story(userId, storyId);
  const character = story.snapshot.characters?.find((item) => item.id === request.characterId);
  if (!character) throw new StoryError('Герой не найден.', 404, 'character_not_found');
  const idempotencyKey = `story-character:${storyId}:${character.id}:${request.attemptId}`;
  const history = await dependencies.history(story.workspaceId, storyId);
  const existing = history.find((job) => job.idempotencyKey === idempotencyKey);
  // Once queued, a transport retry returns that operation even if the passport has since changed.
  if (existing && (existing.enqueuedAt || existing.status !== 'queued')) {
    return { id: existing.id, status: existing.status, finalAssetId: existing.finalAssetId };
  }
  if (story.revision !== request.expectedRevision) throw new StoryError('Сохраните актуальный паспорт перед генерацией.', 409, 'revision_conflict');
  const otherPending = history.find((job) => job.metadata?.characterId === character.id && job.idempotencyKey !== idempotencyKey
    && (job.status === 'queued' || job.status === 'running'));
  if (otherPending) throw new StoryError('Образ уже создаётся. Дождитесь результата.', 409, 'character_generation_pending');
  await dependencies.credential(userId, story.workspaceId);
  const referenceImages: QueuedGenerateImagePayload['referenceImages'] = [];
  const referenceId = character.selectedReference?.assetId ?? character.references[0];
  if (referenceId) {
    const source = await dependencies.content(userId, referenceId);
    if (source.asset.workspaceId !== story.workspaceId || source.asset.status !== 'ready' || source.asset.mediaKind !== 'image'
      || !['image/jpeg', 'image/png', 'image/webp'].includes(source.contentType) || source.asset.byteSize > 8 * 1024 * 1024) {
      throw new StoryError('Референс недоступен или слишком большой. Выберите JPG, PNG или WebP до 8 МБ.', 422, 'invalid_character_reference');
    }
    const bytes = await readBoundedAudioStream(source.object.body, 8 * 1024 * 1024);
    if (bytes.byteLength > 8 * 1024 * 1024) throw new StoryError('Референс больше 8 МБ.', 422, 'invalid_character_reference');
    referenceImages.push({ dataUrl: `data:${source.contentType};base64,${Buffer.from(bytes).toString('base64')}`, sourceAssetId: referenceId, slots: ['actors'] });
  }
  await dependencies.model(request.model, { aspectRatio: '1:1', size: '1K' }, referenceImages.length);
  const payload: QueuedGenerateImagePayload = {
    documentId: null, storyCharacter: { storyId, characterId: character.id, revision: character.revision }, workspaceId: story.workspaceId,
    model: request.model, prompt: characterGenerationPrompt(character.passport, story.snapshot.blueprint.visualStyle),
    aspectRatio: '1:1', size: '1K', subjectInputs: [], locationInputs: [], referenceImages,
    inputs: { actors: [], actions: [], composition: [], camera: [], background: [], style: [], light: [], color: [], metaphor: [], text: [] },
  };
  const job = await dependencies.submit({ userId, workspaceId: story.workspaceId, documentId: null,
    provider: 'openrouter', modelId: request.model, operation: 'generate_image', idempotencyKey, maxAttempts: 3, payload,
    metadata: { source: 'story-character', storyId, characterId: character.id, characterRevision: character.revision,
      visualStyle: story.snapshot.blueprint.visualStyle, requestHash: createHash('sha256').update(JSON.stringify(payload)).digest('hex') },
  });
  return toPublicGenerationJob(job);
}
