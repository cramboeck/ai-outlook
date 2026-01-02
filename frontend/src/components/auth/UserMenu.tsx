import { useState, useRef, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { User, LogOut, ChevronDown } from 'lucide-react';

export const UserMenu = () => {
  const { instance, accounts } = useMsal();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const account = accounts[0];
  const displayName = account?.name || account?.username || 'Benutzer';
  const email = account?.username || '';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-primary" />
        </div>
        <span className="hidden sm:block text-sm font-medium text-text max-w-32 truncate">
          {displayName}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-border py-2 z-50">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-text truncate">{displayName}</p>
            <p className="text-xs text-text-secondary truncate">{email}</p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-gray-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
};
