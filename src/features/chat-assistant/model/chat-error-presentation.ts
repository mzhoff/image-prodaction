import type { ChatErrorPayload } from '@prodactionpro/chat-sdk';
import { aiAccessErrorMessage } from '@/modules/provider-connections/core/ai-access-messages';

/** Presentation only: preserve retry safety, trace identity and execution state from ChatModule. */
export function presentChatError(error: ChatErrorPayload): ChatErrorPayload {
  const access = aiAccessErrorMessage(error.code);
  if (access) return { ...error, message: access };
  if (error.code === 'CHAT_UNAUTHORIZED') return { ...error, message: 'Сессия завершилась. Войдите в аккаунт заново и откройте этот проект.' };
  if (error.code === 'CHAT_FORBIDDEN') return { ...error, message: 'Нет доступа к этому пространству или диалогу. Обратитесь к владельцу пространства.' };
  if (error.statusCode && error.statusCode >= 500 || [
    'CHAT_STREAM_FAILED', 'CHAT_REQUEST_FAILED', 'CHAT_PROVIDER_UNAVAILABLE',
    'CHAT_PROVIDER_TIMEOUT', 'CHAT_TIMEOUT', 'CHAT_PROVIDER_REQUEST_FAILED',
  ].includes(error.code)) {
    return { ...error, message: error.executionState === 'ambiguous' || error.executionState === 'mutated'
      ? 'Не удалось получить окончательный ответ. Проверьте историю и состояние проекта перед новым запросом: предыдущая операция могла выполниться. Это не означает, что баланс исчерпан.'
      : 'Ассистент сейчас недоступен. Проверьте соединение и повторите позже. Если ошибка сохранится, обратитесь к администратору бета-теста. Это не означает, что баланс исчерпан.' };
  }
  return error;
}
