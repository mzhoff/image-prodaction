import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/pages/workspace/ui/workspace-shell';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}
