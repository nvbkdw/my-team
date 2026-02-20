import { apiFetch } from './client.js';
import type { Repo } from '../types/models.js';

export function fetchRepos(): Promise<Repo[]> {
  return apiFetch<Repo[]>('/repos');
}

export function fetchRepo(id: string): Promise<Repo> {
  return apiFetch<Repo>(`/repos/${id}`);
}

export function createRepo(data: {
  name: string;
  local_path: string;
  github_owner?: string;
  github_repo?: string;
  default_branch?: string;
}): Promise<Repo> {
  return apiFetch<Repo>('/repos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateRepo(
  id: string,
  data: Partial<Pick<Repo, 'name' | 'local_path' | 'github_owner' | 'github_repo' | 'default_branch'>>,
): Promise<Repo> {
  return apiFetch<Repo>(`/repos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteRepo(id: string): Promise<void> {
  return apiFetch<void>(`/repos/${id}`, {
    method: 'DELETE',
  });
}
