import { PipelinePlaygroundPage } from '@/pages/pipeline-playground';

interface PlaygroundPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlaygroundPage({ searchParams }: PlaygroundPageProps) {
  const endpointParam = (await searchParams)?.endpoint;
  const initialEndpoint = Array.isArray(endpointParam) ? endpointParam[0] : endpointParam;
  return <PipelinePlaygroundPage initialEndpoint={initialEndpoint ?? ''} />;
}
