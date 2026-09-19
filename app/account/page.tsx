import Link from 'next/link';
import { IdentityActions } from '@reverie/identity-client/react';
import { requirePageSession } from '@/modules/authentication/server/auth-session';
export const dynamic = 'force-dynamic';
export default async function AccountPage() {
  await requirePageSession();
  const issuer = process.env.REVERIE_IDENTITY_ISSUER;
  return <main className="account-bridge"><Link href="/">← Image Production</Link><h1>Аккаунт Reverie</h1>{issuer ? <IdentityActions authPath="/api/auth" intent="link" accountURL={new URL('/account', issuer).toString()} /> : <p>Общий вход ещё не подключён в этой среде.</p>}<div className="account-bridge-links"><Link href="/settings/account">Настройки Image Production</Link><Link href="/usage">Использование</Link></div></main>;
}
