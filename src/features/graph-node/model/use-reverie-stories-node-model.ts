'use client';
import { useTranslations } from '@/shared/i18n/use-translations';

import { validatePollDefinitionV1 } from '@prodaction/stories-platform-contracts/polls/1.0.0';
import { finalizeStoryDocumentDraftV1, validateStoryDocumentDraftV1, validateStoryDocumentV1, type StoryDocumentDraftV1 } from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import { createStoriesDraft, getStoriesCopy, orderStoriesLayers, setStoriesCopy, toStoriesDraft, type EditorMedia, type StoriesEditorAsset } from '@prodactionpro/ui-stories-editor';
import { useState } from 'react';
import { z } from 'zod';
import { getActiveAssetScope, getRemoteAssetContentUrl, type ActiveAssetScope } from '@/entities/production-graph/lib/remote-asset';
import { getFirstIncomingImageAsset, getFirstIncomingVideoAsset, getIncomingSources, getIncomingTextInputs } from '@/entities/production-graph/model/graph-io';
import { getPipelineFieldPortId } from '@/entities/production-graph/model/pipeline-contract-fields';
import type { AssetRecord, ProductionNode, ReverieStoriesNodeData, StructuredOutputNodeData } from '@/entities/production-graph/model/types';
import { useProductionGraphStore } from '@/entities/production-graph/model/use-production-graph-store';
import { applyStoriesAuthoringProfile, assertStoriesDraftFitsHost, type StoriesAuthoringProfileBundle } from '@/shared/contracts/stories-authoring-profile';
import { createId } from '@/shared/lib/id';
import { combineStoryDocuments } from '@/modules/executable-pipelines/core/stories-assembler';

const assetMetadataSchema = z.object({
  id: z.string(), workspaceId: z.string(), status: z.literal('ready'), originalName: z.string(),
  mediaKind: z.enum(['image', 'video', 'audio']), contentType: z.string(),
  byteSize: z.number().int().positive(), checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  width: z.number().int().positive().nullable(), height: z.number().int().positive().nullable(),
  video: z.object({ durationSeconds: z.number().positive(), codec: z.string() }).optional(),
});
type StoriesAssetMetadata = z.infer<typeof assetMetadataSchema>;

async function loadStoriesAssetMetadata(assetId: string, workspaceId: string, signal: AbortSignal) {
  const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) throw new Error('Не удалось прочитать файл для Stories. Проверьте доступ к библиотеке.');
  const payload: unknown = await response.json();
  const parsed = z.object({ asset: assetMetadataSchema }).safeParse(payload);
  if (!parsed.success || parsed.data.asset.workspaceId !== workspaceId) throw new Error('Файл недоступен в этом рабочем пространстве.');
  return parsed.data.asset;
}

function imageMedia(metadata: StoriesAssetMetadata): EditorMedia | undefined {
  if (metadata.mediaKind !== 'image' || !metadata.width || !metadata.height || !['image/webp', 'image/png', 'image/jpeg'].includes(metadata.contentType)) return undefined;
  return {
    id: metadata.id, kind: 'image', name: metadata.originalName, url: getRemoteAssetContentUrl(metadata.id),
    width: metadata.width, height: metadata.height, byteSize: metadata.byteSize,
    asset: { assetId: metadata.id, kind: 'image', mimeType: metadata.contentType as 'image/webp' | 'image/png' | 'image/jpeg', width: metadata.width, height: metadata.height, byteSize: metadata.byteSize, altText: metadata.originalName,
      source: { kind: 'productionArtifact', artifactId: metadata.id, producerKey: 'image-production', checksum: `sha256:${metadata.checksumSha256.toLowerCase()}` } },
  };
}

function collectDocumentAssets(document?: StoryDocumentDraftV1) {
  const assets: StoriesEditorAsset[] = [];
  if (document?.preview.cover) assets.push(document.preview.cover);
  for (const slide of document?.slides ?? []) {
    const asset = slide.background?.asset;
    if (!asset) continue;
    assets.push(asset);
    if (asset.kind === 'video') assets.push(asset.poster);
  }
  return assets;
}

