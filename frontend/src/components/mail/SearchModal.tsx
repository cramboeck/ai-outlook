import { useState, useEffect } from 'react';
import {
  X,
  Search,
  Filter,
  Folder,
  Check,
  CheckSquare,
  Square,
  Loader2,
  User,
  Paperclip,
  Mail,
  ChevronDown,
  AlertCircle,
  Trash2,
  Save,
  Play,
  Star,
  Eye,
  Tag,
  Clock,
  Plus,
  Settings,
} from 'lucide-react';
import type { Email } from '../../types';
import {
  searchEmails,
  moveEmailsBatch,
  deleteEmailsBatch,
  getMailFolders,
  setEmailCategoriesBatch,
  type SearchCriteria,
} from '../../services/graphService';
import { buildFolderHierarchy, type FolderWithPath } from '../../services/folderService';
import { getActiveCategories } from '../../services/categoryService';
import {
  loadMacros,
  createMacro,
  deleteMacro,
  recordMacroUsage,
  resolveRelativeDate,
  MACRO_ICONS,
  type SearchMacro,
  type SearchMacroCriteria,
} from '../../services/searchMacroService';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMoved: () => void;
}

type DatePreset = 'custom' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisMonth' | 'lastMonth';

export const SearchModal = ({ isOpen, onClose, onMoved }: SearchModalProps) => {
  // Search criteria state
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('custom');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasAttachments, setHasAttachments] = useState<boolean | undefined>(undefined);
  const [isRead, setIsRead] = useState<boolean | undefined>(undefined);
  const [importance, setImportance] = useState<'high' | 'normal' | 'low' | undefined>(undefined);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [filterUncategorized, setFilterUncategorized] = useState(false);
  const [selectedSourceFolder, setSelectedSourceFolder] = useState('');
  const [direction, setDirection] = useState<'all' | 'incoming' | 'outgoing'>('all');

  // Results state
  const [results, setResults] = useState<Email[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Folders & Categories state
  const [folders, setFolders] = useState<FolderWithPath[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [selectedDestFolder, setSelectedDestFolder] = useState('');
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  // Macros state
  const [macros, setMacros] = useState<SearchMacro[]>([]);
  const [showMacros, setShowMacros] = useState(true);
  const [showSaveMacro, setShowSaveMacro] = useState(false);
  const [macroName, setMacroName] = useState('');
  const [macroDescription, setMacroDescription] = useState('');
  const [macroIcon, setMacroIcon] = useState('🔍');
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Action state
  const [isMoving, setIsMoving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Advanced options toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFolders();
      loadCategories();
      setMacros(loadMacros());
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

  const loadCategories = () => {
    const cats = getActiveCategories();
    setCategories(cats.map((c) => c.name));
  };

  const buildSearchCriteria = (): SearchCriteria => {
    const criteria: SearchCriteria = {};

    if (query.trim()) criteria.query = query.trim();
    if (from.trim()) criteria.from = from.trim();
    if (subject.trim()) criteria.subject = subject.trim();

    // Handle date preset
    if (datePreset !== 'custom') {
      const dates = resolveRelativeDate(datePreset);
      if (dates) {
        criteria.dateFrom = dates.from;
        criteria.dateTo = dates.to;
      }
    } else {
      if (dateFrom) criteria.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        criteria.dateTo = endDate.toISOString();
      }
    }

    if (hasAttachments !== undefined) criteria.hasAttachments = hasAttachments;
    if (isRead !== undefined) criteria.isRead = isRead;

    // Handle direction filter
    if (direction === 'incoming') {
      criteria.folderId = 'inbox';
    } else if (direction === 'outgoing') {
      criteria.folderId = 'sentitems';
    } else if (selectedSourceFolder) {
      criteria.folderId = selectedSourceFolder;
    }

    return criteria;
  };

  const handleSearch = async () => {
    const criteria = buildSearchCriteria();

    // At least one criterion required
    const hasCriteria = Object.keys(criteria).length > 0 ||
      importance !== undefined ||
      selectedCategories.length > 0 ||
      filterUncategorized;

    if (!hasCriteria) {
      setError('Bitte mindestens ein Suchkriterium angeben');
      return;
    }

    try {
      setIsSearching(true);
      setError(null);
      setSuccess(null);
      setSelectedIds(new Set());

      const result = await searchEmails(criteria, 200);
      let filteredResults = result.value;

      // Client-side filters for fields not supported by Graph API search
      if (importance !== undefined) {
        filteredResults = filteredResults.filter((e) => e.importance === importance);
      }

      if (filterUncategorized) {
        filteredResults = filteredResults.filter((e) => e.categories.length === 0);
      } else if (selectedCategories.length > 0) {
        filteredResults = filteredResults.filter((e) =>
          selectedCategories.some((cat) => e.categories.includes(cat))
        );
      }

      if (to.trim()) {
        const toPattern = to.toLowerCase();
        filteredResults = filteredResults.filter((e) =>
          e.toRecipients?.some((r) =>
            r.emailAddress.address?.toLowerCase().includes(toPattern) ||
            r.emailAddress.name?.toLowerCase().includes(toPattern)
          )
        );
      }

      setResults(filteredResults);
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

  const handleDelete = async () => {
    if (selectedIds.size === 0) {
      setError('Keine E-Mails ausgewählt');
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      setSuccess(null);
      setShowDeleteConfirm(false);

      await deleteEmailsBatch(Array.from(selectedIds));

      setResults((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      const deletedCount = selectedIds.size;
      setSelectedIds(new Set());
      setSuccess(`${deletedCount} E-Mail(s) erfolgreich gelöscht`);
      onMoved();
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Löschen fehlgeschlagen');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCategorize = async (category: string) => {
    if (selectedIds.size === 0) {
      setError('Keine E-Mails ausgewählt');
      return;
    }

    try {
      setIsCategorizing(true);
      setError(null);
      setSuccess(null);
      setShowCategoryPicker(false);

      const updates = Array.from(selectedIds).map((id) => ({
        id,
        categories: [category],
      }));

      await setEmailCategoriesBatch(updates);

      // Update local results
      setResults((prev) =>
        prev.map((e) =>
          selectedIds.has(e.id) ? { ...e, categories: [category] } : e
        )
      );

      setSuccess(`${selectedIds.size} E-Mail(s) als "${category}" kategorisiert`);
      setSelectedIds(new Set());
      onMoved();
    } catch (err) {
      console.error('Categorize failed:', err);
      setError('Kategorisieren fehlgeschlagen');
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleReset = () => {
    setQuery('');
    setFrom('');
    setTo('');
    setSubject('');
    setDatePreset('custom');
    setDateFrom('');
    setDateTo('');
    setHasAttachments(undefined);
    setIsRead(undefined);
    setImportance(undefined);
    setSelectedCategories([]);
    setFilterUncategorized(false);
    setSelectedSourceFolder('');
    setDirection('all');
    setResults([]);
    setSelectedIds(new Set());
    setHasSearched(false);
    setError(null);
    setSuccess(null);
  };

  // Macro functions
  const handleSaveMacro = () => {
    if (!macroName.trim()) {
      setError('Bitte einen Namen für das Makro angeben');
      return;
    }

    const criteria: SearchMacroCriteria = {};
    if (query.trim()) criteria.query = query.trim();
    if (from.trim()) criteria.from = from.trim();
    if (to.trim()) criteria.to = to.trim();
    if (subject.trim()) criteria.subject = subject.trim();
    if (datePreset !== 'custom') criteria.dateRelative = datePreset;
    if (dateFrom) criteria.dateFrom = dateFrom;
    if (dateTo) criteria.dateTo = dateTo;
    if (hasAttachments !== undefined) criteria.hasAttachments = hasAttachments;
    if (isRead !== undefined) criteria.isRead = isRead;
    if (importance !== undefined) criteria.importance = importance;
    if (selectedCategories.length > 0) criteria.categories = selectedCategories;
    if (filterUncategorized) criteria.categories = [];
    if (selectedSourceFolder) criteria.folderId = selectedSourceFolder;
    if (direction !== 'all') criteria.direction = direction;

    createMacro(macroName.trim(), criteria, macroDescription.trim() || undefined, macroIcon);
    setMacros(loadMacros());
    setShowSaveMacro(false);
    setMacroName('');
    setMacroDescription('');
    setMacroIcon('🔍');
    setSuccess('Makro gespeichert');
  };

  const handleLoadMacro = (macro: SearchMacro) => {
    handleReset();
    const c = macro.criteria;

    if (c.query) setQuery(c.query);
    if (c.from) setFrom(c.from);
    if (c.to) setTo(c.to);
    if (c.subject) setSubject(c.subject);
    if (c.dateRelative) {
      setDatePreset(c.dateRelative);
    } else {
      if (c.dateFrom) setDateFrom(c.dateFrom.split('T')[0]);
      if (c.dateTo) setDateTo(c.dateTo.split('T')[0]);
    }
    if (c.hasAttachments !== undefined) setHasAttachments(c.hasAttachments);
    if (c.isRead !== undefined) setIsRead(c.isRead);
    if (c.importance) setImportance(c.importance);
    if (c.categories !== undefined) {
      if (c.categories.length === 0) {
        setFilterUncategorized(true);
      } else {
        setSelectedCategories(c.categories);
      }
    }
    if (c.folderId) setSelectedSourceFolder(c.folderId);
    if (c.direction) setDirection(c.direction);

    recordMacroUsage(macro.id);
    setMacros(loadMacros());
  };

  const handleDeleteMacro = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Makro wirklich löschen?')) {
      deleteMacro(id);
      setMacros(loadMacros());
    }
  };

  const handleRunMacro = async (macro: SearchMacro) => {
    handleLoadMacro(macro);
    // Small delay to let state update
    setTimeout(() => {
      handleSearch();
    }, 100);
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

  const toggleCategoryFilter = (cat: string) => {
    setFilterUncategorized(false);
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Search className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">E-Mails suchen & verwalten</h2>
              <p className="text-sm text-text-secondary">
                Erweiterte Suche mit Makros und Aktionen
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

        <div className="flex-1 overflow-hidden flex">
          {/* Sidebar - Macros */}
          {showMacros && (
            <div className="w-64 border-r border-border flex flex-col bg-gray-50">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-sm font-medium text-text">Gespeicherte Suchen</span>
                <button
                  onClick={() => setShowSaveMacro(true)}
                  className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                  title="Aktuelle Suche speichern"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {macros.map((macro) => (
                  <div
                    key={macro.id}
                    className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                    onClick={() => handleLoadMacro(macro)}
                  >
                    <span className="text-lg">{macro.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{macro.name}</p>
                      {macro.description && (
                        <p className="text-xs text-text-secondary truncate">{macro.description}</p>
                      )}
                    </div>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunMacro(macro);
                        }}
                        className="p-1 text-primary hover:bg-primary/10 rounded"
                        title="Ausführen"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      {!macro.id.startsWith('default_') && (
                        <button
                          onClick={(e) => handleDeleteMacro(macro.id, e)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Löschen"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search Form */}
            <div className="px-6 py-4 border-b border-border bg-gray-50 space-y-4">
              {/* Row 1: Main search fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      placeholder="*@domain.com oder Name"
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
              </div>

              {/* Row 2: Date & Quick filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Date Preset */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    <Clock className="w-4 h-4 inline mr-1" />
                    Zeitraum
                  </label>
                  <select
                    value={datePreset}
                    onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="custom">Benutzerdefiniert</option>
                    <option value="today">Heute</option>
                    <option value="yesterday">Gestern</option>
                    <option value="last7days">Letzte 7 Tage</option>
                    <option value="last30days">Letzte 30 Tage</option>
                    <option value="thisMonth">Dieser Monat</option>
                    <option value="lastMonth">Letzter Monat</option>
                  </select>
                </div>

                {/* Direction */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    Richtung
                  </label>
                  <select
                    value={direction}
                    onChange={(e) => {
                      setDirection(e.target.value as 'all' | 'incoming' | 'outgoing');
                      setSelectedSourceFolder('');
                    }}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="all">Alle</option>
                    <option value="incoming">Eingehend</option>
                    <option value="outgoing">Ausgehend</option>
                  </select>
                </div>

                {/* Attachments */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    <Paperclip className="w-4 h-4 inline mr-1" />
                    Anhänge
                  </label>
                  <select
                    value={hasAttachments === undefined ? '' : hasAttachments.toString()}
                    onChange={(e) =>
                      setHasAttachments(e.target.value === '' ? undefined : e.target.value === 'true')
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">Egal</option>
                    <option value="true">Mit Anhang</option>
                    <option value="false">Ohne Anhang</option>
                  </select>
                </div>

                {/* Read Status */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    <Eye className="w-4 h-4 inline mr-1" />
                    Status
                  </label>
                  <select
                    value={isRead === undefined ? '' : isRead.toString()}
                    onChange={(e) =>
                      setIsRead(e.target.value === '' ? undefined : e.target.value === 'true')
                    }
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">Alle</option>
                    <option value="false">Ungelesen</option>
                    <option value="true">Gelesen</option>
                  </select>
                </div>
              </div>

              {/* Row 3: Advanced toggle & additional filters */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Erweiterte Filter
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMacros(!showMacros)}
                    className="px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {showMacros ? 'Makros ausblenden' : 'Makros einblenden'}
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-3 py-1.5 text-sm text-text-secondary hover:text-text hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Zurücksetzen
                  </button>
                  <button
                    onClick={() => setShowSaveMacro(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  >
                    <Save className="w-4 h-4" />
                    Speichern
                  </button>
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="flex items-center gap-2 px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
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

              {/* Advanced filters */}
              {showAdvanced && (
                <div className="pt-4 border-t border-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Custom dates */}
                    {datePreset === 'custom' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1">
                            Datum von
                          </label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1">
                            Datum bis
                          </label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </div>
                      </>
                    )}

                    {/* To (recipient) */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        An (Empfänger)
                      </label>
                      <input
                        type="text"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        placeholder="E-Mail oder Name..."
                        className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                    </div>

                    {/* Importance */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        <Star className="w-4 h-4 inline mr-1" />
                        Priorität
                      </label>
                      <select
                        value={importance || ''}
                        onChange={(e) =>
                          setImportance(e.target.value ? (e.target.value as 'high' | 'normal' | 'low') : undefined)
                        }
                        className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="">Alle</option>
                        <option value="high">Hoch</option>
                        <option value="normal">Normal</option>
                        <option value="low">Niedrig</option>
                      </select>
                    </div>

                    {/* Source folder */}
                    {direction === 'all' && (
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">
                          <Folder className="w-4 h-4 inline mr-1" />
                          Quellordner
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
                    )}
                  </div>

                  {/* Category filter */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      <Tag className="w-4 h-4 inline mr-1" />
                      Kategorien
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setFilterUncategorized(!filterUncategorized);
                          setSelectedCategories([]);
                        }}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                          filterUncategorized
                            ? 'bg-gray-800 text-white border-gray-800'
                            : 'border-border text-text-secondary hover:border-gray-400'
                        }`}
                      >
                        Unkategorisiert
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => toggleCategoryFilter(cat)}
                          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                            selectedCategories.includes(cat)
                              ? 'bg-primary text-white border-primary'
                              : 'border-border text-text-secondary hover:border-primary'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Error/Success Messages */}
            {(error || success) && (
              <div className={`px-6 py-3 ${error ? 'bg-red-50' : 'bg-green-50'}`}>
                <div className={`flex items-center gap-2 text-sm ${error ? 'text-red-700' : 'text-green-700'}`}>
                  {error ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {error || success}
                </div>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Results Header */}
              {hasSearched && (
                <div className="px-6 py-3 border-b border-border bg-white">
                  <div className="flex items-center justify-between flex-wrap gap-3">
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

                    {/* Action controls */}
                    {selectedIds.size > 0 && (
                      <div className="flex items-center gap-2">
                        {/* Category picker */}
                        <div className="relative">
                          <button
                            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
                            disabled={isCategorizing}
                            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg hover:bg-gray-50 transition-colors text-sm"
                          >
                            {isCategorizing ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Tag className="w-4 h-4 text-text-secondary" />
                            )}
                            Kategorisieren
                          </button>
                          {showCategoryPicker && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-border rounded-lg shadow-lg z-50 py-1">
                              {categories.map((cat) => (
                                <button
                                  key={cat}
                                  onClick={() => handleCategorize(cat)}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                                >
                                  {cat}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Folder picker */}
                        <div className="relative">
                          <button
                            onClick={() => setShowFolderPicker(!showFolderPicker)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg hover:bg-gray-50 transition-colors text-sm"
                          >
                            <Folder className="w-4 h-4 text-text-secondary" />
                            <span className="max-w-[150px] truncate">{getDestFolderName()}</span>
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
                                      <Folder className="w-4 h-4 flex-shrink-0" />
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
                          disabled={isMoving || isDeleting || !selectedDestFolder}
                          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
                        >
                          {isMoving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Folder className="w-4 h-4" />
                          )}
                          Verschieben ({selectedIds.size})
                        </button>

                        {/* Delete button */}
                        <div className="relative">
                          <button
                            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                            disabled={isMoving || isDeleting}
                            className="flex items-center gap-2 px-4 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
                          >
                            {isDeleting ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                            Löschen
                          </button>

                          {showDeleteConfirm && (
                            <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-border rounded-lg shadow-lg z-50 p-4">
                              <p className="text-sm text-text mb-3">
                                <strong>{selectedIds.size} E-Mail(s)</strong> wirklich löschen?
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setShowDeleteConfirm(false)}
                                  className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  Abbrechen
                                </button>
                                <button
                                  onClick={handleDelete}
                                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                  Ja, löschen
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                        <div className="pt-1">
                          {selectedIds.has(email.id) ? (
                            <CheckSquare className="w-5 h-5 text-primary" />
                          ) : (
                            <Square className="w-5 h-5 text-text-secondary" />
                          )}
                        </div>

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
                          {!selectedSourceFolder && email.parentFolderId && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-text-secondary">
                                <Folder className="w-3 h-3" />
                                {folders.find((f) => f.id === email.parentFolderId)?.path || 'Posteingang'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {email.importance === 'high' && (
                            <Star className="w-4 h-4 text-warning fill-warning" />
                          )}
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
                    <p className="text-sm mt-1">oder wähle ein gespeichertes Makro</p>
                  </div>
                )}
              </div>
            </div>
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

        {/* Save Macro Modal */}
        {showSaveMacro && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-text mb-4">Suche als Makro speichern</h3>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <button
                      onClick={() => setShowIconPicker(!showIconPicker)}
                      className="w-12 h-12 text-2xl bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center"
                    >
                      {macroIcon}
                    </button>
                    {showIconPicker && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-lg shadow-lg z-50 p-2 grid grid-cols-8 gap-1">
                        {MACRO_ICONS.map((icon) => (
                          <button
                            key={icon}
                            onClick={() => {
                              setMacroIcon(icon);
                              setShowIconPicker(false);
                            }}
                            className="w-7 h-7 text-lg hover:bg-gray-100 rounded transition-colors"
                          >
                            {icon}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={macroName}
                      onChange={(e) => setMacroName(e.target.value)}
                      placeholder="Name des Makros"
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={macroDescription}
                    onChange={(e) => setMacroDescription(e.target.value)}
                    placeholder="Beschreibung (optional)"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-text-secondary mb-2">Gespeicherte Kriterien:</p>
                  <div className="flex flex-wrap gap-1">
                    {query && <span className="px-2 py-0.5 bg-white rounded text-xs">Text: {query}</span>}
                    {from && <span className="px-2 py-0.5 bg-white rounded text-xs">Von: {from}</span>}
                    {subject && <span className="px-2 py-0.5 bg-white rounded text-xs">Betreff: {subject}</span>}
                    {datePreset !== 'custom' && <span className="px-2 py-0.5 bg-white rounded text-xs">Zeitraum: {datePreset}</span>}
                    {hasAttachments !== undefined && <span className="px-2 py-0.5 bg-white rounded text-xs">Anhänge: {hasAttachments ? 'Ja' : 'Nein'}</span>}
                    {isRead !== undefined && <span className="px-2 py-0.5 bg-white rounded text-xs">{isRead ? 'Gelesen' : 'Ungelesen'}</span>}
                    {importance && <span className="px-2 py-0.5 bg-white rounded text-xs">Priorität: {importance}</span>}
                    {selectedCategories.length > 0 && <span className="px-2 py-0.5 bg-white rounded text-xs">Kategorien: {selectedCategories.join(', ')}</span>}
                    {filterUncategorized && <span className="px-2 py-0.5 bg-white rounded text-xs">Unkategorisiert</span>}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowSaveMacro(false);
                    setMacroName('');
                    setMacroDescription('');
                    setMacroIcon('🔍');
                  }}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text border border-border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSaveMacro}
                  className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
