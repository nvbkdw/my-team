import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client.js';
import type { CardComment } from '../../types/models.js';
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

  useEffect(() => {
    loadComments();
  }, [cardId]);

  const loadComments = async () => {
    try {
      const data = await apiFetch<CardComment[]>(`/cards/${cardId}/comments`);
      setComments(data);
    } catch {
      // Comments endpoint might not exist yet
    }
  };

  const handleSubmit = async () => {
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

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700">Comments</h4>

      {comments.length === 0 && (
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
              {comment.author === 'user' && (
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

      {/* New comment input */}
      <div className="flex gap-2">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={submitting || !newComment.trim()}
        >
          {submitting ? '...' : 'Post'}
        </Button>
      </div>
    </div>
  );
}
