import { useState, useEffect } from 'react';
import {
  Inbox,
  Send,
  FileEdit,
  Trash2,
  Archive,
  AlertCircle,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { MailFolder } from '../../types';
import { getMailFolders } from '../../services/graphService';

interface FolderSidebarProps {
  selectedFolderId: string;
  onFolderSelect: (folderId: string, folderName: string) => void;
  onComposeClick: () => void;
  followUpCount?: number;
}

// Icon mapping for well-known folders
const FOLDER_ICONS: Record<string, React.ReactNode> = {
  Inbox: <Inbox className="w-4 h-4" />,
  'Gesendete Elemente': <Send className="w-4 h-4" />,
  'Sent Items': <Send className="w-4 h-4" />,
  Entwürfe: <FileEdit className="w-4 h-4" />,
  Drafts: <FileEdit className="w-4 h-4" />,
  'Gelöschte Elemente': <Trash2 className="w-4 h-4" />,
  'Deleted Items': <Trash2 className="w-4 h-4" />,
  Archiv: <Archive className="w-4 h-4" />,
  Archive: <Archive className="w-4 h-4" />,
  'Junk-E-Mail': <AlertCircle className="w-4 h-4" />,
  'Junk Email': <AlertCircle className="w-4 h-4" />,
};

// Well-known folder order for sorting
const FOLDER_ORDER = [
  'Inbox',
  'Posteingang',
  'Gesendete Elemente',
  'Sent Items',
  'Entwürfe',
  'Drafts',
  'Archiv',
  'Archive',
  'Junk-E-Mail',
  'Junk Email',
  'Gelöschte Elemente',
  'Deleted Items',
];

export const FolderSidebar = ({
  selectedFolderId,
  onFolderSelect,
  onComposeClick,
  followUpCount = 0,
}: FolderSidebarProps) => {
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getMailFolders();

      // Sort folders: well-known first, then alphabetically
      const sorted = result.value
        .filter((f) => !f.isHidden)
        .sort((a, b) => {
          const aIndex = FOLDER_ORDER.findIndex((name) =>
            a.displayName.toLowerCase().includes(name.toLowerCase())
          );
          const bIndex = FOLDER_ORDER.findIndex((name) =>
            b.displayName.toLowerCase().includes(name.toLowerCase())
          );

          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.displayName.localeCompare(b.displayName);
        });

      setFolders(sorted);

      // Auto-select inbox if nothing selected
      if (!selectedFolderId) {
        const inbox = sorted.find(
          (f) =>
            f.displayName.toLowerCase() === 'inbox' ||
            f.displayName.toLowerCase() === 'posteingang'
        );
        if (inbox) {
          onFolderSelect(inbox.id, inbox.displayName);
        }
      }
    } catch (err) {
      setError('Ordner konnten nicht geladen werden');
      console.error('Error loading folders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpanded = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const getFolderIcon = (folder: MailFolder) => {
    return FOLDER_ICONS[folder.displayName] || <Folder className="w-4 h-4" />;
  };

  const isSelected = (folderId: string) => folderId === selectedFolderId;

  return (
    <div className="w-56 bg-white border-r border-border flex flex-col h-full">
      {/* Compose Button */}
      <div className="p-3">
        <button
          onClick={onComposeClick}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors font-medium shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Neue E-Mail
        </button>
      </div>

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 text-text-secondary animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-4 text-red-500 text-sm">{error}</div>
        ) : (
          <nav className="space-y-0.5">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onFolderSelect(folder.id, folder.displayName)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                  isSelected(folder.id)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text hover:bg-gray-100'
                }`}
              >
                {folder.childFolderCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(folder.id);
                    }}
                    className="p-0.5 hover:bg-gray-200 rounded"
                  >
                    {expandedFolders.has(folder.id) ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                )}
                <span className={folder.childFolderCount === 0 ? 'ml-4' : ''}>
                  {getFolderIcon(folder)}
                </span>
                <span className="flex-1 truncate text-sm">{folder.displayName}</span>
                {folder.unreadItemCount > 0 && (
                  <span
                    className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                      isSelected(folder.id)
                        ? 'bg-primary text-white'
                        : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {folder.unreadItemCount}
                  </span>
                )}
              </button>
            ))}

            {/* Separator */}
            <div className="my-3 border-t border-border" />

            {/* Follow-up Reminders (Smart Feature) */}
            <button
              onClick={() => onFolderSelect('followup', 'Warte auf Antwort')}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                selectedFolderId === 'followup'
                  ? 'bg-orange-100 text-orange-700 font-medium'
                  : 'text-text hover:bg-gray-100'
              }`}
            >
              <span className="ml-4">
                <Clock className="w-4 h-4" />
              </span>
              <span className="flex-1 truncate text-sm">Warte auf Antwort</span>
              {followUpCount > 0 && (
                <span
                  className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                    selectedFolderId === 'followup'
                      ? 'bg-orange-500 text-white'
                      : 'bg-orange-100 text-orange-600'
                  }`}
                >
                  {followUpCount}
                </span>
              )}
            </button>
          </nav>
        )}
      </div>

      {/* Refresh button */}
      <div className="p-2 border-t border-border">
        <button
          onClick={loadFolders}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Ordner aktualisieren
        </button>
      </div>
    </div>
  );
};
