import { AuthPage } from '@/pages/auth';
import { readAuthAccessPolicyConfig } from '@/shared/auth/config';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const { allowSignUp } = readAuthAccessPolicyConfig();
  return <AuthPage mode="login" allowRegistration={allowSignUp} />;
}
