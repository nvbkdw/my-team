import { apiFetch } from './client.js';
import type { Card, CardStatus } from '../types/models.js';

export function fetchCards(): Promise<Card[]> {
  return apiFetch<Card[]>('/cards');
}

export function fetchCard(id: string): Promise<Card> {
  return apiFetch<Card>(`/cards/${id}`);
}

export function createCard(data: {
  title: string;
  description?: string;
  status?: CardStatus;
  repo_id?: string;
}): Promise<Card> {
  return apiFetch<Card>('/cards', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCard(
  id: string,
  data: Partial<Pick<Card, 'title' | 'description' | 'status' | 'repo_id' | 'branch_name' | 'branch_dir' | 'pr_number' | 'pr_url' | 'pr_state' | 'eval_env_setup' | 'eval_verification'>>,
): Promise<Card> {
  return apiFetch<Card>(`/cards/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function moveCard(
  id: string,
  status: CardStatus,
  position: number,
): Promise<Card> {
  return apiFetch<Card>(`/cards/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ status, position }),
  });
}

export function deleteCard(id: string): Promise<void> {
  return apiFetch<void>(`/cards/${id}`, {
    method: 'DELETE',
  });
}

export function closeCard(id: string): Promise<Card> {
  return apiFetch<Card>(`/cards/${id}/close`, { method: 'POST' });
}

export interface BranchDiffFile {
  filename: string;
  status: string;
  patch: string;
}

export interface BranchDiffResult {
  diff: string;
  files: BranchDiffFile[];
  baseBranch: string;
  currentBranch: string;
}

export function fetchBranchDiff(cardId: string): Promise<BranchDiffResult> {
  return apiFetch<BranchDiffResult>(`/cards/${cardId}/git/branch-diff`);
}
