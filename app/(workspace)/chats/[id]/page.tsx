import { ProductionConversationPage } from '@/pages/workspace/ui/production-conversation-page';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProductionConversationPage id={(await params).id} />;
}
