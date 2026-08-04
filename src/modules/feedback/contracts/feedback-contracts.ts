export const FEEDBACK_COMMENT_MAX_LENGTH = 2_000;

export type FeedbackPlatform = 'web';
export type FeedbackSource = 'other';

export interface FeedbackDraftRequest {
  comment: string | null;
  locale: string;
  osVersion: string;
  rating: number;
  submissionId: string;
}
export interface FeedbackSubmission {
  applicationId: string;
  appVersion: string;
  buildNumber: string;
  comment: string | null;
  locale: string;
  osVersion: string;
  platform: FeedbackPlatform;
  rating: number;
  source: FeedbackSource;
  submissionId: string;
}

export interface FeedbackReceipt {
  id: string;
  receivedAt: string;
}
