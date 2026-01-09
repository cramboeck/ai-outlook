import { useState, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  FolderInput,
  Check,
  CheckSquare,
  Square,
  Loader2,
  Calendar,
  User,
  Paperclip,
  Mail,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import type { Email, MailFolder } from '../../types';
import {
  searchEmails,
  moveEmailsBatch,
  getMailFolders,
  type SearchCriteria,
} from '../../services/graphService';
import { buildFolderHierarchy, type FolderWithPath } from '../../services/folderService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMoved: () => void;
}

export const SearchModal = ({ isOpen, onClose, onMoved }: SearchModalProps) => {
  // Search criteria state
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasAttachments, setHasAttachments] = useState<boolean | undefined>(undefined);
  const [selectedSourceFolder, setSelectedSourceFolder] = useState('');

  // Results state
  const [results, setResults] = useState<Email[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Folders state
  const [folders, setFolders] = useState<FolderWithPath[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [selectedDestFolder, setSelectedDestFolder] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Moving state
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const loadFolders = async () => {
    try {
      setIsLoadingFolders(true);
      const result = await getMailFolders();
      const foldersWithPaths = buildFolderHierarchy(result.value);
      setFolders(foldersWithPaths);
    } catch (err) {
      console.error('Failed to load folders:', err);
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const handleSearch = async () => {
    // At least one criterion required
    if (!query && !from && !subject && !dateFrom && !dateTo && hasAttachments === undefined && !selectedSourceFolder) {
      setError('Bitte mindestens ein Suchkriterium angeben');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);
      setSuccess(null);
      setSelectedIds(new Set());

      const criteria: SearchCriteria = {};

      if (query.trim()) criteria.query = query.trim();
      if (from.trim()) criteria.from = from.trim();
      if (subject.trim()) criteria.subject = subject.trim();
      if (dateFrom) criteria.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) {
        // Set to end of day
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        criteria.dateTo = endDate.toISOString();
      }
      if (hasAttachments !== undefined) criteria.hasAttachments = hasAttachments;
      if (selectedSourceFolder) criteria.folderId = selectedSourceFolder;

      const result = await searchEmails(criteria, 200);
      setResults(result.value);
      setHasSearched(true);
    } catch (err) {
      console.error('Search failed:', err);
      setError('Suche fehlgeschlagen. Bitte versuche es erneut.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((e) => e.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleMove = async () => {
    if (selectedIds.size === 0) {
      setError('Keine E-Mails ausgewählt');
      return;
    }
    if (!selectedDestFolder) {
      setError('Kein Zielordner ausgewählt');
      return;
    }

    try {
      setIsMoving(true);
      setError(null);
      setSuccess(null);

      await moveEmailsBatch(Array.from(selectedIds), selectedDestFolder);

      // Remove moved emails from results
      setResults((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      const movedCount = selectedIds.size;
      setSelectedIds(new Set());
      setSuccess(`${movedCount} E-Mail(s) erfolgreich verschoben`);
      onMoved();
    } catch (err) {
      console.error('Move failed:', err);
      setError('Verschieben fehlgeschlagen');
    } finally {
      setIsMoving(false);
    }
  };

  const handleReset = () => {
    setQuery('');
    setFrom('');
    setSubject('');
    setDateFrom('');
    setDateTo('');
    setHasAttachments(undefined);
    setSelectedSourceFolder('');
    setResults([]);
    setSelectedIds(new Set());
    setHasSearched(false);
    setError(null);
    setSuccess(null);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDestFolderName = () => {
    if (!selectedDestFolder) return 'Zielordner wählen';
    const folder = folders.find((f) => f.id === selectedDestFolder);
    return folder?.path || folder?.displayName || 'Unbekannt';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">E-Mails suchen & verschieben</h2>
              <p className="text-sm text-text-secondary">
                Finde E-Mails und verschiebe sie in einen anderen Ordner
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Form */}
        <div className="px-6 py-4 border-b border-border bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Full text search */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Volltextsuche
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Beliebiger Text..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>

            {/* From */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Von (Absender)
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="Name oder E-Mail..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Betreff enthält
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Suchbegriff..."
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
            </div>

            {/* Date from */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Datum von
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Date to */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Datum bis
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>
            </div>

            {/* Source Folder */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Quellordner (optional)
              </label>
              <select
                value={selectedSourceFolder}
                onChange={(e) => setSelectedSourceFolder(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                disabled={isLoadingFolders}
              >
                <option value="">Alle Ordner</option>
                {folders
                  .filter((f) => !f.isHidden)
                  .map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {'  '.repeat(folder.depth)}{folder.displayName}
                    </option>
                  ))}
              </select>
            </div>

            {/* Attachments filter */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Mit Anhang
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="attachments"
                    checked={hasAttachments === undefined}
                    onChange={() => setHasAttachments(undefined)}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Egal</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="attachments"
                    checked={hasAttachments === true}
                    onChange={() => setHasAttachments(true)}
                    className="text-primary focus:ring-primary"
                  />
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm">Ja</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="attachments"
                    checked={hasAttachments === false}
                    onChange={() => setHasAttachments(false)}
                    className="text-primary focus:ring-primary"
                  />
                  <span className="text-sm">Nein</span>
                </label>
              </div>
            </div>
          </div>

          {/* Search buttons */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
            >
              Zurücksetzen
            </button>
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Suchen
            </button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {(error || success) && (
          <div className={`px-6 py-3 ${error ? 'bg-red-50' : 'bg-green-50'}`}>
            <div className={`flex items-center gap-2 text-sm ${error ? 'text-red-700' : 'text-green-700'}`}>
              {error ? (
                <AlertCircle className="w-4 h-4" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {error || success}
            </div>
          </div>
        )}

        {/* Results */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Results Header */}
          {hasSearched && (
            <div className="px-6 py-3 border-b border-border bg-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSelectAll}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors"
                >
                  {selectedIds.size === results.length && results.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-primary" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  Alle auswählen
                </button>
                <span className="text-sm text-text-secondary">
                  {results.length} Ergebnis(se)
                  {selectedIds.size > 0 && ` · ${selectedIds.size} ausgewählt`}
                </span>
              </div>

              {/* Move controls */}
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-3">
                  {/* Folder picker */}
                  <div className="relative">
                    <button
                      onClick={() => setShowFolderPicker(!showFolderPicker)}
                      className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg hover:bg-gray-50 transition-colors text-sm"
                    >
                      <FolderInput className="w-4 h-4 text-text-secondary" />
                      <span className="max-w-[200px] truncate">{getDestFolderName()}</span>
                      <ChevronDown className="w-4 h-4 text-text-secondary" />
                    </button>

                    {showFolderPicker && (
                      <div className="absolute right-0 top-full mt-1 w-72 max-h-64 overflow-y-auto bg-white border border-border rounded-lg shadow-lg z-50">
                        <div className="p-2 border-b border-border sticky top-0 bg-white">
                          <p className="text-xs font-medium text-text-secondary">Zielordner wählen</p>
                        </div>
                        <div className="py-1">
                          {folders
                            .filter((f) => !f.isHidden)
                            .map((folder) => (
                              <button
                                key={folder.id}
                                onClick={() => {
                                  setSelectedDestFolder(folder.id);
                                  setShowFolderPicker(false);
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                                  selectedDestFolder === folder.id ? 'bg-primary/5 text-primary' : ''
                                }`}
                                style={{ paddingLeft: `${12 + folder.depth * 16}px` }}
                              >
                                <FolderInput className="w-4 h-4 flex-shrink-0" />
                                <span className="truncate">{folder.displayName}</span>
                                {selectedDestFolder === folder.id && (
                                  <Check className="w-4 h-4 ml-auto" />
                                )}
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Move button */}
                  <button
                    onClick={handleMove}
                    disabled={isMoving || !selectedDestFolder}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                  >
                    {isMoving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderInput className="w-4 h-4" />
                    )}
                    Verschieben ({selectedIds.size})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Results List */}
          <div className="flex-1 overflow-y-auto">
            {isSearching ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : results.length > 0 ? (
              <div className="divide-y divide-border">
                {results.map((email) => (
                  <div
                    key={email.id}
                    className={`flex items-start gap-3 px-6 py-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedIds.has(email.id) ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleToggleSelect(email.id)}
                  >
                    {/* Checkbox */}
                    <div className="pt-1">
                      {selectedIds.has(email.id) ? (
                        <CheckSquare className="w-5 h-5 text-primary" />
                      ) : (
                        <Square className="w-5 h-5 text-text-secondary" />
                      )}
                    </div>

                    {/* Email info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className={`text-sm ${!email.isRead ? 'font-semibold text-text' : 'text-text-secondary'}`}>
                          {email.from?.emailAddress?.name || email.from?.emailAddress?.address || 'Unbekannt'}
                        </span>
                        <span className="text-xs text-text-secondary flex-shrink-0">
                          {formatDate(email.receivedDateTime)}
                        </span>
                      </div>
                      <p className={`text-sm truncate ${!email.isRead ? 'font-medium text-text' : 'text-text-secondary'}`}>
                        {email.subject || '(Kein Betreff)'}
                      </p>
                      <p className="text-xs text-text-secondary truncate mt-0.5">
                        {email.bodyPreview}
                      </p>
                      {/* Show current folder if searching all folders */}
                      {!selectedSourceFolder && email.parentFolderId && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-text-secondary">
                            <FolderInput className="w-3 h-3" />
                            {folders.find((f) => f.id === email.parentFolderId)?.path || 'Unbekannt'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Indicators */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {email.hasAttachments && (
                        <Paperclip className="w-4 h-4 text-text-secondary" />
                      )}
                      {email.categories.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          {email.categories[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : hasSearched ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <Search className="w-12 h-12 mb-3 opacity-50" />
                <p>Keine E-Mails gefunden</p>
                <p className="text-sm mt-1">Versuche andere Suchkriterien</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <Filter className="w-12 h-12 mb-3 opacity-50" />
                <p>Gib Suchkriterien ein</p>
                <p className="text-sm mt-1">und klicke auf "Suchen"</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text border border-border rounded-lg hover:bg-white transition-colors"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
};
