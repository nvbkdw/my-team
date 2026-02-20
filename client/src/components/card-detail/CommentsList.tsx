import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../../api/client.js';
import { useWorkerStore } from '../../stores/workerStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import type { CardComment } from '../../types/models.js';
import WorkerStatusBadge from './WorkerStatusBadge.js';
import StreamingIndicator from './StreamingIndicator.js';
import Button from '../ui/Button.js';
import MarkdownContent from '../ui/MarkdownContent.js';
import { cn } from '../../utils/cn.js';

interface CommentsListProps {
  cardId: string;
}

const authorStyles = {
  user: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  claude: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800',
  system: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',
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
    <div className="flex flex-col flex-1 min-h-0 border-t border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Comments</h4>
        {hasWorker && <WorkerStatusBadge cardId={cardId} />}
      </div>

      {/* Comments list — scrollable */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} className="h-full overflow-y-auto px-6 space-y-3 pb-6">
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
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 capitalize">
                  {comment.author}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
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
              <MarkdownContent className="mt-1">{comment.body}</MarkdownContent>
            </div>
          ))}

          {/* Streaming Claude response bubble */}
          {streaming && (
            <div className={cn('rounded-lg border p-3', authorStyles.claude)}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">claude</span>
              </div>
              {streamingText ? (
                <MarkdownContent className="mt-1">{streamingText}</MarkdownContent>
              ) : (
                <StreamingIndicator />
              )}
            </div>
          )}
        </div>
        {/* Fade overlay at bottom of scroll area */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
      </div>

      {/* Input area — pinned at bottom */}
      <div className="flex gap-2 px-6 py-3">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasWorker ? 'Ask Claude...' : 'Add a comment...'}
          rows={2}
          disabled={inputDisabled}
          className={cn(
            'flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none',
            inputDisabled && 'bg-gray-50 dark:bg-gray-900 text-gray-400 cursor-not-allowed',
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
