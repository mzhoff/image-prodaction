import { connection } from 'next/server';
import { readAnalyticsConfig } from '@/shared/analytics/config';
import { BehavioralAnalyticsClient } from './behavioral-analytics';

export async function AnalyticsRuntime() {
  // Read deployment configuration at request time, never bake a beta ID into a build.
  await connection();
  return <BehavioralAnalyticsClient config={readAnalyticsConfig(process.env)} />;
}