export function useReverieStoriesNodeModel(node: ProductionNode) {
  const tUi = useTranslations();
  const data = node.data as ReverieStoriesNodeData;
  const edges = useProductionGraphStore((state) => state.edges);
  const nodes = useProductionGraphStore((state) => state.nodes);
  const assets = useProductionGraphStore((state) => state.assets);
  const updateNodeData = useProductionGraphStore((state) => state.updateNodeData);
  const [preparing, setPreparing] = useState(false);
  const [message, setMessage] = useState('');
  const context = { edges, nodes, assets };
  const incomingText = (port: string) => getIncomingTextInputs(node.id, port, context).map((input) => input.text).join('\n');
  const isConnected = (port: string) => getIncomingSources(node.id, port, context).length > 0;
  const hasInputs = edges.some((edge) => edge.targetNodeId === node.id);
  const connectedTitle = incomingText('title');
  const connectedSubtitle = incomingText('subtitle');
  const connectedText = incomingText('text');
  const image = getFirstIncomingImageAsset(node.id, 'image', context);
  const video = getFirstIncomingVideoAsset(node.id, 'video', context);
  const poster = getFirstIncomingImageAsset(node.id, 'poster', context);

  const incomingJson = (port: string): unknown => {
    const source = getIncomingSources(node.id, port, context)[0];
    if (!source) return undefined;
    if (source.sourceNode.type === 'reverieStories') return (source.sourceNode.data as ReverieStoriesNodeData).document;
    if (source.sourceNode.type !== 'structuredOutput') return undefined;
    const sourceData = source.sourceNode.data as StructuredOutputNodeData;
    if (source.sourcePortId === 'json') return sourceData.result;
    const field = sourceData.fields.find((candidate) => getPipelineFieldPortId(candidate.id) === source.sourcePortId);
    return field ? sourceData.result?.[field.key] : undefined;
  };

  async function prepareDocument(fromInputs = false): Promise<{ document: StoryDocumentDraftV1; media: EditorMedia[]; scope: ActiveAssetScope } | undefined> {
    if (preparing) return undefined;
    setPreparing(true); setMessage('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const scope = getActiveAssetScope();
      if (!scope) throw new Error(tUi("Откройте сохранённый документ, чтобы работать с файлами Stories."));
      let draft = data.document && !fromInputs ? toStoriesDraft(data.document) : undefined;
      if (data.storyMode === 'sequence' && !draft) {
        const ports = ['document', ...Array.from({ length: 11 }, (_, index) => `document-${index + 2}`)];
        const connectedPorts = ports.filter((port) => getIncomingSources(node.id, port, context).length);
        if (!connectedPorts.length) throw new Error(tUi("Подключите готовые слайды, чтобы посмотреть историю."));
        const documents = connectedPorts.map((port) => {
          const input = incomingJson(port);
          const strict = validateStoryDocumentV1(input);
          if (strict.valid) return strict.data;
          const editable = validateStoryDocumentDraftV1(input);
          if (editable.valid) {
            const finalized = finalizeStoryDocumentDraftV1(editable.data);
            if (finalized.valid) return finalized.data;
          }
          throw new Error(tUi("Предпросмотр появится, когда подключённые слайды будут готовы. Отредактируйте слайды или выполните Pipeline в Content Hub."));
        });
        draft = toStoriesDraft(combineStoryDocuments(documents, createId('story'), createId('revision')));
      }
      if (!draft) {
        const input = incomingJson('document');
        if (input !== undefined) {
          const strict = validateStoryDocumentV1(input);
          const editable = validateStoryDocumentDraftV1(input);
          if (strict.valid) draft = toStoriesDraft(strict.data);
          else if (editable.valid) draft = editable.data;
          else throw new Error(tUi("Подключённые слайды пока не готовы. Проверьте результат предыдущего шага."));
        }
      }
      if (!draft) {
        draft = createStoriesDraft(() => createId('story'));
        draft.locale = data.locale;
        draft.styleProfile = { profileId: data.styleProfileId, revisionId: data.styleRevisionId };
        draft.preview.title = (isConnected('title') ? connectedTitle : data.storyTitle);
        draft.preview.accessibilityLabel = draft.preview.title;
        const firstSlide = draft.slides[0];
        firstSlide.accessibilityLabel = draft.preview.title;
        draft = setStoriesCopy(draft, firstSlide.id, 'title', (isConnected('title') ? connectedTitle : data.storyTitle));
        draft = setStoriesCopy(draft, firstSlide.id, 'subtitle', (isConnected('subtitle') ? connectedSubtitle : data.subtitle));
        draft = setStoriesCopy(draft, firstSlide.id, 'text', (isConnected('text') ? connectedText : data.text));
        draft.slides[0].layers = orderStoriesLayers(draft.slides[0].layers.filter((layer) => !('text' in layer) || layer.text.trim()));
        const inputPoll = incomingJson('poll');
        if (inputPoll !== undefined) {
          const poll = validatePollDefinitionV1(inputPoll);
          if (!poll.valid) throw new Error(tUi("Проверьте вопрос и варианты ответа в подключённом опросе."));
          draft.slides[0].layers.push({ id: createId('poll-layer'), kind: 'poll', layout: { region: 'bottom', order: draft.slides[0].layers.length, alignment: 'start' }, definition: poll.data });
        }
      }
      const documentAssets = collectDocumentAssets(draft);
      if (documentAssets.some((asset) => asset.source.kind !== 'productionArtifact' || asset.source.producerKey !== 'image-production')) throw new Error(tUi("Для Image Production выберите файлы из своей библиотеки."));
      const remoteId = (asset: AssetRecord | undefined) => asset?.storage.type === 'remote' ? asset.storage.assetId : undefined;
      const ids = Array.from(new Set([
        ...documentAssets.filter((asset) => asset.source.kind === 'productionArtifact').map((asset) => asset.source.kind === 'productionArtifact' ? asset.source.artifactId : ''),
        ...assets.filter((asset) => asset.kind !== 'audio' && asset.storage.type === 'remote').map((asset) => asset.storage.type === 'remote' ? asset.storage.assetId : ''),
      ].filter(Boolean)));
      const metadata: StoriesAssetMetadata[] = [];
      const requiredIds = new Set(documentAssets.map((asset) => asset.source.kind === 'productionArtifact' ? asset.source.artifactId : asset.assetId));
      for (const asset of [video, image, poster]) if (remoteId(asset)) requiredIds.add(remoteId(asset)!);
      for (let index = 0; index < ids.length; index += 4) {
        const batch = ids.slice(index, index + 4);
        const results = await Promise.allSettled(batch.map((id) => loadStoriesAssetMetadata(id, scope.workspaceId, controller.signal)));
        results.forEach((result, offset) => {
          if (result.status === 'fulfilled') metadata.push(result.value);
          else if (requiredIds.has(batch[offset])) throw result.reason;
        });
      }
      const media = metadata.map(imageMedia).filter((item): item is EditorMedia => Boolean(item));
      for (const item of metadata.filter((entry) => entry.mediaKind === 'video')) {
        const previous = documentAssets.find((asset) => asset.kind === 'video' && asset.assetId === item.id);
        const posterId = previous?.kind === 'video' ? previous.poster.assetId : remoteId(poster);
        const posterMedia = media.find((entry) => entry.asset.assetId === posterId && entry.asset.kind === 'image');
        if (!posterMedia || posterMedia.asset.kind !== 'image' || item.contentType !== 'video/mp4' || item.video?.codec !== 'h264' || !item.width || !item.height || !item.video) continue;
        media.push({ id: item.id, kind: 'video', name: item.originalName, url: getRemoteAssetContentUrl(item.id), posterUrl: posterMedia.url, width: item.width, height: item.height, byteSize: item.byteSize,
          asset: { assetId: item.id, kind: 'video', mimeType: 'video/mp4', width: item.width, height: item.height, durationMs: Math.round(item.video.durationSeconds * 1000), byteSize: item.byteSize, altText: item.originalName, poster: posterMedia.asset,
            source: { kind: 'productionArtifact', artifactId: item.id, producerKey: 'image-production', checksum: `sha256:${item.checksumSha256.toLowerCase()}` } } });
      }
      if (data.storyMode !== 'sequence' && (fromInputs || !data.document)) {
        const background = video ?? image;
        if (background) {
          if (background.storage.type !== 'remote') throw new Error(tUi("Сохраните фон в библиотеку, чтобы его можно было доставить в приложение."));
          const selected = media.find((entry) => entry.id === remoteId(background));
          if (!selected) throw new Error(video ? tUi("Для видео нужен MP4 H.264 и подключённое изображение-постер.") : tUi("Выберите изображение WebP, PNG или JPEG."));
          if (!draft.slides[0]) throw new Error(tUi("Добавьте слайд перед выбором фона."));
          draft.slides[0].background = { asset: selected.asset, fit: 'cover', ...(selected.kind === 'video' ? { playback: { startMuted: true, loop: false, failure: 'posterManual' } as const } : {}) };
          draft.slides[0].advance = selected.kind === 'video' ? { mode: 'mediaEnd' } : { mode: 'manual' };
          draft.preview.cover ??= selected.asset.kind === 'image' ? selected.asset : selected.asset.poster;
        }
      }
      const active = getActiveAssetScope();
      if (active?.documentId !== scope.documentId || active.workspaceId !== scope.workspaceId || !useProductionGraphStore.getState().nodes.some((item) => item.id === node.id)) throw new Error(tUi("Документ изменился. Откройте редактор Stories заново."));
      return { document: draft, media, scope };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tUi("Не удалось подготовить Stories."));
      return undefined;
    } finally { clearTimeout(timeout); setPreparing(false); }
  }

  const saveDocument = (document: StoryDocumentDraftV1, scope: ActiveAssetScope) => {
    const active = getActiveAssetScope();
    if (active?.documentId !== scope.documentId || active.workspaceId !== scope.workspaceId) throw new Error(tUi("Документ изменился. Откройте редактор Stories заново."));
    if (data.authoringProfileBundle) {
      document = applyStoriesAuthoringProfile(document, data.authoringProfileBundle);
      assertStoriesDraftFitsHost(document, data.authoringProfileBundle);
    }
    if (node.locked || !useProductionGraphStore.getState().nodes.some((item) => item.id === node.id)) return;
    updateNodeData(node.id, { document, storyTitle: document.preview.title, subtitle: document.slides[0] ? getStoriesCopy(document.slides[0], 'subtitle') : '', text: document.slides[0] ? getStoriesCopy(document.slides[0], 'text') : '', locale: document.locale, styleProfileId: document.styleProfile?.profileId ?? data.styleProfileId, styleRevisionId: document.styleProfile?.revisionId ?? data.styleRevisionId });
  };

  const importAuthoringProfile = (bundle: StoriesAuthoringProfileBundle) => {
    updateNodeData(node.id, { authoringProfileBundle: bundle, styleProfileId: bundle.styleProfile.profileId, styleRevisionId: bundle.styleProfile.revisionId,
      ...(data.document ? { document: applyStoriesAuthoringProfile(data.document, bundle) } : {}) });
  };

  return { data, importAuthoringProfile, isConnected, hasInputs, connectedTitle, connectedSubtitle, connectedText, image, video, poster, preparing, message, prepareDocument, saveDocument, updateData: (patch: Partial<ReverieStoriesNodeData>) => updateNodeData(node.id, patch) };
}
