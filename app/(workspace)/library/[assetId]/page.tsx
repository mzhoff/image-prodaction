import { LibraryPage, LibraryPreview } from '@/pages/library';

interface DirectAssetPreviewPageProps {
  params: Promise<{ assetId: string }>;
}

export default async function DirectAssetPreviewPage({ params }: DirectAssetPreviewPageProps) {
  const { assetId } = await params;
  return (
    <>
      <LibraryPage />
      <LibraryPreview assetId={assetId} mode="direct" />
    </>
  );
}
