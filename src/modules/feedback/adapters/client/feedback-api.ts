import type {
  FeedbackDraftRequest,
  FeedbackReceipt,
} from '../../contracts/feedback-contracts';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}
export class FeedbackApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'FeedbackApiError';
  }
}

export async function submitProductFeedback(draft: FeedbackDraftRequest): Promise<FeedbackReceipt> {
  const response = await fetch('/api/product-feedback/submissions', {
    body: JSON.stringify(draft),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const body = await response.json().catch(() => null) as FeedbackReceipt | ApiErrorBody | null;

  if (!response.ok) {
    const error = body && 'error' in body ? body.error : undefined;
    throw new FeedbackApiError(
      error?.code ?? 'feedback_unavailable',
      error?.message ?? 'Не удалось отправить обратную связь.',
    );
  }

  if (!body || !('id' in body) || typeof body.id !== 'string' || typeof body.receivedAt !== 'string') {
    throw new FeedbackApiError('invalid_response', 'Сервис обратной связи вернул некорректный ответ.');
  }
  return body;
}
