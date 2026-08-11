export interface ChatScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

const DEFAULT_BOTTOM_THRESHOLD = 48;

export function isChatThreadNearBottom(
  metrics: ChatScrollMetrics,
  threshold = DEFAULT_BOTTOM_THRESHOLD,
) {
  const remaining = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return remaining <= threshold;
}
