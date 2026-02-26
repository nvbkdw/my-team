import { useState, useEffect, useCallback } from 'react';
import type { Card } from '../../types/models.js';
import { useBoardStore } from '../../stores/boardStore.js';
import { useWebSocket } from '../../hooks/useWebSocket.js';
import { useWorkerStore } from '../../stores/workerStore.js';
import BranchInfo from './BranchInfo.js';
import LabelManager from './LabelManager.js';
import SubtaskList from './SubtaskList.js';
import CommentsList from './CommentsList.js';

interface DetailsTabProps {
  card: Card;
}

export default function DetailsTab({ card }: DetailsTabProps) {
  const updateCard = useBoardStore((s) => s.updateCard);
  const { sendMessage } = useWebSocket();
  const [description, setDescription] = useState(card.description);
  const [evalEnvSetup, setEvalEnvSetup] = useState(card.eval_env_setup ?? '');
  const [evalVerification, setEvalVerification] = useState(card.eval_verification ?? '');

  useEffect(() => {
    setDescription(card.description);
  }, [card.description]);

  useEffect(() => {
    setEvalEnvSetup(card.eval_env_setup ?? '');
  }, [card.eval_env_setup]);

  useEffect(() => {
    setEvalVerification(card.eval_verification ?? '');
  }, [card.eval_verification]);

  const handleDescriptionSave = () => {
    if (description !== card.description) {
      updateCard(card.id, { description });
    }
  };

  const handleEvalEnvSetupSave = () => {
    if (evalEnvSetup !== (card.eval_env_setup ?? '')) {
      updateCard(card.id, { eval_env_setup: evalEnvSetup });
    }
  };

  const handleEvalVerificationSave = () => {
    if (evalVerification !== (card.eval_verification ?? '')) {
      updateCard(card.id, { eval_verification: evalVerification });
    }
  };

  const evalStatus = useWorkerStore((s) => s.evalStatuses?.[card.id] ?? 'none');

  const handleRunEval = useCallback(() => {
    sendMessage('eval:run', { cardId: card.id });
  }, [sendMessage, card.id]);

  const [metadataOpen, setMetadataOpen] = useState(true);
  const [evalOpen, setEvalOpen] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Labels */}
      <div className="overflow-y-auto px-6 py-4 space-y-6">
        <LabelManager cardId={card.id} />
      </div>

      {/* Branch info */}
      <div className="overflow-y-auto px-6 py-2">
        <BranchInfo card={card} />
      </div>

      {/* Card metadata — collapsible */}
      <button
        type="button"
        onClick={() => setMetadataOpen((o) => !o)}
        className="flex items-center gap-1.5 px-6 pt-4 pb-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${metadataOpen ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Spec
      </button>

      {metadataOpen && (
        <div className="overflow-y-auto px-6 pb-4 space-y-6">

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionSave}
              placeholder="Add a description..."
              rows={5}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>

          {/* Sub-tasks */}
          <SubtaskList cardId={card.id} section="spec" />
        </div>
      )}

      {/* Evaluation — collapsible */}
      <div className="flex items-center gap-2 px-6 pt-4 pb-2">
        <button
          type="button"
          onClick={() => setEvalOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${evalOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          Evaluation
        </button>
        {evalStatus === 'running' && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Running
          </span>
        )}
        {evalStatus === 'complete' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Complete
          </span>
        )}
        {evalStatus === 'error' && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Error
          </span>
        )}
      </div>

      {evalOpen && (
        <div className="overflow-y-auto px-6 pb-4 space-y-6">

          {/* Environment Setup */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Environment Setup
            </label>
            <textarea
              value={evalEnvSetup}
              onChange={(e) => setEvalEnvSetup(e.target.value)}
              onBlur={handleEvalEnvSetupSave}
              placeholder="Describe how to set up the environment for evaluation..."
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>
          <SubtaskList cardId={card.id} section="eval_env" sectionLabel="Setup Steps" />

          {/* Verification Steps */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Verification Steps
            </label>
            <textarea
              value={evalVerification}
              onChange={(e) => setEvalVerification(e.target.value)}
              onBlur={handleEvalVerificationSave}
              placeholder="Describe what to verify and expected outcomes..."
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
            />
          </div>
          <SubtaskList cardId={card.id} section="eval_verify" sectionLabel="Verification Checklist" />

          {/* Run Evaluation button */}
          <button
            type="button"
            onClick={handleRunEval}
            disabled={evalStatus === 'running'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {evalStatus === 'running' ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Running Evaluation...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run Evaluation
              </>
            )}
          </button>
        </div>
      )}

      {/* Comments — fills remaining space, input pinned at bottom */}
      <CommentsList cardId={card.id} />
    </div>
  );
}
