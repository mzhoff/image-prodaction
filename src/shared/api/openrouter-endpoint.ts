const DEFAULT_BASE = 'https://openrouter.ai/api/v1';

/** Operator-owned transport setting; never accepts a browser or Workspace URL. */
export function getOpenRouterBaseUrl(env: Record<string, string | undefined> = process.env) {
  const raw = env.OPENROUTER_BASE_URL?.trim();
  if (!raw) return DEFAULT_BASE;
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid OPENROUTER_BASE_URL'); }
  const octets = url.hostname.split('.').map(Number);
  const ipv4 = octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
  const privateHost = (ipv4 && (octets[0] === 127 || octets[0] === 10
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)))
    || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.username || url.password || url.search || url.hash
    || (url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost))) {
    throw new Error('OPENROUTER_BASE_URL requires HTTPS or a private tunnel endpoint');
  }
  return url.href.replace(/\/+$/, '');
}
