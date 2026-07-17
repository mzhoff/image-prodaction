import { redirect } from 'next/navigation';
import { AuthPage } from '@/pages/auth';
import { readAuthAccessPolicyConfig } from '@/shared/auth/config';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  if (!readAuthAccessPolicyConfig().allowSignUp) redirect('/login');
  return <AuthPage mode="register" />;
}
