import { create } from 'zustand';
import type { Card, CardStatus } from '../types/models.js';
import * as cardsApi from '../api/cards.js';

interface BoardState {
  cards: Card[];
  loading: boolean;
  error: string | null;

  fetchCards: () => Promise<void>;
  addCard: (data: Parameters<typeof cardsApi.createCard>[0]) => Promise<Card>;
  updateCard: (id: string, data: Parameters<typeof cardsApi.updateCard>[1]) => Promise<void>;
  moveCard: (id: string, status: CardStatus, position: number) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  getCardsByStatus: (status: CardStatus) => Card[];

  /** Apply an external card update (e.g. from WebSocket) without an API call */
  _patchCard: (card: Card) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  cards: [],
  loading: false,
  error: null,

  fetchCards: async () => {
    set({ loading: true, error: null });
    try {
      const cards = await cardsApi.fetchCards();
      set({ cards, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  addCard: async (data) => {
    const card = await cardsApi.createCard(data);
    set((state) => ({ cards: [...state.cards, card] }));
    return card;
  },

  updateCard: async (id, data) => {
    const updated = await cardsApi.updateCard(id, data);
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? updated : c)),
    }));
  },

  moveCard: async (id, status, position) => {
    // Optimistic update
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === id ? { ...c, status, position } : c,
      ),
    }));
    try {
      const updated = await cardsApi.moveCard(id, status, position);
      set((state) => ({
        cards: state.cards.map((c) => (c.id === id ? updated : c)),
      }));
    } catch (err) {
      // Revert on failure by re-fetching
      get().fetchCards();
    }
  },

  removeCard: async (id) => {
    await cardsApi.deleteCard(id);
    set((state) => ({
      cards: state.cards.filter((c) => c.id !== id),
    }));
  },

  getCardsByStatus: (status) => {
    return get()
      .cards.filter((c) => c.status === status)
      .sort((a, b) => a.position - b.position);
  },

  _patchCard: (card) => {
    set((state) => ({
      cards: state.cards.map((c) => (c.id === card.id ? card : c)),
    }));
  },
}));
