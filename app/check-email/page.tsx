import { CheckEmailPage } from '@/pages/auth';

interface CheckEmailRouteProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function CheckEmailRoute({ searchParams }: CheckEmailRouteProps) {
  const { email } = await searchParams;
  return <CheckEmailPage email={email?.trim() ?? ''} />;
}
