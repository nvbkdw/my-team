import { useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';
import { useWorkerStore } from '../../stores/workerStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import ChatMessageList from './ChatMessageList.js';
import ChatInput from './ChatInput.js';
import StreamingIndicator from './StreamingIndicator.js';
import WorkerStatusBadge from './WorkerStatusBadge.js';
import * as chatApi from '../../api/chats.js';
import type { ChatMessage } from '../../types/models.js';

interface AIChatTabProps {
  cardId: string;
}

export default function AIChatTab({ cardId }: AIChatTabProps) {
  const { sendChatMessage, abortChat } = useWebSocket();

  const sessions = useChatStore((s) => s.sessions[cardId] || []);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const messages = useChatStore((s) =>
    activeSessionId ? s.messages[activeSessionId] || [] : []
  );
  const streamingText = useChatStore((s) => s.streamingText);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const createSession = useChatStore((s) => s.createSession);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const fetchMessages = useChatStore((s) => s.fetchMessages);
  const addMessage = useChatStore((s) => s.addMessage);

  const workerStatus = useWorkerStore((s) => s.statuses[cardId] || 'none');

  useEffect(() => {
    fetchSessions(cardId);
  }, [cardId, fetchSessions]);

  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      const latest = sessions[sessions.length - 1];
      setActiveSession(latest.id);
      fetchMessages(latest.id);
    }
  }, [sessions, activeSessionId, setActiveSession, fetchMessages]);

  const handleSend = async (message: string) => {
    let sessionId = activeSessionId;

    if (!sessionId) {
      const session = await createSession(cardId);
      sessionId = session.id;
    }

    // Add user message to local state and persist
    const userMsg: ChatMessage = {
      id: Date.now(),
      session_id: sessionId,
      role: 'user',
      content: message,
      cost_usd: null,
      created_at: new Date().toISOString(),
    };
    addMessage(sessionId, userMsg);

    // Persist user message
    await chatApi.addMessage(sessionId, { role: 'user', content: message });

    // Send via WebSocket to worker
    sendChatMessage(cardId, message);
  };

  const handleAbort = () => {
    abortChat(cardId);
  };

  const noWorker = workerStatus === 'none';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-sm font-medium text-gray-700">AI Assistant</span>
        <WorkerStatusBadge cardId={cardId} />
      </div>

      {noWorker ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400 px-4">
          <p className="text-sm">No worker running for this card</p>
          <p className="text-xs">Move card to "In Progress" to start a Claude session</p>
        </div>
      ) : (
        <>
          <ChatMessageList messages={messages} streamingText={streamingText} />
          {isStreaming && !streamingText && <StreamingIndicator />}
          <ChatInput
            onSend={handleSend}
            onAbort={handleAbort}
            isStreaming={isStreaming}
            disabled={noWorker}
          />
        </>
      )}
    </div>
  );
}
