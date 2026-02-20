import { useUiStore } from '../../stores/uiStore.js';
import Button from '../ui/Button.js';

export default function BoardHeader() {
  const openNewCardDialog = useUiStore((s) => s.openNewCardDialog);

  return (
    <div className="flex items-center justify-between px-6 py-4">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">My Team</h1>
      <Button variant="primary" size="md" onClick={openNewCardDialog}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="mr-1.5 h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
            clipRule="evenodd"
          />
        </svg>
        New Card
      </Button>
    </div>
  );
}
