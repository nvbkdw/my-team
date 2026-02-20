import { create } from 'zustand';

interface UiState {
  selectedCardId: string | null;
  isNewCardDialogOpen: boolean;
  isSettingsOpen: boolean;
  isAddRepoDialogOpen: boolean;

  selectCard: (id: string) => void;
  closeCard: () => void;
  openNewCardDialog: () => void;
  closeNewCardDialog: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAddRepoDialog: () => void;
  closeAddRepoDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedCardId: null,
  isNewCardDialogOpen: false,
  isSettingsOpen: false,
  isAddRepoDialogOpen: false,

  selectCard: (id) => set({ selectedCardId: id }),
  closeCard: () => set({ selectedCardId: null }),
  openNewCardDialog: () => set({ isNewCardDialogOpen: true }),
  closeNewCardDialog: () => set({ isNewCardDialogOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddRepoDialog: () => set({ isAddRepoDialogOpen: true }),
  closeAddRepoDialog: () => set({ isAddRepoDialogOpen: false }),
}));
