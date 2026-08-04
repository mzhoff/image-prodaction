import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeedbackSubmission } from '../contracts/feedback-contracts';
import {
  PRODACTION_FEEDBACK_DEFAULT_ENDPOINT,
  ProdactionFeedbackError,
  submitToProdactionFeedback,
} from './prodaction-feedback-client';

const submission: FeedbackSubmission = {
  submissionId: '019fb9e9-8e6e-7303-b2fb-e5198c9409a2',
  applicationId: 'image-production',
  source: 'other',
  rating: 4,
  comment: 'Needs a faster export flow.',
  appVersion: '0.1.0',
  buildNumber: 'local',
  platform: 'web',
  osVersion: 'macOS',
  locale: 'ru-RU',
};

test('PRODaction Feedback adapter sends the unchanged JSON payload', async () => {
  let capturedInput: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const receipt = await submitToProdactionFeedback(submission, {
    endpoint: 'https://feedback.example.test/v1/submissions',
    fetchImpl: async (input, init) => {
      capturedInput = input;
      capturedInit = init;
      return Response.json({ id: 'receipt-1', receivedAt: '2026-08-04T10:00:00.000Z' }, { status: 201 });
    },
  });

  assert.equal(capturedInput, 'https://feedback.example.test/v1/submissions');
  assert.equal(capturedInit?.method, 'POST');
  assert.deepEqual(capturedInit?.headers, {
    'Content-Type': 'application/json',
    'Idempotency-Key': submission.submissionId,
  });
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), submission);
  assert.deepEqual(receipt, { id: 'receipt-1', receivedAt: '2026-08-04T10:00:00.000Z' });
});

test('PRODaction Feedback adapter uses the new production endpoint by default', async () => {
  const previousEndpoint = process.env.PRODACTION_FEEDBACK_ENDPOINT;
  delete process.env.PRODACTION_FEEDBACK_ENDPOINT;
  let capturedInput: string | URL | Request | undefined;

  try {
    await submitToProdactionFeedback(submission, {
      fetchImpl: async (input) => {
        capturedInput = input;
        return Response.json({ id: 'receipt-2', receivedAt: '2026-08-04T10:00:00.000Z' }, { status: 201 });
      },
    });
  } finally {
    if (previousEndpoint === undefined) delete process.env.PRODACTION_FEEDBACK_ENDPOINT;
    else process.env.PRODACTION_FEEDBACK_ENDPOINT = previousEndpoint;
  }

  assert.equal(capturedInput, 'https://feedback.apption.space/v1/submissions');
  assert.equal(capturedInput, PRODACTION_FEEDBACK_DEFAULT_ENDPOINT);
});

test('PRODaction Feedback adapter maps an unknown application safely', async () => {
  await assert.rejects(
    submitToProdactionFeedback(submission, {
      fetchImpl: async () => Response.json({
        error: { code: 'unknown_application', message: 'The application is not configured.' },
      }, { status: 400 }),
    }),
    (error: unknown) => error instanceof ProdactionFeedbackError && error.code === 'not_configured',
  );
});
