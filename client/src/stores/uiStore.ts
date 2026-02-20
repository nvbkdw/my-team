import { create } from 'zustand';

function getInitialDarkMode(): boolean {
  const stored = localStorage.getItem('darkMode');
  if (stored !== null) return stored === 'true';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

interface UiState {
  selectedCardId: string | null;
  isNewCardDialogOpen: boolean;
  isSettingsOpen: boolean;
  isAddRepoDialogOpen: boolean;
  isSidebarCollapsed: boolean;
  isDarkMode: boolean;

  selectCard: (id: string) => void;
  closeCard: () => void;
  openNewCardDialog: () => void;
  closeNewCardDialog: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAddRepoDialog: () => void;
  closeAddRepoDialog: () => void;
  toggleSidebar: () => void;
  toggleDarkMode: () => void;
}

const initialDark = getInitialDarkMode();
applyDarkClass(initialDark);

export const useUiStore = create<UiState>((set) => ({
  selectedCardId: null,
  isNewCardDialogOpen: false,
  isSettingsOpen: false,
  isAddRepoDialogOpen: false,
  isSidebarCollapsed: false,
  isDarkMode: initialDark,

  selectCard: (id) => set({ selectedCardId: id }),
  closeCard: () => set({ selectedCardId: null }),
  openNewCardDialog: () => set({ isNewCardDialogOpen: true }),
  closeNewCardDialog: () => set({ isNewCardDialogOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddRepoDialog: () => set({ isAddRepoDialogOpen: true }),
  closeAddRepoDialog: () => set({ isAddRepoDialogOpen: false }),
  toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
  toggleDarkMode: () =>
    set((s) => {
      const next = !s.isDarkMode;
      localStorage.setItem('darkMode', String(next));
      applyDarkClass(next);
      return { isDarkMode: next };
    }),
}));
