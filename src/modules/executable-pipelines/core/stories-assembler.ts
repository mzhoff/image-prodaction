import type {
  StoryDocumentV1, StoryImageAssetV3, StoryLayerV3, StoryVideoAssetV3,
} from '@prodaction/stories-platform-contracts/story-document/1.0.0';
import { validatePollDefinitionV1 } from '@prodaction/stories-platform-contracts/polls/1.0.0';
import { countStoryTextCharacters, STORY_CONTENT_LIMITS_V1 } from '@prodaction/stories-platform-contracts/limits/1.0.0';
import { requireProductionStoryDocument, storyDocumentAssets, STORIES_DOCUMENT_FORMAT } from '@/shared/contracts/stories-document';

export function assembleStoryDocument(input: {
  id: string; revisionId: string; locale: string; styleProfileId: string; styleRevisionId: string;
  title: string; subtitle: string; text: string; poll?: unknown;
  image?: StoryImageAssetV3; video?: StoryVideoAssetV3;
}): StoryDocumentV1 {
  if (Boolean(input.image) === Boolean(input.video)) throw new Error('Выберите один фон: изображение или видео.');
  if (!input.title.trim()) throw new Error('Добавьте заголовок Stories.');
  for (const [text, label, limit] of [[input.title, 'заголовок', STORY_CONTENT_LIMITS_V1.title],
    [input.subtitle, 'подзаголовок', STORY_CONTENT_LIMITS_V1.subtitle],
    [input.text, 'текст', STORY_CONTENT_LIMITS_V1.text]] as const) {
    const excess = countStoryTextCharacters(text) - limit;
    if (excess > 0) throw new Error(`Сократите ${label} на ${excess} симв. — он не поместится в Stories. Исходный текст сохранён во входе.`);
  }
  const background = input.video ?? input.image!;
  const cover = input.video ? input.video.poster : input.image!;
  const layers: StoryLayerV3[] = [];
  for (const [kind, text] of [['title', input.title], ['subtitle', input.subtitle], ['text', input.text]] as const) {
    if (text) layers.push({ id: kind, kind, text, contrastIntent: 'lightContent',
      layout: { region: 'bottom', order: layers.length, alignment: 'start' } });
  }
  if (input.poll !== undefined) {
    const poll = validatePollDefinitionV1(input.poll);
    if (!poll.valid) throw new Error('Проверьте вопрос и варианты ответа в опросе.');
    layers.push({ id: 'poll', kind: 'poll', definition: poll.data,
      layout: { region: 'bottom', order: layers.length, alignment: 'start' } });
  }
  return requireProductionStoryDocument({ schemaVersion: STORIES_DOCUMENT_FORMAT,
    id: input.id, revisionId: input.revisionId, locale: input.locale,
    styleProfile: { profileId: input.styleProfileId, revisionId: input.styleRevisionId },
    preview: { title: input.title, ...(input.subtitle ? { subtitle: input.subtitle } : {}),
      accessibilityLabel: input.title, cover },
    slides: [{ id: 'slide-1', accessibilityLabel: input.title, layoutIntent: 'fullBleedOverlay',
      background: { asset: background, fit: 'cover',
        ...(input.video ? { playback: { startMuted: true, loop: false, failure: 'posterManual' } } : {}) },
      advance: { mode: input.video ? 'mediaEnd' : 'manual' }, layers }],
  });
}

export function combineStoryDocuments(values: unknown[], id: string, revisionId: string): StoryDocumentV1 {
  if (!values.length) throw new Error('Подключите хотя бы один слайд к Stories.');
  const documents = values.map(requireProductionStoryDocument);
  const first = documents[0]!;
  if (documents.some((document) => document.locale !== first.locale
    || document.styleProfile.profileId !== first.styleProfile.profileId
    || document.styleProfile.revisionId !== first.styleProfile.revisionId)) {
    throw new Error('Выберите одинаковый язык и стиль для всех слайдов истории.');
  }
  const slides = documents.flatMap((document) => document.slides).map((slide, index) => ({
    ...structuredClone(slide), id: `slide-${index + 1}`,
  }));
  if (slides.length > STORY_CONTENT_LIMITS_V1.slides) throw new Error(`В истории помещается до ${STORY_CONTENT_LIMITS_V1.slides} слайдов. Разделите её на несколько историй.`);
  const combined: StoryDocumentV1 = { ...structuredClone(first), id, revisionId,
    slides: [slides[0]!, ...slides.slice(1)] };
  // Independent slides can describe the same file differently. Keep the first
  // file description in port order; each slide retains its own accessibilityLabel.
  // Only altText is unified: the final validator must still reject conflicting
  // checksums, sources, dimensions, provenance, duration, or poster identities.
  const descriptions = new Map<string, string>();
  for (const asset of storyDocumentAssets(combined)) {
    if (!descriptions.has(asset.assetId)) descriptions.set(asset.assetId, asset.altText);
    asset.altText = descriptions.get(asset.assetId)!;
  }
  return requireProductionStoryDocument(combined);
}
