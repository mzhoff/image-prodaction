export function homeJobFailureMessage(code?: string, retryable = false) {
  if (code === 'provider_outcome_unknown' || code === 'provider_reconciliation_required' || code === 'generation_checkpoint_failed') {
    return 'Провайдер мог уже списать оплату, но результат пока не удалось восстановить. Не запускайте повторную генерацию: обратитесь к администратору и передайте номер задания.';
  }
  if (retryable) return 'Результат ещё восстанавливается. Подождите: система повторит сохранение этого задания.';
  if (code?.includes('budget') || code?.includes('limit')) return 'Лимит генерации исчерпан. Обратитесь к владельцу Workspace, чтобы увеличить бюджет.';
  if (code?.includes('credential') || code?.includes('provider_connection')) return 'AI-доступ Workspace не настроен. Обратитесь к владельцу пространства.';
  if (code === 'generation_output_persistence_failed' || code === 'generation_checkpoint_link_failed') {
    return 'Изображение создано, но его сохранение не завершилось. Обратитесь к администратору с номером задания; повторная генерация может списать деньги ещё раз.';
  }
  return 'Не удалось создать изображение. Проверьте доступ к AI. Новый запрос может потребовать повторной оплаты.';
}
