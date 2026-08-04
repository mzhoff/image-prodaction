import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFeedbackSubmission,
  FeedbackDraftValidationError,
  parseFeedbackDraft,
} from './feedback-submission';

test('feedback draft keeps the existing contract and normalizes an empty comment', () => {
  const draft = parseFeedbackDraft({
    comment: '  ',
    locale: 'ru-RU',
    osVersion: 'macOS',
    rating: 5,
    submissionId: '019fb9e9-8e6e-7303-b2fb-e5198c9409a2',
  });
  const submission = createFeedbackSubmission(draft, {
    applicationId: 'image-production',
    appVersion: '0.1.0',
    buildNumber: 'local',
  });

  assert.deepEqual(submission, {
    submissionId: '019fb9e9-8e6e-7303-b2fb-e5198c9409a2',
    applicationId: 'image-production',
    source: 'other',
    rating: 5,
    comment: null,
    appVersion: '0.1.0',
    buildNumber: 'local',
    platform: 'web',
    osVersion: 'macOS',
    locale: 'ru-RU',
  });
  assert.deepEqual(Object.keys(submission).sort(), [
    'appVersion',
    'applicationId',
    'buildNumber',
    'comment',
    'locale',
    'osVersion',
    'platform',
    'rating',
    'source',
    'submissionId',
  ]);
});

test('feedback draft rejects schema changes and invalid ratings', () => {
  assert.throws(() => parseFeedbackDraft({
    attachment: 'not-supported.png',
    comment: 'Text',
    locale: 'ru-RU',
    osVersion: 'macOS',
    rating: 6,
    submissionId: '019fb9e9-8e6e-7303-b2fb-e5198c9409a2',
  }), FeedbackDraftValidationError);
});
