import { z } from 'zod';
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  type FeedbackDraftRequest,
  type FeedbackSubmission,
} from '../contracts/feedback-contracts';

const feedbackDraftSchema = z.object({
  comment: z.string().max(FEEDBACK_COMMENT_MAX_LENGTH).nullable(),
  locale: z.string().trim().min(1).max(32),
  osVersion: z.string().trim().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  submissionId: z.string().uuid(),
}).strict();

export class FeedbackDraftValidationError extends Error {
  constructor() {
    super('Feedback form data is invalid.');
    this.name = 'FeedbackDraftValidationError';
  }
}
export function parseFeedbackDraft(value: unknown): FeedbackDraftRequest {
  const result = feedbackDraftSchema.safeParse(value);
  if (!result.success) throw new FeedbackDraftValidationError();

  const comment = result.data.comment?.trim() ?? null;
  return {
    ...result.data,
    comment: comment ? comment : null,
  };
}

export function createFeedbackSubmission(
  draft: FeedbackDraftRequest,
  metadata: {
    applicationId: string;
    appVersion: string;
    buildNumber: string;
  },
): FeedbackSubmission {
  return {
    submissionId: draft.submissionId,
    applicationId: metadata.applicationId,
    source: 'other',
    rating: draft.rating,
    comment: draft.comment,
    appVersion: metadata.appVersion,
    buildNumber: metadata.buildNumber,
    platform: 'web',
    osVersion: draft.osVersion,
    locale: draft.locale,
  };
}
