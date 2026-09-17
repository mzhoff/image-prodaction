export const USAGE_CATEGORIES = ['image', 'text', 'audio', 'video', 'assistant', 'other'] as const;
export type UsageCategory = typeof USAGE_CATEGORIES[number];
export const USAGE_CATEGORY_LABELS: Record<UsageCategory, string> = {
  image: 'Изображения', text: 'Текст', audio: 'Голос и аудио', video: 'Видео', assistant: 'Ассистент', other: 'Анализ и прочее',
};
export interface UsageMeasures {
  requests: number; succeeded: number; failed: number; unconfirmed: number;
  inputTokens: string | null; outputTokens: string | null; totalTokens: string | null; costUsd: string | null;
  unknownCostRequests: number; unknownTokenRequests: number;
  images: number; texts: number; audio: number; video: number;
}
export interface UsageDashboardRow extends UsageMeasures {
  day: string; provider: string; modelId: string; category: UsageCategory;
}
export interface UsagePeriod {
  from: string; to: string; timezone: 'Europe/Moscow' | 'UTC'; start: string; end: string;
}
export interface UsageDashboardData {
  workspaceId: string; generatedAt: string; period: UsagePeriod; rows: UsageDashboardRow[];
  comparison: UsageComparisonWindow & { rows: UsageDashboardRow[] };
}
export interface UsageComparisonWindow {
  period: UsagePeriod;
  currentThrough: string;
  previousThrough: string;
  partial: boolean;
  available: boolean;
}
export type UsagePreset = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'custom';
export type UsageGrain = 'day' | 'week' | 'month';
