import { useCallback } from 'react';
import { useBoardStore } from '../stores/boardStore.js';
import { useUiStore } from '../stores/uiStore.js';
import type { Card } from '../types/models.js';

export function useCardDetail() {
  const selectedCardId = useUiStore((s) => s.selectedCardId);
  const cards = useBoardStore((s) => s.cards);
  const updateCard = useBoardStore((s) => s.updateCard);
  const removeCard = useBoardStore((s) => s.removeCard);
  const closeCard = useUiStore((s) => s.closeCard);

  const card: Card | undefined = cards.find((c) => c.id === selectedCardId);

  const handleClose = useCallback(() => {
    closeCard();
  }, [closeCard]);

  const handleUpdateTitle = useCallback(
    (title: string) => {
      if (card && title.trim()) {
        updateCard(card.id, { title: title.trim() });
      }
    },
    [card, updateCard]
  );

  const handleUpdateDescription = useCallback(
    (description: string) => {
      if (card) {
        updateCard(card.id, { description });
      }
    },
    [card, updateCard]
  );

  const handleDelete = useCallback(() => {
    if (card) {
      removeCard(card.id);
      handleClose();
    }
  }, [card, removeCard, handleClose]);

  const handleStatusChange = useCallback(
    (status: string) => {
      if (card) {
        updateCard(card.id, { status: status as import('../types/models.js').CardStatus });
      }
    },
    [card, updateCard]
  );

  return {
    card,
    selectedCardId,
    handleClose,
    handleUpdateTitle,
    handleUpdateDescription,
    handleDelete,
    handleStatusChange,
  };
}
