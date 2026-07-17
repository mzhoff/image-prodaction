import { LibraryPreview } from '@/pages/library';

interface InterceptedAssetPreviewPageProps {
  params: Promise<{ assetId: string }>;
}

export default async function InterceptedAssetPreviewPage({
  params,
}: InterceptedAssetPreviewPageProps) {
  const { assetId } = await params;
  return <LibraryPreview assetId={assetId} mode="intercepted" />;
}
