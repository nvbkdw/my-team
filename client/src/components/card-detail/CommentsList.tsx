import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../api/client.js';
import { useWorkerStore } from '../../stores/workerStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import type { CardComment } from '../../types/models.js';
import WorkerStatusBadge from './WorkerStatusBadge.js';
import StreamingIndicator from './StreamingIndicator.js';
import Button from '../ui/Button.js';
import { cn } from '../../utils/cn.js';

interface CommentsListProps {
  cardId: string;
}

const authorStyles = {
  user: 'bg-white border-gray-200',
  claude: 'bg-indigo-50 border-indigo-200',
  system: 'bg-amber-50 border-amber-200',
};

export default function CommentsList({ cardId }: CommentsListProps) {
  const [comments, setComments] = useState<CardComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { sendChatMessage, abortChat } = useWebSocket();

  const workerStatus = useWorkerStore((s) => s.statuses[cardId] || 'none');
  const streaming = useWorkerStore((s) => s.isStreaming[cardId] || false);
  const streamingText = useWorkerStore((s) => s.streamingText[cardId] || '');
  const commentsVersion = useWorkerStore((s) => s.commentsVersion[cardId] || 0);

  const hasWorker = workerStatus !== 'none';

  const loadComments = useCallback(async () => {
    try {
      const data = await apiFetch<CardComment[]>(`/cards/${cardId}/comments`);
      setComments(data);
    } catch {
      // Comments endpoint might not exist yet
    }
  }, [cardId]);

  // Load comments on mount and when cardId changes
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Re-fetch when commentsVersion changes (Claude finished responding)
  useEffect(() => {
    if (commentsVersion > 0) {
      loadComments();
    }
  }, [commentsVersion, loadComments]);

  // Auto-scroll on new comments or streaming text
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length, streamingText]);

  const handleSubmitToWorker = () => {
    if (!newComment.trim()) return;
    const text = newComment.trim();

    // Optimistic: add user comment locally
    const optimistic: CardComment = {
      id: `optimistic-${Date.now()}`,
      card_id: cardId,
      author: 'user',
      body: text,
      created_at: new Date().toISOString(),
    };
    setComments((prev) => [...prev, optimistic]);
    setNewComment('');

    sendChatMessage(cardId, text);
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const comment = await apiFetch<CardComment>(`/cards/${cardId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ author: 'user', body: newComment.trim() }),
      });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch {
      // Handle error silently
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    try {
      await apiFetch(`/cards/${cardId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch {
      // Handle error silently
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (hasWorker && workerStatus === 'idle') {
        handleSubmitToWorker();
      } else if (!hasWorker) {
        handleSubmitComment();
      }
    }
  };

  const handleSend = () => {
    if (hasWorker && workerStatus === 'idle') {
      handleSubmitToWorker();
    } else {
      handleSubmitComment();
    }
  };

  const inputDisabled = streaming || submitting;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Comments</h4>
        {hasWorker && <WorkerStatusBadge cardId={cardId} />}
      </div>

      {/* Comments list */}
      <div ref={scrollRef} className="max-h-80 overflow-y-auto space-y-3">
        {comments.length === 0 && !streaming && (
          <p className="text-xs text-gray-400">No comments yet</p>
        )}

        {comments.map((comment) => (
          <div
            key={comment.id}
            className={cn(
              'rounded-lg border p-3',
              authorStyles[comment.author] || authorStyles.user,
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600 capitalize">
                {comment.author}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
                {comment.author === 'user' && !comment.id.startsWith('optimistic-') && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-[10px] text-red-400 hover:text-red-600"
                  >
                    delete
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
              {comment.body}
            </p>
          </div>
        ))}

        {/* Streaming Claude response bubble */}
        {streaming && (
          <div className={cn('rounded-lg border p-3', authorStyles.claude)}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-600">claude</span>
            </div>
            {streamingText ? (
              <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">
                {streamingText}
              </p>
            ) : (
              <StreamingIndicator />
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasWorker ? 'Ask Claude...' : 'Add a comment...'}
          rows={2}
          disabled={inputDisabled}
          className={cn(
            'flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none',
            inputDisabled && 'bg-gray-50 text-gray-400 cursor-not-allowed',
          )}
        />
        {streaming ? (
          <Button
            variant="danger"
            size="sm"
            onClick={() => abortChat(cardId)}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSend}
            disabled={inputDisabled || !newComment.trim()}
          >
            {submitting ? '...' : hasWorker && workerStatus === 'idle' ? 'Ask Claude' : 'Post'}
          </Button>
        )}
      </div>
    </div>
  );
}
