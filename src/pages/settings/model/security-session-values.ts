import { formatAuthError } from '@/shared/auth/error-message';

export interface SessionInfo {
  id: string;
  token: string;
  createdAt: string | Date;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function isMobileUserAgent(userAgent?: string | null) {
  return /android|iphone|ipad|mobile/i.test(userAgent ?? '');
}

export function formatDevice(userAgent?: string | null) {
  if (!userAgent) return 'Неизвестное устройство';
  if (/iphone|ipad/i.test(userAgent)) return 'Safari на iOS';
  if (/android/i.test(userAgent)) return 'Браузер на Android';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/edg\//i.test(userAgent)) return 'Microsoft Edge';
  if (/chrome/i.test(userAgent)) return 'Google Chrome';
  if (/safari/i.test(userAgent)) return 'Safari';
  return 'Браузер';
}

export function formatSessionDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'неизвестной даты';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatPasswordChangeError(error: unknown) {
  const code = readErrorCode(error);
  if (code === 'INVALID_PASSWORD') return 'Текущий пароль указан неверно.';
  if (code === 'PASSWORD_TOO_SHORT') return 'Новый пароль должен содержать минимум 8 символов.';
  return formatAuthError(error);
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}
