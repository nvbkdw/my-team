import { apiFetch } from './client.js';
import type { Subtask } from '../types/models.js';

export function fetchSubtasks(cardId: string, section?: string) {
  const query = section ? `?section=${encodeURIComponent(section)}` : '';
  return apiFetch<Subtask[]>(`/cards/${cardId}/subtasks${query}`);
}

export function createSubtask(cardId: string, data: { title: string; parent_id?: string | null; section?: string }) {
  return apiFetch<Subtask>(`/cards/${cardId}/subtasks`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateSubtask(
  cardId: string,
  subtaskId: string,
  data: { title?: string; completed?: number }
) {
  return apiFetch<Subtask>(`/cards/${cardId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteSubtask(cardId: string, subtaskId: string) {
  return apiFetch(`/cards/${cardId}/subtasks/${subtaskId}`, {
    method: 'DELETE',
  });
}
