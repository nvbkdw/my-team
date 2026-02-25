import { create } from 'zustand';
import type { TraceEntry } from '../api/traces.js';

interface HistoryState {
  entries: Record<string, TraceEntry[]>;
  loading: Record<string, boolean>;
  initialized: Record<string, boolean>;

  setEntries: (cardId: string, entries: TraceEntry[]) => void;
  appendEntry: (cardId: string, entry: TraceEntry) => void;
  setLoading: (cardId: string, val: boolean) => void;
  setInitialized: (cardId: string, val: boolean) => void;
  clearCard: (cardId: string) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: {},
  loading: {},
  initialized: {},

  setEntries: (cardId, entries) => {
    set((s) => ({
      entries: { ...s.entries, [cardId]: entries },
    }));
  },

  appendEntry: (cardId, entry) => {
    set((s) => ({
      entries: {
        ...s.entries,
        [cardId]: [...(s.entries[cardId] || []), entry],
      },
    }));
  },

  setLoading: (cardId, val) => {
    set((s) => ({
      loading: { ...s.loading, [cardId]: val },
    }));
  },

  setInitialized: (cardId, val) => {
    set((s) => ({
      initialized: { ...s.initialized, [cardId]: val },
    }));
  },

  clearCard: (cardId) => {
    set((s) => {
      const { [cardId]: _e, ...restEntries } = s.entries;
      const { [cardId]: _l, ...restLoading } = s.loading;
      const { [cardId]: _i, ...restInit } = s.initialized;
      return {
        entries: restEntries,
        loading: restLoading,
        initialized: restInit,
      };
    });
  },
}));
