import { ResetPasswordPage } from '@/pages/auth';

interface ResetPasswordRouteProps {
  searchParams: Promise<{ token?: string; error?: string }>;
}

export default async function ResetPasswordRoute({ searchParams }: ResetPasswordRouteProps) {
  const { token, error } = await searchParams;
  return <ResetPasswordPage token={token} linkError={error} />;
}
