/** Persist only a request digest and random key, never the prompt or attachment contents. */
export async function homeVideoAttemptKey(conversationId: string, signature: string, fallback: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  try {
    const key = `production:home-video-attempt:${conversationId}`;
    const previous = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (previous?.hash === hash && typeof previous?.id === 'string') return previous.id as string;
    sessionStorage.setItem(key, JSON.stringify({ hash, id: fallback }));
  } catch { /* Private browser settings may disable session storage; in-memory retry still works. */ }
  return fallback;
}

export function clearHomeVideoAttempt(conversationId: string) {
  try { sessionStorage.removeItem(`production:home-video-attempt:${conversationId}`); } catch { /* Optional persistence. */ }
}
