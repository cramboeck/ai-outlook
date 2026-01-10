import { useState, useEffect, useMemo } from 'react';
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

interface FolderNode extends MailFolder {
  children: FolderNode[];
  level: number;
}

// Icon mapping for well-known folders
const FOLDER_ICONS: Record<string, React.ReactNode> = {
  Inbox: <Inbox className="w-4 h-4" />,
  Posteingang: <Inbox className="w-4 h-4" />,
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

// Build folder tree from flat list
const buildFolderTree = (folders: MailFolder[]): FolderNode[] => {
  const folderMap = new Map<string, FolderNode>();
  const rootFolders: FolderNode[] = [];

  // First pass: create all nodes
  folders.forEach((folder) => {
    folderMap.set(folder.id, { ...folder, children: [], level: 0 });
  });

  // Second pass: build tree structure
  folders.forEach((folder) => {
    const node = folderMap.get(folder.id)!;
    if (folder.parentFolderId && folderMap.has(folder.parentFolderId)) {
      const parent = folderMap.get(folder.parentFolderId)!;
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      rootFolders.push(node);
    }
  });

  // Sort children recursively
  const sortFolders = (nodes: FolderNode[]): FolderNode[] => {
    return nodes
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
      })
      .map((node) => ({
        ...node,
        children: sortFolders(node.children),
      }));
  };

  return sortFolders(rootFolders);
};

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

  // Build folder tree
  const folderTree = useMemo(() => {
    const visibleFolders = folders.filter((f) => !f.isHidden);
    return buildFolderTree(visibleFolders);
  }, [folders]);

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getMailFolders();
      setFolders(result.value);

      // Auto-select inbox if nothing selected
      if (!selectedFolderId) {
        const inbox = result.value.find(
          (f) =>
            f.displayName.toLowerCase() === 'inbox' ||
            f.displayName.toLowerCase() === 'posteingang'
        );
        if (inbox) {
          onFolderSelect(inbox.id, inbox.displayName);
        }
      }

      // Auto-expand folders with selected child
      if (selectedFolderId) {
        const selected = result.value.find((f) => f.id === selectedFolderId);
        if (selected?.parentFolderId) {
          setExpandedFolders((prev) => new Set([...prev, selected.parentFolderId!]));
        }
      }
    } catch (err) {
      setError('Ordner konnten nicht geladen werden');
      console.error('Error loading folders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpanded = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const getFolderIcon = (folder: FolderNode) => {
    return FOLDER_ICONS[folder.displayName] || <Folder className="w-4 h-4" />;
  };

  const isSelected = (folderId: string) => folderId === selectedFolderId;

  // Recursive folder renderer
  const renderFolder = (folder: FolderNode) => {
    const hasChildren = folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const paddingLeft = 12 + folder.level * 16; // Base padding + indent per level

    return (
      <div key={folder.id}>
        <button
          onClick={() => onFolderSelect(folder.id, folder.displayName)}
          className={`folder-item w-full flex items-center gap-2 py-2 rounded-lg text-left transition-colors ${
            isSelected(folder.id)
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-text hover:bg-gray-100'
          }`}
          style={{ paddingLeft: `${paddingLeft}px`, paddingRight: '12px' }}
        >
          {/* Expand/collapse button */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpanded(folder.id, e)}
              className="p-0.5 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4.5" /> // Spacer for alignment
          )}

          {/* Icon */}
          <span className="flex-shrink-0">{getFolderIcon(folder)}</span>

          {/* Name */}
          <span className="flex-1 truncate text-sm">{folder.displayName}</span>

          {/* Unread count */}
          {folder.unreadItemCount > 0 && (
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                isSelected(folder.id)
                  ? 'bg-primary text-white'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {folder.unreadItemCount}
            </span>
          )}
        </button>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="folder-children">
            {folder.children.map((child) => renderFolder(child))}
          </div>
        )}
      </div>
    );
  };

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
            {folderTree.map((folder) => renderFolder(folder))}

            {/* Separator */}
            <div className="my-3 border-t border-border" />

            {/* Follow-up Reminders (Smart Feature) */}
            <button
              onClick={() => onFolderSelect('followup', 'Warte auf Antwort')}
              className={`folder-item w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                selectedFolderId === 'followup'
                  ? 'bg-orange-100 text-orange-700 font-medium'
                  : 'text-text hover:bg-gray-100'
              }`}
            >
              <span className="w-4.5" />
              <Clock className="w-4 h-4" />
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
