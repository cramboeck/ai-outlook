import { Sparkles, Loader2 } from 'lucide-react';

interface ClassifyButtonProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export const ClassifyButton = ({
  onClick,
  isLoading,
  disabled,
  variant = 'primary',
  size = 'md',
  label = 'Mit KI kategorisieren',
}: ClassifyButtonProps) => {
  const baseStyles = 'inline-flex items-center gap-2 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark',
    outline: 'border border-primary text-primary hover:bg-primary/10',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]}`}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      {isLoading ? 'Klassifiziere...' : label}
    </button>
  );
};
