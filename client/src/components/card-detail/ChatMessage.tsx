import type { ChatMessage as ChatMessageType } from '../../types/models.js';
import { cn } from '../../utils/cn.js';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool_use' || message.role === 'tool_result';

  if (isTool) {
    return (
      <div className="mx-4 my-1 rounded border border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className="text-xs font-mono text-gray-500">
          {message.role === 'tool_use' ? '🔧 ' : '📋 '}
          {message.content.length > 200
            ? message.content.slice(0, 200) + '...'
            : message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-4 my-2',
        isUser ? 'flex justify-end' : '',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2',
          isUser
            ? 'bg-indigo-600 text-white'
            : isSystem
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-white text-gray-800 border border-gray-200',
        )}
      >
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </div>
        {message.cost_usd != null && (
          <div className="mt-1 text-[10px] opacity-60">
            ${message.cost_usd.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}
