import type { ReactNode } from 'react';
import { cn } from '../../utils/cn.js';

interface BadgeProps {
  children: ReactNode;
  color?: string;
  variant?: 'solid' | 'outline';
  className?: string;
}

export default function Badge({
  children,
  color = 'bg-gray-100 text-gray-700',
  variant = 'solid',
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'solid' ? color : '',
        variant === 'outline'
          ? 'border bg-transparent ' + color
          : '',
        className,
      )}
    >
      {children}
    </span>
  );
}
