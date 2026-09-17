import type { VideoProviderDiagnostic } from '../contracts/video-provider';

export class VideoProviderError extends Error {
  readonly diagnostic: VideoProviderDiagnostic;
  readonly rejectionConfirmed: boolean;

  constructor(diagnostic: VideoProviderDiagnostic) {
    super(diagnostic.message);
    this.name = 'VideoProviderError';
    this.diagnostic = diagnostic;
    // Timeouts and server errors can hide an accepted paid request.
    this.rejectionConfirmed = [400, 401, 402, 403, 404, 413, 422, 429].includes(diagnostic.httpStatus ?? 0);
  }
}

export function normalizeVideoProviderDiagnostic(input: {
  body: unknown; httpStatus: number | null; requestId?: string | null; secrets?: string[];
}): VideoProviderDiagnostic {
  const error = unwrap(input.body);
  const clean = (value: string, max = 900) => sanitize(value, input.secrets ?? []).slice(0, max);
  const detail = clean(error.message);
  const providerCode = clean(error.code, 160) || undefined;
  const evidence = `${providerCode ?? ''} ${detail}`;
  const requestId = clean(input.requestId || error.message.match(/request[ _-]?id\s*[:=]\s*([\w-]+)/i)?.[1] || '', 160) || undefined;
  let code = 'video_provider_error';
  let message = 'Сервис не смог обработать видео. Проверьте результат немного позже.';
  if (/InputImageSensitiveContentDetected\.PrivacyInformation|input image[\s\S]*real person/i.test(evidence)) {
    code = 'video_input_person_restricted';
    message = 'Модель отклонила кадр: в нём распознан реальный человек. Для этого изображения выберите другую модель или используйте кадр без людей.';
  } else if (/output audio[\s\S]*copyright/i.test(evidence)) {
    code = 'video_audio_content_rejected';
    message = 'Поставщик отклонил сгенерированный звук из-за возможного нарушения авторских прав. Видео не выдано. Можно создать вариант без звука или выбрать другую модель.';
  } else if (/sensitivecontent|content.?policy|content.?filter|moderation|safety|nsfw|copyright/i.test(evidence)) {
    code = 'video_content_rejected';
    message = 'Модель отклонила запрос по своим правилам обработки контента. Проверьте описание и подключённые материалы.';
  } else if (input.httpStatus === 402 || /insufficient[\s\S]*(?:credit|balance|fund)|credit[ _-]?balance.*(?:low|exhaust)/i.test(evidence)) {
    code = 'video_insufficient_balance';
    message = 'Недостаточно средств для генерации видео. Пополните баланс и попробуйте снова.';
  } else if ([401, 403].includes(input.httpStatus ?? 0)) {
    code = 'video_access_denied';
    message = 'Нет доступа к выбранной видеомодели. Проверьте подключение сервиса и доступ к модели в настройках.';
  } else if (input.httpStatus === 404) {
    code = 'video_not_found';
    message = 'Запрос или выбранная модель больше недоступны. Обновите список моделей и проверьте историю запроса.';
  } else if (input.httpStatus === 429) {
    code = 'video_rate_limited';
    message = 'Сервис генерации сейчас перегружен. Подождите немного перед следующей попыткой.';
  } else if ([400, 413, 422].includes(input.httpStatus ?? 0)) {
    code = 'video_invalid_request';
    message = 'Модель отклонила параметры или входные материалы. Проверьте режим, длительность, разрешение и подключённые кадры.';
  }
  return { code, message, httpStatus: input.httpStatus, providerCode, requestId, detail: detail || undefined };
}

function unwrap(value: unknown, depth = 0): { code: string; message: string } {
  if (depth > 6) return { code: '', message: '' };
  if (typeof value === 'string') {
    // OpenRouter can wrap the upstream JSON in an "HTTP 400: {...}" string.
    const start = value.indexOf('{');
    if (start >= 0) {
      try { return unwrap(JSON.parse(value.slice(start)), depth + 1); } catch { /* Plain text below. */ }
    }
    return { code: '', message: value };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { code: '', message: '' };
  const object = value as Record<string, unknown>;
  const nested = unwrap(object.error ?? object.message, depth + 1);
  const code = typeof object.code === 'string' || typeof object.code === 'number' ? String(object.code) : '';
  return { code: nested.code || code, message: nested.message };
}

function sanitize(value: string, secrets: string[]) {
  let result = value;
  for (const secret of secrets.filter(Boolean)) result = result.split(secret).join('[redacted]');
  return result.replace(/data:[^\s"'<>]+/gi, '[image]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
    .replace(/sk-(?:or-)?[a-z0-9_-]+/gi, '[credential]')
    .replace(/bearer\s+[^\s"']+/gi, '[credential]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
}
