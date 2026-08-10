import { apiError } from '@/shared/api/api-error';
import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { AuthenticationRequiredError } from '@/modules/authentication/server/auth-session';
import {
  createFeedbackSubmission,
  FeedbackDraftValidationError,
  parseFeedbackDraft,
} from '@/modules/feedback/core/feedback-submission';
import {
  getFeedbackProductMetadata,
  ProdactionFeedbackError,
  submitToProdactionFeedback,
} from '@/modules/feedback/server/prodaction-feedback-client';

export async function postProductFeedback(request: Request) {
  try {
    await requireApiSession(request);
    const draft = parseFeedbackDraft(await request.json());
    const submission = createFeedbackSubmission(draft, getFeedbackProductMetadata());
    const receipt = await submitToProdactionFeedback(submission);
    return Response.json(receipt, {
      headers: { 'Cache-Control': 'private, no-store' },
      status: 201,
    });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return apiError('unauthorized', 'Authentication required.', 401);
    }
    if (error instanceof FeedbackDraftValidationError || error instanceof SyntaxError) {
      return apiError('invalid_feedback', 'Проверьте оценку и текст комментария.', 400);
    }
    if (error instanceof ProdactionFeedbackError) {
      console.error('PRODaction Feedback request failed', {
        code: error.code,
        upstreamStatus: error.upstreamStatus,
      });
      if (error.code === 'rate_limited') {
        return apiError('feedback_rate_limited', 'Слишком много попыток. Попробуйте позже.', 429);
      }
      if (error.code === 'not_configured') {
        return apiError(
          'feedback_not_configured',
          'PRODaction Feedback пока не настроен для Image Production.',
          503,
        );
      }
      return apiError('feedback_unavailable', 'Сервис обратной связи временно недоступен.', 502);
    }

    console.error('Unexpected product feedback error', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return apiError('internal_error', 'Не удалось отправить обратную связь.', 500);
  }
}
