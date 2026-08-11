import { WorkspacePage } from '@/pages/workspace/ui/workspace-page';
import { redirect } from 'next/navigation';

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const sectionParam = (await searchParams)?.section;
  const sectionValue = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  if (sectionValue === 'trash' || sectionValue === 'pipelines') redirect(`/${sectionValue}`);

  return <WorkspacePage />;
}
