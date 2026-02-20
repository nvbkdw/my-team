import { useEffect } from 'react';
import { useUiStore } from './stores/uiStore.js';
import { useRepoStore } from './stores/repoStore.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import AppLayout from './components/layout/AppLayout.js';
import KanbanBoard from './components/board/KanbanBoard.js';
import CardDetailModal from './components/card-detail/CardDetailModal.js';
import NewCardDialog from './components/board/NewCardDialog.js';
import AddRepoDialog from './components/sidebar/AddRepoDialog.js';
import SettingsDialog from './components/settings/SettingsDialog.js';

export default function App() {
  const selectedCardId = useUiStore((s) => s.selectedCardId);
  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  // Initialize WebSocket connection
  useWebSocket();

  // Load repos on startup
  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  return (
    <AppLayout>
      <KanbanBoard />
      {selectedCardId && <CardDetailModal />}
      <NewCardDialog />
      <AddRepoDialog />
      <SettingsDialog />
    </AppLayout>
  );
}
