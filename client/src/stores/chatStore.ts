import { create } from 'zustand';
import type { ChatSession, ChatMessage } from '../types/models.js';
import * as chatApi from '../api/chats.js';

interface ChatState {
  sessions: Record<string, ChatSession[]>; // keyed by cardId
  messages: Record<string, ChatMessage[]>; // keyed by sessionId
  activeSessionId: string | null;
  streamingText: string;
  isStreaming: boolean;

  fetchSessions: (cardId: string) => Promise<void>;
  createSession: (cardId: string) => Promise<ChatSession>;
  setActiveSession: (sessionId: string | null) => void;
  fetchMessages: (sessionId: string) => Promise<void>;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  appendStreamingText: (text: string) => void;
  clearStreaming: () => void;
  setIsStreaming: (val: boolean) => void;
  finalizeStreaming: (sessionId: string, content: string, costUsd?: number) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: {},
  messages: {},
  activeSessionId: null,
  streamingText: '',
  isStreaming: false,

  fetchSessions: async (cardId: string) => {
    const sessions = await chatApi.fetchChatSessions(cardId);
    set((s) => ({
      sessions: { ...s.sessions, [cardId]: sessions },
    }));
  },

  createSession: async (cardId: string) => {
    const session = await chatApi.createChatSession(cardId);
    set((s) => ({
      sessions: {
        ...s.sessions,
        [cardId]: [...(s.sessions[cardId] || []), session],
      },
      activeSessionId: session.id,
    }));
    return session;
  },

  setActiveSession: (sessionId: string | null) => {
    set({ activeSessionId: sessionId });
  },

  fetchMessages: async (sessionId: string) => {
    const messages = await chatApi.fetchMessages(sessionId);
    set((s) => ({
      messages: { ...s.messages, [sessionId]: messages },
    }));
  },

  addMessage: (sessionId: string, msg: ChatMessage) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] || []), msg],
      },
    }));
  },

  appendStreamingText: (text: string) => {
    set((s) => ({ streamingText: s.streamingText + text }));
  },

  clearStreaming: () => {
    set({ streamingText: '', isStreaming: false });
  },

  setIsStreaming: (val: boolean) => {
    set({ isStreaming: val, ...(val ? { streamingText: '' } : {}) });
  },

  finalizeStreaming: (sessionId: string, content: string, costUsd?: number) => {
    const msg: ChatMessage = {
      id: Date.now(),
      session_id: sessionId,
      role: 'assistant',
      content,
      cost_usd: costUsd ?? null,
      created_at: new Date().toISOString(),
    };
    get().addMessage(sessionId, msg);
    set({ streamingText: '', isStreaming: false });
  },
}));
