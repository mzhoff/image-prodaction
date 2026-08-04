import { getPipelineWorkerHealth } from '@/app/api-routes/health/pipeline-worker';

export const runtime = 'nodejs';

export function GET() {
  return getPipelineWorkerHealth();
}
