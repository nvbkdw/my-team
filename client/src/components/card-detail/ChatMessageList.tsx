import { useEffect, useRef } from 'react';
import type { ChatMessage as ChatMessageType } from '../../types/models.js';
import ChatMessage from './ChatMessage.js';

interface ChatMessageListProps {
  messages: ChatMessageType[];
  streamingText: string;
}

export default function ChatMessageList({ messages, streamingText }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {messages.length === 0 && !streamingText && (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 px-4">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm">Start a conversation with Claude</p>
          <p className="text-xs">Claude can help write code, fix bugs, and more</p>
        </div>
      )}

      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}

      {streamingText && (
        <div className="mx-4 my-2">
          <div className="max-w-[85%] rounded-lg bg-white border border-gray-200 px-3 py-2">
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed text-gray-800">
              {streamingText}
              <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
