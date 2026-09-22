import { ProductionHomePage } from '@/pages/workspace/ui/production-home-page';
import { redirect } from 'next/navigation';

interface HomePageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const create = params?.create;
  if (typeof create === 'string' && ['text', 'image', 'video', 'storyboard', 'timeline', 'flow'].includes(create)) {
    const next = new URLSearchParams({ type: create });
    if (typeof params?.story === 'string') next.set('document', params.story);
    if (typeof params?.chat === 'string') next.set('chat', params.chat);
    redirect(`/create?${next}`);
  }
  const sectionParam = params?.section;
  const sectionValue = Array.isArray(sectionParam) ? sectionParam[0] : sectionParam;
  if (sectionValue === 'trash' || sectionValue === 'pipelines') redirect(`/${sectionValue}`);
  const legacyKeys = ['folderId', 'scope', 'favorites', 'executable', 'q', 'view'];
  if (params && legacyKeys.some((key) => params[key] !== undefined)) {
    const query = new URLSearchParams();
    for (const key of legacyKeys) {
      const value = params[key];
      if (typeof value === 'string') query.set(key, value);
    }
    redirect(`/flows?${query}`);
  }
  return <ProductionHomePage />;
}
