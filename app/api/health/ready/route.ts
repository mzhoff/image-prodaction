import { getReadiness } from '@/app/api-routes/health/readiness';

export const runtime = 'nodejs';

export function GET() {
  return getReadiness();
}
