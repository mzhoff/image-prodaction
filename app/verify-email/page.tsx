import { VerifyEmailPage } from '@/pages/auth';
import { getRequestSession } from '@/shared/auth/session';

interface VerifyEmailRouteProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function VerifyEmailRoute({ searchParams }: VerifyEmailRouteProps) {
  const [{ error }, session] = await Promise.all([searchParams, getRequestSession()]);
  return <VerifyEmailPage error={error} verified={Boolean(session?.user.emailVerified)} />;
}
