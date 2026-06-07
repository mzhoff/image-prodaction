import type {
  PublicationContentUnitDefinition,
  PublicationContentUnitId,
  PublicationPlatformDefinition,
  PublicationPlatformId,
  PublicationSlotDefinition,
} from './publication';

export const DEFAULT_PUBLICATION_CONTENT_UNIT_ID: PublicationContentUnitId = 'telegram-post';

const commonTextSlots: PublicationSlotDefinition[] = [
  { id: 'title', label: 'Title', accepts: ['title'] },
  { id: 'lead', label: 'Lead', accepts: ['lead'] },
  { id: 'body', label: 'Body', accepts: ['body'], required: true },
  { id: 'caption', label: 'Caption', accepts: ['caption'] },
  { id: 'cta', label: 'CTA', accepts: ['cta'] },
  { id: 'hashtags', label: 'Hashtags', accepts: ['hashtags'] },
  { id: 'cover', label: 'Cover', accepts: ['image'] },
  { id: 'gallery', label: 'Gallery', accepts: ['image'] },
  { id: 'video', label: 'Video', accepts: ['video'] },
];

const telegramPostSlots: PublicationSlotDefinition[] = [
  { id: 'body', label: 'Message', accepts: ['body'], required: true },
  { id: 'hashtags', label: 'Hashtags', accepts: ['hashtags'] },
  { id: 'cover', label: 'Cover', accepts: ['image'] },
  { id: 'gallery', label: 'Gallery', accepts: ['image'] },
];

export const PUBLICATION_PLATFORMS: PublicationPlatformDefinition[] = [
  {
    id: 'telegram',
    name: 'Telegram',
    shortName: 'TG',
    color: '#2AABEE',
    description: 'Fast channel format for posts, announcements, editorial notes, and media albums.',
    contentUnitIds: ['telegram-post'],
    autoposting: 'ready',
  },
  {
    id: 'vk',
    name: 'VK',
    shortName: 'VK',
    color: '#0077FF',
    description: 'Social feed format for posts, media albums, and community publishing.',
    contentUnitIds: ['vk-post'],
    autoposting: 'ready',
  },
  {
    id: 'dzen',
    name: 'Dzen',
    shortName: 'Dzen',
    color: '#111111',
    description: 'Long-form and post platform where articles need SEO-friendly structure and clear narrative.',
    contentUnitIds: ['dzen-article'],
    autoposting: 'manual-copy',
  },
  {
    id: 'vc',
    name: 'VC',
    shortName: 'VC',
    color: '#111111',
    description: 'Editorial article format for business, product, and technology audiences.',
    contentUnitIds: ['vc-article'],
    autoposting: 'manual-copy',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    shortName: 'IG',
    color: '#E4405F',
    description: 'Visual-first post format with compact captions, carousel structure, and hashtags.',
    contentUnitIds: ['instagram-carousel'],
    autoposting: 'api-review',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    shortName: 'TT',
    color: '#111111',
    description: 'Short vertical video format where hook, caption, and visual rhythm matter most.',
    contentUnitIds: ['tiktok-video'],
    autoposting: 'api-review',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    shortName: 'LI',
    color: '#0A66C2',
    description: 'Professional B2B post format for expertise, cases, and personal positioning.',
    contentUnitIds: ['linkedin-post'],
    autoposting: 'api-review',
  },
];

