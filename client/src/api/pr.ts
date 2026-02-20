import { apiFetch } from './client.js';

export interface PRData {
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  user: { login: string; avatar_url: string };
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface PRComment {
  id: number;
  user: { login: string; avatar_url: string };
  body: string;
  created_at: string;
  path?: string;
  line?: number;
}

export function createPR(
  cardId: string,
  title: string,
  body: string
): Promise<PRData> {
  return apiFetch<PRData>(`/cards/${cardId}/pr`, {
    method: 'POST',
    body: JSON.stringify({ title, body }),
  });
}

export function fetchPR(cardId: string): Promise<PRData> {
  return apiFetch<PRData>(`/cards/${cardId}/pr`);
}

export function fetchPRFiles(cardId: string): Promise<PRFile[]> {
  return apiFetch<PRFile[]>(`/cards/${cardId}/pr/files`);
}

export function fetchPRComments(cardId: string): Promise<PRComment[]> {
  return apiFetch<PRComment[]>(`/cards/${cardId}/pr/comments`);
}
