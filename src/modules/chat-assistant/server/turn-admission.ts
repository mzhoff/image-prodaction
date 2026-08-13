import { AgentTurnError, type ChatTurnAdmissionHook } from '@prodactionpro/chat-application';

const WINDOW_MS = 60_000;
const MAX_TURNS_PER_WINDOW = 20;
const buckets = new Map<string, { count: number; startedAt: number }>();

export const admitChatTurn: ChatTurnAdmissionHook = ({ principal }) => {
  const now = Date.now();
  const key = `${principal.productId}:${principal.tenantId}:${principal.userId}`;
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { count: 1, startedAt: now });
    pruneExpiredBuckets(now);
    return;
  }
  if (current.count >= MAX_TURNS_PER_WINDOW) {
    throw new AgentTurnError(
      'Слишком много запросов к ассистенту. Повторите через минуту.',
      'CHAT_RATE_LIMITED',
      429,
      true,
    );
  }
  current.count += 1;
};

function pruneExpiredBuckets(now: number) {
  if (buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(key);
  }
}
