import { apiFetch } from './client.js';
import type { FileTreeNode } from '../stores/fileStore.js';

export function fetchFileTree(cardId: string): Promise<FileTreeNode[]> {
  return apiFetch<FileTreeNode[]>(`/cards/${cardId}/files`);
}

export function readFile(
  cardId: string,
  path: string
): Promise<{ path: string; content: string }> {
  return apiFetch<{ path: string; content: string }>(
    `/cards/${cardId}/files/read?path=${encodeURIComponent(path)}`
  );
}

export function writeFile(
  cardId: string,
  path: string,
  content: string
): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/cards/${cardId}/files/write`, {
    method: 'PUT',
    body: JSON.stringify({ path, content }),
  });
}
