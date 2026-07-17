import { notFound } from 'next/navigation';
import { isSettingsSection, SettingsPage } from '@/pages/settings';
import { requirePageSession } from '@/shared/auth/session';

interface SettingsRouteProps {
  params: Promise<{ section: string }>;
}

export default async function SettingsRoute({ params }: SettingsRouteProps) {
  const [{ section }] = await Promise.all([params, requirePageSession()]);
  if (!isSettingsSection(section)) notFound();
  return <SettingsPage section={section} />;
}
