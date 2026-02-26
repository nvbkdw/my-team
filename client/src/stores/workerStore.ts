import { create } from 'zustand';

type WorkerStatus = 'none' | 'idle' | 'running' | 'error';
type EvalStatus = 'none' | 'running' | 'complete' | 'error';

interface WorkerState {
  statuses: Record<string, WorkerStatus>;
  errors: Record<string, string>;
  streamingText: Record<string, string>;
  isStreaming: Record<string, boolean>;
  commentsVersion: Record<string, number>;
  evalStatuses: Record<string, EvalStatus>;

  setWorkerStatus: (cardId: string, status: WorkerStatus, error?: string) => void;
  setAllStatuses: (statuses: Record<string, { status: string }>) => void;
  removeWorker: (cardId: string) => void;
  getStatus: (cardId: string) => WorkerStatus;
  setIsStreaming: (cardId: string, val: boolean) => void;
  appendStreamingText: (cardId: string, text: string) => void;
  clearStreaming: (cardId: string) => void;
  notifyCommentsChanged: (cardId: string) => void;
  setEvalStatus: (cardId: string, status: EvalStatus) => void;
}

export const useWorkerStore = create<WorkerState>((set, get) => ({
  statuses: {},
  errors: {},
  streamingText: {},
  isStreaming: {},
  commentsVersion: {},
  evalStatuses: {},

  setWorkerStatus: (cardId: string, status: WorkerStatus, error?: string) => {
    set((s) => ({
      statuses: { ...s.statuses, [cardId]: status },
      errors: error ? { ...s.errors, [cardId]: error } : s.errors,
    }));
  },

  setAllStatuses: (statuses: Record<string, { status: string }>) => {
    const mapped: Record<string, WorkerStatus> = {};
    for (const [cardId, info] of Object.entries(statuses)) {
      mapped[cardId] = info.status as WorkerStatus;
    }
    set({ statuses: mapped });
  },

  removeWorker: (cardId: string) => {
    set((s) => {
      const { [cardId]: _, ...restStatuses } = s.statuses;
      const { [cardId]: __, ...restErrors } = s.errors;
      const { [cardId]: ___, ...restStreaming } = s.streamingText;
      const { [cardId]: ____, ...restIsStreaming } = s.isStreaming;
      const { [cardId]: _____, ...restVersions } = s.commentsVersion;
      return {
        statuses: restStatuses,
        errors: restErrors,
        streamingText: restStreaming,
        isStreaming: restIsStreaming,
        commentsVersion: restVersions,
      };
    });
  },

  getStatus: (cardId: string) => {
    return get().statuses[cardId] || 'none';
  },

  setIsStreaming: (cardId: string, val: boolean) => {
    set((s) => ({
      isStreaming: { ...s.isStreaming, [cardId]: val },
      ...(val ? { streamingText: { ...s.streamingText, [cardId]: '' } } : {}),
    }));
  },

  appendStreamingText: (cardId: string, text: string) => {
    set((s) => ({
      streamingText: {
        ...s.streamingText,
        [cardId]: (s.streamingText[cardId] || '') + text,
      },
    }));
  },

  clearStreaming: (cardId: string) => {
    set((s) => ({
      streamingText: { ...s.streamingText, [cardId]: '' },
      isStreaming: { ...s.isStreaming, [cardId]: false },
    }));
  },

  notifyCommentsChanged: (cardId: string) => {
    set((s) => ({
      commentsVersion: {
        ...s.commentsVersion,
        [cardId]: (s.commentsVersion[cardId] || 0) + 1,
      },
    }));
  },

  setEvalStatus: (cardId: string, status: EvalStatus) => {
    set((s) => ({
      evalStatuses: { ...s.evalStatuses, [cardId]: status },
    }));
  },
}));
