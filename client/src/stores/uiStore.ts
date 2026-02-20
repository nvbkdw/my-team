import { create } from 'zustand';

export type ActiveTab = 'details' | 'code' | 'pr' | 'chat';

interface UiState {
  selectedCardId: string | null;
  activeTab: ActiveTab;
  isNewCardDialogOpen: boolean;
  isSettingsOpen: boolean;
  isAddRepoDialogOpen: boolean;

  selectCard: (id: string) => void;
  closeCard: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  openNewCardDialog: () => void;
  closeNewCardDialog: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openAddRepoDialog: () => void;
  closeAddRepoDialog: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedCardId: null,
  activeTab: 'details',
  isNewCardDialogOpen: false,
  isSettingsOpen: false,
  isAddRepoDialogOpen: false,

  selectCard: (id) => set({ selectedCardId: id, activeTab: 'details' }),
  closeCard: () => set({ selectedCardId: null, activeTab: 'details' }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  openNewCardDialog: () => set({ isNewCardDialogOpen: true }),
  closeNewCardDialog: () => set({ isNewCardDialogOpen: false }),
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openAddRepoDialog: () => set({ isAddRepoDialogOpen: true }),
  closeAddRepoDialog: () => set({ isAddRepoDialogOpen: false }),
}));
