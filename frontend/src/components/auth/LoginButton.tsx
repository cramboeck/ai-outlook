import { useMsal } from '@azure/msal-react';
import { LogIn } from 'lucide-react';
import { loginRequest } from '../../config/msalConfig';

interface LoginButtonProps {
  variant?: 'primary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

export const LoginButton = ({ variant = 'primary', size = 'md' }: LoginButtonProps) => {
  const { instance } = useMsal();

  const handleLogin = () => {
    instance.loginRedirect(loginRequest).catch((error) => {
      console.error('Login failed:', error);
    });
  };

  const baseStyles = 'inline-flex items-center gap-2 font-medium rounded-lg transition-colors';

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
      onClick={handleLogin}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]}`}
    >
      <LogIn className="w-4 h-4" />
      Mit Microsoft anmelden
    </button>
  );
};
