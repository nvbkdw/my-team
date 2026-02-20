import { apiFetch } from './client.js';
import type { ChatSession, ChatMessage } from '../types/models.js';

export function fetchChatSessions(cardId: string): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>(`/cards/${cardId}/chat/sessions`);
}

export function createChatSession(cardId: string): Promise<ChatSession> {
  return apiFetch<ChatSession>(`/cards/${cardId}/chat/sessions`, {
    method: 'POST',
  });
}

export function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`);
}

export function addMessage(
  sessionId: string,
  data: { role: ChatMessage['role']; content: string },
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
