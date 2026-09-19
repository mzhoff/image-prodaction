import { AuthPage } from '@/pages/auth';
import { readAuthAccessPolicyConfig } from '@/shared/auth/config';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const { allowSignUp } = readAuthAccessPolicyConfig();
  return <AuthPage identityEmailEnabled={process.env.REVERIE_IDENTITY_EMAIL_ENABLED !== 'false'} identityEnabled={Boolean(process.env.REVERIE_IDENTITY_ISSUER)} mode="login" allowRegistration={allowSignUp} />;
}
