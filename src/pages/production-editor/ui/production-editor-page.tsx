import { ProductionCanvas } from '@/widgets/production-canvas/ui/production-canvas';
import { SectionOnboardingProvider } from '@/features/section-onboarding/ui/section-onboarding-provider';

interface ProductionEditorPageProps {
  projectId?: string;
}

export function ProductionEditorPage({ projectId }: ProductionEditorPageProps) {
  return (
    <main className="editor-page">
      <SectionOnboardingProvider><ProductionCanvas key={projectId ?? 'local'} projectId={projectId} /></SectionOnboardingProvider>
    </main>
  );
}
