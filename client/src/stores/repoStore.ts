import { create } from 'zustand';
import type { Repo } from '../types/models.js';
import * as reposApi from '../api/repos.js';

interface RepoState {
  repos: Repo[];
  loading: boolean;

  fetchRepos: () => Promise<void>;
  addRepo: (data: Parameters<typeof reposApi.createRepo>[0]) => Promise<Repo>;
  removeRepo: (id: string) => Promise<void>;
}

export const useRepoStore = create<RepoState>((set) => ({
  repos: [],
  loading: false,

  fetchRepos: async () => {
    set({ loading: true });
    try {
      const repos = await reposApi.fetchRepos();
      set({ repos, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addRepo: async (data) => {
    const repo = await reposApi.createRepo(data);
    set((state) => ({ repos: [...state.repos, repo] }));
    return repo;
  },

  removeRepo: async (id) => {
    await reposApi.deleteRepo(id);
    set((state) => ({
      repos: state.repos.filter((r) => r.id !== id),
    }));
  },
}));
