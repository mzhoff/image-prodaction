export function formatAuthError(error: unknown) {
  const code = readAuthErrorCode(error);
  const status = readAuthErrorStatus(error);

  if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
    return 'Аккаунт с таким email уже существует.';
  }
  if (code === 'INVALID_EMAIL_OR_PASSWORD') return 'Неверный email или пароль.';
  if (code === 'TOO_MANY_REQUESTS' || status === 429) {
    return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
  }

  return 'Не удалось выполнить запрос. Проверьте данные и попробуйте ещё раз.';
}

function readAuthErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '').toUpperCase();
}

function readAuthErrorStatus(error: unknown) {
  if (typeof error !== 'object' || !error) return undefined;
  if ('status' in error && typeof error.status === 'number') return error.status;
  if ('statusCode' in error && typeof error.statusCode === 'number') return error.statusCode;
  return undefined;
}
