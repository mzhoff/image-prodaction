import { PipelineIndexPage } from '@/pages/production-editor/ui/pipeline-index-page';
import { requirePageSession } from '@/shared/auth/require-page-session';

export default async function Home() {
  await requirePageSession();

  return <PipelineIndexPage />;
}
