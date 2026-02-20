import { useEffect, useCallback } from 'react';
import { useWorkerStore } from '../stores/workerStore.js';

let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let subscribers = 0;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 10000;

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function scheduleReconnect(): void {
  if (reconnectTimer || subscribers <= 0) return;

  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);
  reconnectAttempt++;
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (subscribers > 0 && !globalWs) {
      globalWs = createConnection();
    }
  }, delay);
}

function createConnection(): WebSocket {
  const url = getWsUrl();
  console.log('[WS] Connecting to', url);
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('[WS] Connected');
    reconnectAttempt = 0;
  };

  ws.onclose = (event) => {
    console.log('[WS] Disconnected, code:', event.code, 'reason:', event.reason);
    globalWs = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    console.warn('[WS] Connection error (close event will follow)');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      dispatchMessage(msg);
    } catch {
      console.warn('[WS] Failed to parse message:', event.data);
    }
  };

  return ws;
}

function dispatchMessage(msg: Record<string, unknown>) {
  const cardId = msg.cardId as string | undefined;

  switch (msg.type) {
    case 'chat:token':
      if (cardId) {
        useWorkerStore.getState().setIsStreaming(cardId, true);
        useWorkerStore.getState().appendStreamingText(cardId, msg.text as string);
      }
      break;

    case 'chat:message_complete':
      if (cardId) {
        useWorkerStore.getState().clearStreaming(cardId);
        useWorkerStore.getState().notifyCommentsChanged(cardId);
      }
      break;

    case 'chat:error':
      console.warn('[WS] Chat error:', msg.error);
      if (cardId) {
        useWorkerStore.getState().clearStreaming(cardId);
      }
      break;

    case 'chat:tool_use':
      console.log('[WS] Tool use:', msg.name);
      break;

    case 'status':
      if (cardId) {
        useWorkerStore.getState().setWorkerStatus(
          cardId,
          msg.status as 'idle' | 'running' | 'error',
          msg.error as string | undefined
        );
      }
      break;

    case 'worker:statuses':
      useWorkerStore.getState().setAllStatuses(
        msg.statuses as Record<string, { status: string }>
      );
      break;

    case 'worker:exit':
      if (cardId) {
        useWorkerStore.getState().removeWorker(cardId);
      }
      break;

    case 'files:changed':
      console.log('[WS] Files changed:', msg.files);
      break;

    case 'pong':
      break;

    case 'error':
      console.warn('[WS] Server error:', msg.error);
      break;

    default:
      console.log('[WS] Unknown message type:', msg.type, msg);
  }
}

export function useWebSocket() {
  useEffect(() => {
    subscribers++;
    console.log('[WS] Hook mounted, subscribers:', subscribers);

    if (!globalWs || globalWs.readyState === WebSocket.CLOSED || globalWs.readyState === WebSocket.CLOSING) {
      globalWs = createConnection();
    }

    return () => {
      subscribers--;
      console.log('[WS] Hook unmounted, subscribers:', subscribers);
      setTimeout(() => {
        if (subscribers <= 0) {
          subscribers = 0;
          reconnectAttempt = 0;
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (globalWs) {
            console.log('[WS] Closing connection (no subscribers)');
            globalWs.close();
            globalWs = null;
          }
        }
      }, 100);
    };
  }, []);

  const sendMessage = useCallback((type: string, data: Record<string, unknown>) => {
    if (globalWs?.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ type, ...data });
      console.log('[WS] Sending:', payload);
      globalWs.send(payload);
    } else {
      console.warn('[WS] Cannot send, connection not open. readyState:', globalWs?.readyState);
    }
  }, []);

  const sendChatMessage = useCallback(
    (cardId: string, message: string) => {
      sendMessage('chat:send', { cardId, message });
    },
    [sendMessage]
  );

  const abortChat = useCallback(
    (cardId: string) => {
      sendMessage('chat:abort', { cardId });
    },
    [sendMessage]
  );

  return { sendChatMessage, abortChat, sendMessage };
}
