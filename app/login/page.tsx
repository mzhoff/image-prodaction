import { AuthPage } from '@/pages/auth';
import { readAuthAccessPolicyConfig } from '@/shared/auth/config';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ identity_error?: string; identity_method?: string }> }) {
  const { allowSignUp } = readAuthAccessPolicyConfig();
  const params = await searchParams;
  const termsMethod = params.identity_error === 'terms_required' ? (params.identity_method === 'telegram' ? 'telegram' : 'email') : undefined;
  return <AuthPage identityTermsMethod={termsMethod} identityEmailEnabled={process.env.REVERIE_IDENTITY_EMAIL_ENABLED !== 'false'} identityEnabled={Boolean(process.env.REVERIE_IDENTITY_ISSUER)} mode="login" allowRegistration={allowSignUp} />;
}
