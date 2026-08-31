import type {
  ChatLaunchRequest,
  ChatLaunchResult,
  ChatLauncher,
} from '@prodactionpro/chat-runtime-core';
import { buildNodeAskAiDraft } from '@/entities/production-graph/model/node-help';
import type { ProductionNode } from '@/entities/production-graph/model/types';

export type NodeAskAiLaunchResult = ChatLaunchResult | {
  sourceId: string;
  status: 'queued';
};

export interface NodeAskAiLaunchCoordinator {
  cancelPending: () => void;
  open: (request: ChatLaunchRequest) => Promise<NodeAskAiLaunchResult>;
  register: (launcher: ChatLauncher) => () => void;
}

export function createNodeAskAiLaunchRequest(
  node: Pick<ProductionNode, 'id' | 'type'>,
): ChatLaunchRequest {
  return {
    message: {
      delivery: 'draft',
      text: buildNodeAskAiDraft(node.type),
    },
    sourceId: `production-canvas.node.ask-ai:${node.id}`,
  };
}

export function createNodeAskAiLaunchCoordinator(
  openSurface: () => void | Promise<void>,
): NodeAskAiLaunchCoordinator {
  let launcher: ChatLauncher | undefined;
  let pendingDeliveryInFlight = false;
  let pendingDeliveryRequested = false;
  let pendingRequest: ChatLaunchRequest | undefined;
  const getLauncher = () => launcher;

  const deliverPending = (nextLauncher: ChatLauncher) => {
    if (!pendingRequest) return;
    if (pendingDeliveryInFlight) {
      pendingDeliveryRequested = true;
      return;
    }
    pendingDeliveryInFlight = true;
    const request = pendingRequest;
    void nextLauncher.open(request)
      .then((result) => {
        if (pendingRequest !== request) return;
        if (result.status === 'blocked' && result.reason === 'busy') return;
        pendingRequest = undefined;
      })
      .catch(() => {
        if (pendingRequest === request) pendingRequest = undefined;
      })
      .finally(() => {
        pendingDeliveryInFlight = false;
        if (!pendingDeliveryRequested) return;
        pendingDeliveryRequested = false;
        const activeLauncher = getLauncher();
        if (activeLauncher) deliverPending(activeLauncher);
      });
  };

  const register = (nextLauncher: ChatLauncher) => {
    launcher = nextLauncher;
    deliverPending(nextLauncher);
    return () => {
      if (launcher === nextLauncher) launcher = undefined;
    };
  };

  const cancelPending = () => {
    pendingRequest = undefined;
    pendingDeliveryRequested = false;
  };

  const open = async (request: ChatLaunchRequest): Promise<NodeAskAiLaunchResult> => {
    const currentLauncher = getLauncher();
    if (currentLauncher) return currentLauncher.open(request);
    await openSurface();
    const openedLauncher = getLauncher();
    if (openedLauncher) return openedLauncher.open(request);
    if (!pendingRequest) {
      pendingRequest = request;
      return { sourceId: request.sourceId, status: 'queued' };
    }
    if (sameLaunchRequest(pendingRequest, request)) {
      return { sourceId: request.sourceId, status: 'queued' };
    }
    return {
      reason: 'draft-conflict',
      sourceId: request.sourceId,
      status: 'blocked',
    };
  };

  return { cancelPending, open, register };
}

export function getNodeAskAiLaunchNotice(result: NodeAskAiLaunchResult) {
  if (result.status === 'queued') {
    return 'Ассистент загружается — вопрос появится после загрузки, если composer свободен.';
  }
  if (result.status !== 'blocked') return undefined;
  return result.reason === 'busy'
    ? 'Ассистент ещё отвечает. Дождитесь завершения и повторите Ask AI.'
    : 'В чате уже есть черновик или вложение. Ask AI ничего не заменил.';
}

function sameLaunchRequest(left: ChatLaunchRequest, right: ChatLaunchRequest) {
  return left.sourceId === right.sourceId
    && left.message.text === right.message.text
    && (left.message.delivery ?? 'draft') === (right.message.delivery ?? 'draft');
}
