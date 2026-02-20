import { create } from 'zustand';

type WorkerStatus = 'none' | 'idle' | 'running' | 'error';

interface WorkerState {
  statuses: Record<string, WorkerStatus>; // keyed by cardId
  errors: Record<string, string>;

  setWorkerStatus: (cardId: string, status: WorkerStatus, error?: string) => void;
  setAllStatuses: (statuses: Record<string, { status: string }>) => void;
  removeWorker: (cardId: string) => void;
  getStatus: (cardId: string) => WorkerStatus;
}

export const useWorkerStore = create<WorkerState>((set, get) => ({
  statuses: {},
  errors: {},

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
      const { [cardId]: _, ...rest } = s.statuses;
      const { [cardId]: __, ...errRest } = s.errors;
      return { statuses: rest, errors: errRest };
    });
  },

  getStatus: (cardId: string) => {
    return get().statuses[cardId] || 'none';
  },
}));
