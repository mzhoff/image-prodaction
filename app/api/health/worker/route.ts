import { getGenerationWorkerHealth } from '@/app/api-routes/health/worker';

export const runtime = 'nodejs';

export function GET() {
  return getGenerationWorkerHealth();
}
