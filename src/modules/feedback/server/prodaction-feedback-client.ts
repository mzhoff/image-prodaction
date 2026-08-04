import packageMetadata from '../../../../package.json' with { type: 'json' };
import type {
  FeedbackReceipt,
  FeedbackSubmission,
} from '../contracts/feedback-contracts';

export const PRODACTION_FEEDBACK_DEFAULT_ENDPOINT = 'https://feedback.apption.space/v1/submissions';
const DEFAULT_APPLICATION_ID = 'image-production';

type FeedbackFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ProdactionFeedbackErrorCode =
  | 'invalid_response'
  | 'not_configured'
  | 'rate_limited'
  | 'rejected'
  | 'unavailable';

export class ProdactionFeedbackError extends Error {
  readonly code: ProdactionFeedbackErrorCode;
  readonly upstreamStatus?: number;

  constructor(
    code: ProdactionFeedbackErrorCode,
    upstreamStatus?: number,
  ) {
    super(`PRODaction Feedback request failed: ${code}`);
    this.name = 'ProdactionFeedbackError';
    this.code = code;
    this.upstreamStatus = upstreamStatus;
  }
}

export function getFeedbackProductMetadata() {
  return {
    applicationId: normalizeConfigurationValue(
      process.env.PRODACTION_FEEDBACK_APPLICATION_ID,
      DEFAULT_APPLICATION_ID,
    ),
    appVersion: packageMetadata.version,
    buildNumber: normalizeConfigurationValue(
      process.env.PRODACTION_FEEDBACK_BUILD_NUMBER,
      'local',
    ),
  };
}

export async function submitToProdactionFeedback(
  submission: FeedbackSubmission,
  dependencies: {
    endpoint?: string;
    fetchImpl?: FeedbackFetch;
  } = {},
): Promise<FeedbackReceipt> {
  const endpoint = dependencies.endpoint
    ?? normalizeConfigurationValue(
      process.env.PRODACTION_FEEDBACK_ENDPOINT,
      PRODACTION_FEEDBACK_DEFAULT_ENDPOINT,
    );
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response;

  try {
    response = await fetchImpl(endpoint, {
      body: JSON.stringify(submission),
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': submission.submissionId,
      },
      method: 'POST',
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ProdactionFeedbackError('unavailable');
  }

  const body = await readJson(response);
  if (response.status === 200 || response.status === 201) {
    if (!isFeedbackReceipt(body)) throw new ProdactionFeedbackError('invalid_response', response.status);
    return body;
  }

  const upstreamCode = readUpstreamErrorCode(body);
  if (response.status === 429) throw new ProdactionFeedbackError('rate_limited', response.status);
  if (upstreamCode === 'unknown_application') {
    throw new ProdactionFeedbackError('not_configured', response.status);
  }
  throw new ProdactionFeedbackError('rejected', response.status);
}

function normalizeConfigurationValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isFeedbackReceipt(value: unknown): value is FeedbackReceipt {
  if (!value || typeof value !== 'object') return false;
  const receipt = value as Record<string, unknown>;
  return typeof receipt.id === 'string' && typeof receipt.receivedAt === 'string';
}

function readUpstreamErrorCode(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'string' ? code : null;
}
