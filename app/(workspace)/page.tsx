import { WorkspacePage } from '@/pages/workspace/ui/workspace-page';

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const sectionParam = (await searchParams)?.section;
  const sectionValue = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  const section = sectionValue === 'trash' || sectionValue === 'pipelines'
    ? sectionValue
    : 'my-files';

  return <WorkspacePage section={section} />;
}
