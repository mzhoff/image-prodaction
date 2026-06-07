export function getFallbackName(email: string) {
  const [localPart] = email.trim().split('@');
  return localPart || email.trim();
}

export function getAuthErrorMessage(error: unknown) {
  if (!error) return null;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Не удалось выполнить запрос';
}
