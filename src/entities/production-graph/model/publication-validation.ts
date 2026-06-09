import type {
  PublicationArtifact,
  PublicationArtifactMetrics,
  PublicationConstraint,
  PublicationContentUnitDefinition,
  PublicationHashtagConstraint,
  PublicationMediaCountConstraint,
  PublicationRequiredConstraint,
  PublicationTextLengthConstraint,
  PublicationValidationIssue,
  PublicationValidationReport,
} from './publication-types';
import { getPublicationFieldText, getPublicationMetrics } from './publication-metrics';

export function validatePublicationArtifact(
  artifact: PublicationArtifact,
  definition: PublicationContentUnitDefinition,
): PublicationValidationReport {
  const metrics = getPublicationMetrics(artifact);
  const issues = definition.constraints.flatMap((constraint, index) => validateConstraint(artifact, metrics, constraint, index));
  const hasContent = metrics.textLength > 0 || metrics.imageCount > 0 || metrics.videoCount > 0;
  const status = !hasContent
    ? 'empty'
    : issues.some((issue) => issue.severity === 'error')
      ? 'error'
      : issues.some((issue) => issue.severity === 'warning')
        ? 'warning'
        : 'ready';

  return { status, metrics, issues };
}

function validateConstraint(
  artifact: PublicationArtifact,
  metrics: PublicationArtifactMetrics,
  constraint: PublicationConstraint,
  index: number,
): PublicationValidationIssue[] {
  if (constraint.kind === 'text-length') {
    return validateTextLength(metrics, constraint, index);
  }

  if (constraint.kind === 'media-count') {
    return validateMediaCount(metrics, constraint, index);
  }

  if (constraint.kind === 'hashtag-count') {
    return validateHashtagCount(metrics, constraint, index);
  }

  return validateRequired(artifact, metrics, constraint, index);
}

function validateTextLength(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationTextLengthConstraint,
  index: number,
): PublicationValidationIssue[] {
  const current = getTextMetric(metrics, constraint.field);
  const issues: PublicationValidationIssue[] = [];
  if (typeof constraint.max === 'number' && current > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.field, index, 'max'),
      severity: constraint.severity ?? 'error',
      code: 'text-too-long',
      field: constraint.field,
      current,
      limit: constraint.max,
      message: `${constraint.label}: ${current} characters, limit ${constraint.max}.`,
    });
  }

  if (
    current > 0
    && typeof constraint.recommendedMin === 'number'
    && typeof constraint.recommendedMax === 'number'
    && (current < constraint.recommendedMin || current > constraint.recommendedMax)
  ) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.field, index, 'recommended'),
      severity: 'info',
      code: 'text-outside-recommended-range',
      field: constraint.field,
      current,
      recommendation: `${constraint.recommendedMin}-${constraint.recommendedMax} characters`,
      message: `${constraint.label}: recommended range is ${constraint.recommendedMin}-${constraint.recommendedMax} characters.`,
    });
  }

  return issues;
}

function validateMediaCount(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationMediaCountConstraint,
  index: number,
): PublicationValidationIssue[] {
  const current = constraint.mediaKind === 'image' ? metrics.imageCount : metrics.videoCount;
  const issues: PublicationValidationIssue[] = [];

  if (typeof constraint.min === 'number' && current < constraint.min) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.mediaKind, index, 'min'),
      severity: constraint.severity ?? 'warning',
      code: 'media-too-few',
      field: constraint.mediaKind,
      current,
      limit: constraint.min,
      message: `${constraint.label}: at least ${constraint.min} required.`,
    });
  }

  if (typeof constraint.max === 'number' && current > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, constraint.mediaKind, index, 'max'),
      severity: constraint.severity ?? 'error',
      code: 'media-too-many',
      field: constraint.mediaKind,
      current,
      limit: constraint.max,
      message: `${constraint.label}: ${current} attached, limit ${constraint.max}.`,
    });
  }

  return issues;
}

function validateHashtagCount(
  metrics: PublicationArtifactMetrics,
  constraint: PublicationHashtagConstraint,
  index: number,
): PublicationValidationIssue[] {
  const issues: PublicationValidationIssue[] = [];
  if (typeof constraint.max === 'number' && metrics.hashtagCount > constraint.max) {
    issues.push({
      id: makeIssueId(constraint.kind, 'hashtags', index, 'max'),
      severity: constraint.severity ?? 'warning',
      code: 'hashtags-too-many',
      field: 'hashtags',
      current: metrics.hashtagCount,
      limit: constraint.max,
      message: `${constraint.label}: ${metrics.hashtagCount} hashtags, limit ${constraint.max}.`,
    });
  }

  if (
    metrics.hashtagCount > 0
    && typeof constraint.recommendedMin === 'number'
    && typeof constraint.recommendedMax === 'number'
    && (metrics.hashtagCount < constraint.recommendedMin || metrics.hashtagCount > constraint.recommendedMax)
  ) {
    issues.push({
      id: makeIssueId(constraint.kind, 'hashtags', index, 'recommended'),
      severity: 'info',
      code: 'hashtags-outside-recommended-range',
      field: 'hashtags',
      current: metrics.hashtagCount,
      recommendation: `${constraint.recommendedMin}-${constraint.recommendedMax} hashtags`,
      message: `${constraint.label}: recommended range is ${constraint.recommendedMin}-${constraint.recommendedMax}.`,
    });
  }

  return issues;
}

function validateRequired(
  artifact: PublicationArtifact,
  metrics: PublicationArtifactMetrics,
  constraint: PublicationRequiredConstraint,
  index: number,
): PublicationValidationIssue[] {
  const hasValue = constraint.field === 'image'
    ? metrics.imageCount > 0
    : constraint.field === 'video'
      ? metrics.videoCount > 0
      : getPublicationFieldText(artifact, constraint.field).length > 0;

  if (hasValue) return [];
  return [{
    id: makeIssueId(constraint.kind, constraint.field, index, 'required'),
    severity: constraint.severity ?? 'warning',
    code: 'required-field-empty',
    field: constraint.field,
    message: `${constraint.label}: required content is missing.`,
  }];
}

function getTextMetric(metrics: PublicationArtifactMetrics, field: PublicationTextLengthConstraint['field']) {
  if (field === 'title') return metrics.titleLength;
  if (field === 'lead') return metrics.leadLength;
  if (field === 'caption') return metrics.captionLength;
  return metrics.bodyLength;
}

function makeIssueId(kind: string, field: string, index: number, suffix: string) {
  return `${kind}-${field}-${index}-${suffix}`;
}