export const PUBLICATION_CONTENT_UNITS: PublicationContentUnitDefinition[] = [
  {
    id: 'telegram-post',
    platformId: 'telegram',
    formatId: 'post',
    name: 'Telegram message',
    description: 'Telegram channel message: one rich text body with an optional ordered media album.',
    slots: telegramPostSlots,
    constraints: [
      { kind: 'required', field: 'body', label: 'Body' },
      { kind: 'text-length', field: 'body', label: 'Body length', max: 4096, recommendedMin: 500, recommendedMax: 1000 },
      { kind: 'media-count', mediaKind: 'image', label: 'Image album', max: 10 },
      { kind: 'hashtag-count', label: 'Hashtags', recommendedMin: 1, recommendedMax: 3 },
    ],
    generationHints: [
      'No separate title is required.',
      'Keep the first paragraph strong because it is the preview hook.',
    ],
  },
  {
    id: 'vk-post',
    platformId: 'vk',
    formatId: 'post',
    name: 'VK post',
    description: 'Community feed post with optional media album and stricter search behavior for hashtag count.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'body', label: 'Body' },
      { kind: 'text-length', field: 'body', label: 'Body length', max: 15940 },
      { kind: 'media-count', mediaKind: 'image', label: 'Image album', max: 10 },
      { kind: 'hashtag-count', label: 'Hashtags', max: 10, recommendedMin: 1, recommendedMax: 5 },
    ],
    generationHints: [
      'Keep hashtags below 10 so the post remains visible in search.',
    ],
  },
  {
    id: 'dzen-article',
    platformId: 'dzen',
    formatId: 'article',
    name: 'Dzen article',
    description: 'SEO-oriented article with a clear title, long body, and limited gallery.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'title', label: 'Title' },
      { kind: 'required', field: 'body', label: 'Body' },
      { kind: 'text-length', field: 'title', label: 'Title length', max: 60, severity: 'warning' },
      { kind: 'text-length', field: 'body', label: 'Body length', max: 100000, recommendedMin: 3300, recommendedMax: 5700 },
      { kind: 'media-count', mediaKind: 'image', label: 'Image gallery', max: 30 },
    ],
    generationHints: [
      'Use a searchable title and a structured article body.',
    ],
  },
  {
    id: 'vc-article',
    platformId: 'vc',
    formatId: 'article',
    name: 'VC article',
    description: 'Long-form editorial article for business and technology audiences.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'title', label: 'Title' },
      { kind: 'required', field: 'body', label: 'Body' },
      { kind: 'text-length', field: 'title', label: 'Title length', max: 100, severity: 'warning' },
      { kind: 'text-length', field: 'body', label: 'Body length', recommendedMin: 5000, recommendedMax: 10000 },
    ],
    generationHints: [
      'Lead with the business problem and keep the argument structured.',
    ],
  },
  {
    id: 'instagram-carousel',
    platformId: 'instagram',
    formatId: 'carousel',
    name: 'Instagram carousel',
    description: 'Visual carousel with short caption, first-line hook, and controlled hashtag count.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'caption', label: 'Caption' },
      { kind: 'text-length', field: 'caption', label: 'Caption length', max: 2200, recommendedMax: 125, severity: 'warning' },
      { kind: 'media-count', mediaKind: 'image', label: 'Carousel images', min: 1, max: 10 },
      { kind: 'hashtag-count', label: 'Hashtags', max: 30, recommendedMin: 3, recommendedMax: 5 },
    ],
    generationHints: [
      'The first 125 caption characters should carry the main hook.',
    ],
  },
  {
    id: 'tiktok-video',
    platformId: 'tiktok',
    formatId: 'short-video',
    name: 'TikTok video post',
    description: 'Short vertical video publication with hook, caption, and hashtags.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'video', label: 'Video', severity: 'error' },
      { kind: 'text-length', field: 'caption', label: 'Caption length', max: 4000, recommendedMax: 60, severity: 'warning' },
      { kind: 'media-count', mediaKind: 'video', label: 'Video', min: 1, max: 1, severity: 'error' },
      { kind: 'hashtag-count', label: 'Hashtags', recommendedMin: 3, recommendedMax: 5 },
    ],
    generationHints: [
      'The opening 3 seconds should contain the strongest hook.',
    ],
  },
  {
    id: 'linkedin-post',
    platformId: 'linkedin',
    formatId: 'post',
    name: 'LinkedIn post',
    description: 'Professional post for B2B expertise, cases, personal stories, and compact arguments.',
    slots: commonTextSlots,
    constraints: [
      { kind: 'required', field: 'body', label: 'Body' },
      { kind: 'text-length', field: 'body', label: 'Body length', max: 3000, recommendedMin: 500, recommendedMax: 1000 },
      { kind: 'media-count', mediaKind: 'image', label: 'Images or document preview', max: 9 },
      { kind: 'hashtag-count', label: 'Hashtags', recommendedMin: 3, recommendedMax: 5 },
    ],
    generationHints: [
      'Personal framing and concrete cases usually work better than generic corporate copy.',
    ],
  },
];

export function getPublicationPlatformDefinition(platformId: PublicationPlatformId) {
  return PUBLICATION_PLATFORMS.find((platform) => platform.id === platformId);
}

export function getPublicationContentUnitDefinition(contentUnitId: PublicationContentUnitId) {
  return PUBLICATION_CONTENT_UNITS.find((contentUnit) => contentUnit.id === contentUnitId);
}

export function getPublicationContentUnitsForPlatform(platformId: PublicationPlatformId) {
  return PUBLICATION_CONTENT_UNITS.filter((contentUnit) => contentUnit.platformId === platformId);
}
