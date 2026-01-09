import { useState, useEffect } from 'react';
import { FolderInput, Check, X, Loader2, ChevronDown, Sparkles } from 'lucide-react';
import type { Email } from '../../types';
import { suggestFolder, buildFolderHierarchy, type FolderWithPath, type FolderSuggestion as FolderSuggestionType } from '../../services/folderService';
import { moveEmail, getMailFolders } from '../../services/graphService';

interface FolderSuggestionProps {
  email: Email;
  onMoved: () => void;
}

export const FolderSuggestion = ({ email, onMoved }: FolderSuggestionProps) => {
  const [suggestion, setSuggestion] = useState<FolderSuggestionType | null>(null);
  const [folders, setFolders] = useState<FolderWithPath[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    loadSuggestion();
  }, [email.id]);

  const loadSuggestion = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSuggestion(null);
      setDismissed(false);

      // Load folders first
      const foldersResult = await getMailFolders();
      const foldersWithPaths = buildFolderHierarchy(foldersResult.value);
      setFolders(foldersWithPaths);

      // Get suggestion
      const result = await suggestFolder(
        {
          subject: email.subject,
          senderEmail: email.from.emailAddress.address,
          senderName: email.from.emailAddress.name,
          bodyPreview: email.bodyPreview,
        },
        foldersWithPaths
      );

      if (result.suggestedFolderId && result.confidence >= 0.5) {
        setSuggestion(result);
      }
    } catch (err) {
      console.error('Failed to get folder suggestion:', err);
      // Don't show error to user, just don't show suggestion
    } finally {
      setIsLoading(false);
    }
  };

  const handleMove = async (folderId: string) => {
    try {
      setIsMoving(true);
      await moveEmail(email.id, folderId);
      onMoved();
    } catch (err) {
      setError('Verschieben fehlgeschlagen');
      console.error('Failed to move email:', err);
    } finally {
      setIsMoving(false);
      setShowFolderPicker(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setSuggestion(null);
  };

  // Don't render if no suggestion or dismissed
  if (dismissed || isLoading || !suggestion) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FolderInput className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-blue-500" />
              <span className="text-sm font-medium text-blue-900">
                In "{suggestion.suggestedFolderPath}" verschieben?
              </span>
            </div>
            <p className="text-xs text-blue-600 truncate">
              {suggestion.reasoning}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Move Button */}
          <button
            onClick={() => handleMove(suggestion.suggestedFolderId!)}
            disabled={isMoving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isMoving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Verschieben
          </button>

          {/* Other Folder Button */}
          <div className="relative">
            <button
              onClick={() => setShowFolderPicker(!showFolderPicker)}
              className="flex items-center gap-1 px-2 py-1.5 text-blue-700 text-sm hover:bg-blue-100 rounded-lg transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Folder Picker Dropdown */}
            {showFolderPicker && (
              <div className="absolute right-0 top-full mt-1 w-64 max-h-80 overflow-y-auto bg-white border border-border rounded-lg shadow-lg z-50">
                <div className="p-2 border-b border-border">
                  <p className="text-xs font-medium text-text-secondary">Anderen Ordner wählen</p>
                </div>
                <div className="py-1">
                  {folders
                    .filter(f => !f.isHidden && f.displayName !== 'Posteingang' && f.displayName !== 'Inbox')
                    .map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleMove(folder.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                        style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
                      >
                        <FolderInput className="w-4 h-4 text-text-secondary flex-shrink-0" />
                        <span className="truncate">{folder.displayName}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}

      {/* Alternative Suggestions */}
      {suggestion.alternativeFolders.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-blue-600">
          <span>Alternativen:</span>
          {suggestion.alternativeFolders.map((alt) => (
            <button
              key={alt.folderId}
              onClick={() => handleMove(alt.folderId)}
              className="px-2 py-0.5 bg-blue-100 rounded hover:bg-blue-200 transition-colors"
            >
              {alt.folderPath}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
