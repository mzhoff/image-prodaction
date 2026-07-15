import { ProductionCanvas } from '@/widgets/production-canvas/ui/production-canvas';

interface ProductionEditorPageProps {
  projectId?: string;
}

export function ProductionEditorPage({ projectId }: ProductionEditorPageProps) {
  return (
    <main className="editor-page">
      <ProductionCanvas projectId={projectId} />
    </main>
  );
}
