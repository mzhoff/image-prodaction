import type {
  PublicationArtifact,
  PublicationArtifactMetrics,
} from './publication-types';

export function getPublicationMetrics(artifact: PublicationArtifact): PublicationArtifactMetrics {
  const title = getPublicationFieldText(artifact, 'title');
  const lead = getPublicationFieldText(artifact, 'lead');
  const body = getPublicationFieldText(artifact, 'body');
  const caption = getPublicationFieldText(artifact, 'caption');
  const allText = [title, lead, body, caption, artifact.summary].filter(Boolean).join('\n');

  return {
    titleLength: countCharacters(title),
    leadLength: countCharacters(lead),
    bodyLength: countCharacters(body),
    captionLength: countCharacters(caption),
    textLength: countCharacters(allText),
    imageCount: countMedia(artifact, 'image'),
    videoCount: countMedia(artifact, 'video'),
    hashtagCount: extractHashtags(allText).length,
  };
}

export function getPublicationFieldText(
  artifact: PublicationArtifact,
  field: 'title' | 'lead' | 'body' | 'caption',
) {
  if (field === 'title' && artifact.title?.trim()) return artifact.title.trim();
  if (field === 'body' && artifact.contentPlain?.trim()) return artifact.contentPlain.trim();

  const slotText = artifact.components
    .filter((component) => component.slot === field && component.contentText?.trim())
    .sort((first, second) => first.order - second.order)
    .map((component) => component.contentText?.trim() ?? '')
    .join('\n\n')
    .trim();
  if (slotText) return slotText;

  if (field === 'caption') {
    return artifact.attachments
      .map((attachment) => attachment.caption?.trim() ?? '')
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  return '';
}

function countMedia(artifact: PublicationArtifact, kind: 'image' | 'video') {
  const attachmentCount = artifact.attachments.filter((attachment) => attachment.kind === kind).length;
  const componentCount = artifact.components.filter((component) => component.type === kind && Boolean(component.assetId)).length;
  return attachmentCount + componentCount;
}

function countCharacters(value: string) {
  return Array.from(value.trim()).length;
}

function extractHashtags(value: string) {
  return Array.from(new Set(value.match(/#[\p{L}\p{N}_-]+/gu) ?? []));
}
