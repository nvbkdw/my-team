import { create } from 'zustand';
import * as filesApi from '../api/files.js';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  modified: boolean;
}

interface FileState {
  tree: FileTreeNode[];
  treeLoading: boolean;
  openTabs: OpenTab[];
  activeFilePath: string | null;

  fetchTree: (cardId: string) => Promise<void>;
  openFile: (cardId: string, filePath: string) => Promise<void>;
  closeTab: (filePath: string) => void;
  setActiveFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;
  saveFile: (cardId: string, filePath: string) => Promise<void>;
  clearAll: () => void;
}

export const useFileStore = create<FileState>((set, get) => ({
  tree: [],
  treeLoading: false,
  openTabs: [],
  activeFilePath: null,

  fetchTree: async (cardId: string) => {
    set({ treeLoading: true });
    try {
      const tree = await filesApi.fetchFileTree(cardId);
      set({ tree, treeLoading: false });
    } catch {
      set({ treeLoading: false });
    }
  },

  openFile: async (cardId: string, filePath: string) => {
    const existing = get().openTabs.find((t) => t.path === filePath);
    if (existing) {
      set({ activeFilePath: filePath });
      return;
    }

    const { content } = await filesApi.readFile(cardId, filePath);
    const name = filePath.split('/').pop() || filePath;
    set((s) => ({
      openTabs: [...s.openTabs, { path: filePath, name, content, modified: false }],
      activeFilePath: filePath,
    }));
  },

  closeTab: (filePath: string) => {
    set((s) => {
      const tabs = s.openTabs.filter((t) => t.path !== filePath);
      let active = s.activeFilePath;
      if (active === filePath) {
        active = tabs.length > 0 ? tabs[tabs.length - 1].path : null;
      }
      return { openTabs: tabs, activeFilePath: active };
    });
  },

  setActiveFile: (filePath: string) => {
    set({ activeFilePath: filePath });
  },

  updateFileContent: (filePath: string, content: string) => {
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.path === filePath ? { ...t, content, modified: true } : t
      ),
    }));
  },

  saveFile: async (cardId: string, filePath: string) => {
    const tab = get().openTabs.find((t) => t.path === filePath);
    if (!tab) return;
    await filesApi.writeFile(cardId, filePath, tab.content);
    set((s) => ({
      openTabs: s.openTabs.map((t) =>
        t.path === filePath ? { ...t, modified: false } : t
      ),
    }));
  },

  clearAll: () => {
    set({ tree: [], openTabs: [], activeFilePath: null });
  },
}));
