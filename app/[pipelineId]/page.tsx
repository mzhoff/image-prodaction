import { ProductionEditorPage } from '@/pages/production-editor/ui/production-editor-page';
import { requirePageSession } from '@/shared/auth/require-page-session';

export default async function PipelinePage() {
  await requirePageSession();

  return <ProductionEditorPage />;
}
