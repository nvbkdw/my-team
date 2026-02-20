import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/cn.js';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantStyles: Record<Variant, string> = {
  default:
    'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100',
  primary:
    'bg-indigo-600 border border-transparent text-white hover:bg-indigo-700 active:bg-indigo-800',
  danger:
    'bg-red-600 border border-transparent text-white hover:bg-red-700 active:bg-red-800',
  ghost:
    'bg-transparent border border-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200',
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-xs',
  md: 'px-3.5 py-1.5 text-sm',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
