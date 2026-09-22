export function homeVideoFailureMessage(code: string, retryable = false) {
  if (['video_submit_unconfirmed', 'provider_outcome_unknown', 'video_wait_timeout'].includes(code)) {
    return 'Поставщик мог принять запрос. Не запускайте видео повторно: передайте номер задания администратору для проверки.';
  }
  if (retryable) return 'Восстанавливаем результат этого задания. Новая генерация не запускается.';
  if (code.includes('budget') || code.includes('limit')) return 'Лимит генерации исчерпан. Обратитесь к владельцу пространства.';
  if (code.includes('credential') || code.includes('provider_connection')) return 'AI-доступ не настроен. Обратитесь к владельцу пространства.';
  if (code.includes('content') || code.includes('person_restricted')) return 'Поставщик отклонил материалы. Измените описание или референсы перед новым запросом.';
  return 'Не удалось создать видео. Проверьте описание, параметры и доступ к AI. Новая генерация оплачивается отдельно.';
}
