import { cn } from '@/shared/lib/cn';
import type { InputConnectionStatus } from '../lib/input-connection-status';

export function InputConnectionBadge({ status }: { status: InputConnectionStatus }) {
  return <span
    className={cn('input-pill', `input-pill-${status.state}`, `input-pill-data-${status.kind}`)}
    title={status.label}
  >{status.label}</span>;
}
