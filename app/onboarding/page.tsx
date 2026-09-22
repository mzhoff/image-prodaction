import { requirePageSession } from '@/modules/authentication/server/auth-session';
import { readOnboarding, safeOnboardingReturn } from '@/modules/user-onboarding/server/onboarding-repository';
import { emptyOnboarding } from '@/shared/onboarding/contract';
import { OnboardingPage } from '@/pages/onboarding/ui/onboarding-page';

export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string; next?: string }> }) {
  const [session, params] = await Promise.all([requirePageSession(), searchParams]);
  const preview = params.preview === '1';
  const initial = preview ? emptyOnboarding(session.user.id, session.user.name) : await readOnboarding(session.user.id, session.user.name);
  if (params.next && !initial.completedAt) initial.returnTo = safeOnboardingReturn(params.next);
  return <OnboardingPage initial={initial} preview={preview} />;
}
