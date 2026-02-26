import { apiFetch } from './client.js';

export interface EvalResultEntry {
  filename: string;
  createdAt: string;
  size: number;
}

export interface EvalResultContent {
  filename: string;
  content: string;
}

export function fetchEvalResults(cardId: string) {
  return apiFetch<EvalResultEntry[]>(`/cards/${cardId}/eval`);
}

export function fetchEvalResultContent(cardId: string, filename: string) {
  return apiFetch<EvalResultContent>(`/cards/${cardId}/eval/${encodeURIComponent(filename)}`);
}
