const TECHNICAL_MARKERS = /\b(?:http\s*\d{3}|status\s*code|openrouter|provider|gateway|request[_ -]?id|job[_ -]?id)\b/i;

export function getVideoGenerationUserMessage(message?: string) {
  const value = message?.trim();
  if (!value) return '';

  if (/InputImageSensitiveContentDetected\.PrivacyInformation|input image[\s\S]*real person|в нём распознан реальный человек/i.test(value)) {
    return 'Модель отклонила кадр: в нём распознан реальный человек. Для этого изображения выберите другую модель или используйте кадр без людей.';
  }
  if (/insufficient[\s\S]*(?:balance|credit|fund)|недостаточно\s+средств|\b402\b/i.test(value)) {
    return 'Недостаточно средств для генерации видео. Пополните баланс и попробуйте снова.';
  }
  if (/\b(?:401|403)\b|unauthori[sz]ed|forbidden|access denied|нет доступа/i.test(value)) {
    return 'Нет доступа к генерации видео. Проверьте подключение сервиса в настройках.';
  }
  if (/\b404\b|not found|не найден/i.test(value)) {
    return 'Запрос или выбранная модель больше недоступны. Обновите список моделей и попробуйте снова.';
  }
  if (/\b429\b|rate.?limit|too many requests|перегруж|слишком много запросов/i.test(value)) {
    return 'Сервис генерации сейчас перегружен. Подождите немного и проверьте результат снова.';
  }
  if (/timeout|timed out|ещ[её] не получено|ожидани/i.test(value)) {
    return 'Видео ещё обрабатывается. Нажмите «Проверить результат» немного позже.';
  }
  if (/\b400\b|invalid|validation|неверн|проверьте входы|проверьте параметры/i.test(value)) {
    return 'Не удалось начать генерацию. Проверьте модель, режим и подключённые материалы.';
  }
  if (/cancel|отмен/i.test(value)) {
    return 'Запрос отменён. Уже начатая обработка может завершиться позже.';
  }
  if (TECHNICAL_MARKERS.test(value) || /[{}][\s\S]*[{}]/.test(value)) {
    return 'Не удалось получить видео. Проверьте настройки и попробуйте проверить результат снова.';
  }
  return value;
}
