import { useIsAuthenticated } from '@azure/msal-react';
import { Mail, Menu } from 'lucide-react';
import { UserMenu } from '../auth/UserMenu';
import { LoginButton } from '../auth/LoginButton';

interface NavbarProps {
  onMenuClick?: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const isAuthenticated = useIsAuthenticated();

  return (
    <nav className="bg-white border-b border-border px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isAuthenticated && (
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5 text-text-secondary" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="bg-primary p-2 rounded-lg">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-semibold text-text">MailSort</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {isAuthenticated ? <UserMenu /> : <LoginButton />}
      </div>
    </nav>
  );
};
