import {
  STORY_DOCUMENT_SCHEMA_CHECKSUM,
  validateStoryDocumentV1,
  finalizeStoryDocumentDraftV1,
  type StoryDocumentV1,
  type StoryImageAssetV3,
  type StoryVideoAssetV3,
} from '@prodaction/stories-platform-contracts/story-document/1.0.0';

export { STORY_DOCUMENT_SCHEMA_CHECKSUM, validateStoryDocumentV1 };
export const STORIES_DOCUMENT_FORMAT = 'stories.document@1.0.0' as const;

/** Only authoring config accepts editable drafts; runtime output stays strict. */
export function finalizeProductionStoryDraft(value: unknown): StoryDocumentV1 {
  const validation = finalizeStoryDocumentDraftV1(value);
  if (!validation.valid) throw new Error('Дополните черновик Stories перед запуском: проверьте тексты, фон и опрос.');
  return requireProductionStoryDocument(validation.data);
}

export function storyDocumentAssets(document: StoryDocumentV1) {
  const assets: (StoryImageAssetV3 | StoryVideoAssetV3)[] = [document.preview.cover];
  for (const slide of document.slides) {
    assets.push(slide.background.asset);
    if (slide.background.asset.kind === 'video') assets.push(slide.background.asset.poster);
  }
  return assets;
}

/** Production output contains only service-owned references, never storage URLs. */
export function requireProductionStoryDocument(value: unknown): StoryDocumentV1 {
  const validation = validateStoryDocumentV1(value);
  if (!validation.valid) throw new Error('Проверьте Stories: тексты, фон, опрос и структуру слайдов.');
  const document = validation.data;
  if (storyDocumentAssets(document).some((asset) => asset.source.kind !== 'productionArtifact'
    || asset.source.producerKey !== 'image-production' || asset.source.artifactId !== asset.assetId)) {
    throw new Error('Добавьте изображения и видео из медиатеки Image Production.');
  }
  return document;
}
