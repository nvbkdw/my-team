import { useRef, useCallback } from 'react';

export function useDebouncedSave(fn: (value: string) => void, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedFn = useCallback(
    (value: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        fn(value);
      }, delay);
    },
    [fn, delay]
  );

  return debouncedFn;
}
