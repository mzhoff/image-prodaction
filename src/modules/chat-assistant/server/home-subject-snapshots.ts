import { readBoundedAudioStream } from '@/shared/media/audio-upload-request';
import type { ChatPrincipal } from '@prodactionpro/chat-server-core';
import type { getSubjectProfile } from '@/entities/production-graph/server/subject-profile-service';
import { getAssetContent, getAssetMetadata } from '@/entities/asset/server/asset-service';
import type { QueuedGenerateImagePayload } from '@/modules/generation/server/image-generation-contracts';
import type { HomeSubjectSnapshot } from '../contracts/home-image-settings';

interface SubjectDependencies {
  profile: typeof getSubjectProfile;
  asset: typeof getAssetMetadata;
  content: typeof getAssetContent;
}
const defaults: SubjectDependencies = {
  profile: async (...args) => (await import('@/entities/production-graph/server/subject-profile-service')).getSubjectProfile(...args),
  asset: getAssetMetadata, content: getAssetContent,
};

export async function snapshotHomeSubjects(principal: ChatPrincipal, subjectIds: string[], dependencies = defaults) {
  if (!principal.tenantId) throw new Error('Выберите рабочее пространство.');
  if (subjectIds.length > 3) throw new Error('Можно выбрать не более трёх героев.');
  const snapshots: HomeSubjectSnapshot[] = [];
  for (const id of [...new Set(subjectIds)]) {
    const profile = await dependencies.profile(principal.userId, principal.tenantId, id);
    if (profile.workspaceId !== principal.tenantId) throw new Error('Герой недоступен в этом Workspace.');
    if (profile.passportText.length > 20_000) throw new Error(`Сократите описание героя «${profile.name}» до 20 000 символов.`);
    const snapshot: HomeSubjectSnapshot = { id, name: profile.name, revision: profile.revision, passportText: profile.passportText };
    const primaryId = profile.imageAssetIds[0];
    if (primaryId) {
      const asset = await dependencies.asset(principal.userId, primaryId);
      assertSubjectImage(asset, principal.tenantId);
      snapshot.reference = { assetId: asset.id, checksumSha256: asset.checksumSha256, contentType: asset.contentType };
    }
    snapshots.push(snapshot);
  }
  return snapshots;
}

export async function loadHomeSubjectImages(principal: ChatPrincipal, subjects: HomeSubjectSnapshot[], dependencies = defaults) {
  if (!principal.tenantId) throw new Error('Выберите рабочее пространство.');
  const references: QueuedGenerateImagePayload['referenceImages'] = [];
  for (const subject of subjects) {
    // Recheck current access; preserve the pinned passport and original asset choice.
    const current = await dependencies.profile(principal.userId, principal.tenantId, subject.id);
    if (current.workspaceId !== principal.tenantId) throw new Error('Герой больше недоступен в этом Workspace.');
    if (!subject.reference) continue;
    const content = await dependencies.content(principal.userId, subject.reference.assetId);
    assertSubjectImage(content.asset, principal.tenantId);
    if (content.asset.checksumSha256 !== subject.reference.checksumSha256
      || content.contentType !== subject.reference.contentType) throw new Error('Основное фото героя изменилось. Выберите героя заново.');
    const bytes = await readBoundedAudioStream(content.object.body, 8 * 1024 * 1024);
    if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Основное фото героя больше 8 МБ. Обновите его в Library.');
    references.push({ dataUrl: `data:${content.contentType};base64,${Buffer.from(bytes).toString('base64')}`,
      sourceAssetId: subject.reference.assetId, sourceNodeTypes: ['subjectBuilder'], slots: ['actors'] });
  }
  return references;
}

function assertSubjectImage(asset: Awaited<ReturnType<typeof getAssetMetadata>>, workspaceId: string) {
  if (asset.workspaceId !== workspaceId || asset.status !== 'ready' || asset.mediaKind !== 'image'
    || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.contentType)) {
    throw new Error('Основное фото героя недоступно. Обновите его в Library.');
  }
  if (asset.byteSize > 8 * 1024 * 1024) throw new Error('Основное фото героя больше 8 МБ. Обновите его в Library.');
}
