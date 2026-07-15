import { ProductionEditorPage } from '@/pages/production-editor/ui/production-editor-page';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  return <ProductionEditorPage projectId={projectId} />;
}
