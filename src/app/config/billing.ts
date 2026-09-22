import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePublicBillingConfig } from '@/shared/billing/catalog';

export async function readPublicBillingConfig() {
  const path = process.env.REVERIE_BILLING_PUBLIC_CONFIG_FILE
    || (process.env.NODE_ENV === 'development' ? join(process.cwd(), 'src/app/config/billing.local.json') : undefined);
  if (!path) return parsePublicBillingConfig(null);
  try { return parsePublicBillingConfig(JSON.parse(await readFile(path, 'utf8'))); }
  catch { return parsePublicBillingConfig(null); }
}
