import { create } from 'zustand';

type WorkerStatus = 'none' | 'idle' | 'running' | 'error';
type EvalStatus = 'none' | 'running' | 'complete' | 'error';
type PRStatus = 'none' | 'running' | 'complete' | 'error';

interface PRStepInfo {
  step: string;
  message: string;
}

interface WorkerState {
  statuses: Record<string, WorkerStatus>;
  errors: Record<string, string>;
  streamingText: Record<string, string>;
  isStreaming: Record<string, boolean>;
  commentsVersion: Record<string, number>;
  evalStatuses: Record<string, EvalStatus>;
  prStatuses: Record<string, PRStatus>;
  prSteps: Record<string, PRStepInfo>;
  prErrors: Record<string, string>;

  setWorkerStatus: (cardId: string, status: WorkerStatus, error?: string) => void;
  setAllStatuses: (statuses: Record<string, { status: string }>) => void;
  removeWorker: (cardId: string) => void;
  getStatus: (cardId: string) => WorkerStatus;
  setIsStreaming: (cardId: string, val: boolean) => void;
  appendStreamingText: (cardId: string, text: string) => void;
  clearStreaming: (cardId: string) => void;
  notifyCommentsChanged: (cardId: string) => void;
  setEvalStatus: (cardId: string, status: EvalStatus) => void;
  setPRStatus: (cardId: string, status: PRStatus) => void;
  setPRStep: (cardId: string, step: string, message: string) => void;
  setPRError: (cardId: string, error: string) => void;
  clearPRState: (cardId: string) => void;
}

export const useWorkerStore = create<WorkerState>((set, get) => ({
  statuses: {},
  errors: {},
  streamingText: {},
  isStreaming: {},
  commentsVersion: {},
  evalStatuses: {},
  prStatuses: {},
  prSteps: {},
  prErrors: {},

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

  setPRStatus: (cardId: string, status: PRStatus) => {
    set((s) => ({
      prStatuses: { ...s.prStatuses, [cardId]: status },
    }));
  },

  setPRStep: (cardId: string, step: string, message: string) => {
    set((s) => ({
      prSteps: { ...s.prSteps, [cardId]: { step, message } },
    }));
  },

  setPRError: (cardId: string, error: string) => {
    set((s) => ({
      prErrors: { ...s.prErrors, [cardId]: error },
      prStatuses: { ...s.prStatuses, [cardId]: 'error' },
    }));
  },

  clearPRState: (cardId: string) => {
    set((s) => {
      const { [cardId]: _s, ...restStatuses } = s.prStatuses;
      const { [cardId]: _st, ...restSteps } = s.prSteps;
      const { [cardId]: _e, ...restErrors } = s.prErrors;
      return { prStatuses: restStatuses, prSteps: restSteps, prErrors: restErrors };
    });
  },
}));
