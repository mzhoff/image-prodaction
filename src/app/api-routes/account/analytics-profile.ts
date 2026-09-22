import { requireApiSession } from '@/modules/authentication/server/auth-session';
import { readOnboarding } from '@/modules/user-onboarding/server/onboarding-repository';
import { projectAnalyticsAudience } from '@/shared/analytics/audience';
import { toApiErrorResponse } from '../error-response';

export async function accountAnalyticsProfile(request: Request) {
  try {
    const session = await requireApiSession(request);
    const profile = await readOnboarding(session.user.id);
    // Identity and categories come from the authenticated backend, never request parameters.
    return Response.json(projectAnalyticsAudience(session.user.id, profile), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return toApiErrorResponse(error); }
}
