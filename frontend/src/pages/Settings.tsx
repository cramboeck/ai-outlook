import { useState, useEffect } from 'react';
import { sanitizeHtml } from '../utils/sanitize';
import {
  Check,
  Loader2,
  AlertCircle,
  FileSignature,
  Save,
  Trash2,
  Eye,
  Code,
  Plus,
  Edit2,
  RotateCcw,
  ChevronDown,
  X,
  Sun,
  Moon,
  Monitor,
  Type,
  LayoutList,
} from 'lucide-react';
import { CATEGORIES, getPresetCssColor } from '../config/categories';
import { useCategories } from '../hooks/useCategories';
import type { Category } from '../types';
import {
  getCustomCategoryConfig,
  saveCustomCategoryConfig,
  getActiveCategories,
  resetToDefaultCategories,
  isUsingCustomCategories,
  AVAILABLE_PRESETS,
  AVAILABLE_EMOJIS,
} from '../services/categoryService';
import {
  getDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
  type ThemeMode,
  type FontSize,
} from '../services/themeService';
import { RulesManager } from '../components/settings/RulesManager';

const SIGNATURE_STORAGE_KEY = 'postpilot_signature';

export const getStoredSignature = (): string => {
  return localStorage.getItem(SIGNATURE_STORAGE_KEY) || '';
};

// Category Edit Modal Component
const CategoryEditModal = ({
  category,
  isNew,
  onSave,
  onClose,
}: {
  category: Category | null;
  isNew: boolean;
  onSave: (category: Category) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState(category?.name || '');
  const [description, setDescription] = useState(category?.description || '');
  const [keywords, setKeywords] = useState(category?.keywords.join(', ') || '');
  const [color, setColor] = useState(category?.color || 'preset0');
  const [emoji, setEmoji] = useState(category?.emoji || '📧');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      description: description.trim(),
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      color,
      emoji,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-text">
            {isNew ? 'Neue Kategorie' : 'Kategorie bearbeiten'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Kunden"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Beschreibung
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="z.B. Kundenanfragen und Kommunikation"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Keywords (Komma-getrennt)
            </label>
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="z.B. kunde, anfrage, support"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <p className="text-xs text-text-secondary mt-1">
              Helfen der KI bei der Zuordnung
            </p>
          </div>

          {/* Color & Emoji */}
          <div className="flex gap-4">
            {/* Color */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Farbe
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-gray-50"
                >
                  <div
                    className="w-5 h-5 rounded-full border border-gray-200"
                    style={{ backgroundColor: getPresetCssColor(color) }}
                  />
                  <span className="text-sm">
                    {AVAILABLE_PRESETS.find((p) => p.id === color)?.name || 'Wählen'}
                  </span>
                  <ChevronDown className="w-4 h-4 ml-auto text-text-secondary" />
                </button>
                {showColorPicker && (
                  <div className="absolute top-full mt-1 left-0 w-full bg-white border border-border rounded-lg shadow-lg z-10 p-2">
                    <div className="grid grid-cols-5 gap-2">
                      {AVAILABLE_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setColor(preset.id);
                            setShowColorPicker(false);
                          }}
                          className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                            color === preset.id ? 'border-primary' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: preset.color }}
                          title={preset.name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Emoji */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Emoji
              </label>
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-border rounded-lg hover:bg-gray-50"
                >
                  <span className="text-lg">{emoji}</span>
                  <ChevronDown className="w-4 h-4 ml-auto text-text-secondary" />
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-full mt-1 left-0 w-full bg-white border border-border rounded-lg shadow-lg z-10 p-2">
                    <div className="grid grid-cols-6 gap-1">
                      {AVAILABLE_EMOJIS.map((e) => (
                        <button
                          key={e}
                          onClick={() => {
                            setEmoji(e);
                            setShowEmojiPicker(false);
                          }}
                          className={`w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 ${
                            emoji === e ? 'bg-primary/10' : ''
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:bg-gray-200 rounded-lg transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export const Settings = () => {
  const { masterCategories, ensureMailSortCategories, isCreating } = useCategories();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Category management state
  const [categories, setCategories] = useState<Category[]>([]);
  const [useCustomCategories, setUseCustomCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Signature state
  const [signature, setSignature] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [signatureSaved, setSignatureSaved] = useState(false);

  // Display settings state
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(getDisplaySettings);

  // Load categories on mount
  useEffect(() => {
    const config = getCustomCategoryConfig();
    if (config) {
      setCategories(config.categories);
      setUseCustomCategories(config.useCustom);
    } else {
      setCategories([...CATEGORIES]);
      setUseCustomCategories(false);
    }
  }, []);

  useEffect(() => {
    setSignature(getStoredSignature());
  }, []);

  // Get displayed categories based on mode
  const displayedCategories = useCustomCategories ? categories : CATEGORIES;

  const handleSaveSignature = () => {
    localStorage.setItem(SIGNATURE_STORAGE_KEY, signature);
    setSignatureSaved(true);
    setTimeout(() => setSignatureSaved(false), 2000);
  };

  const handleClearSignature = () => {
    setSignature('');
    localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    setSignatureSaved(true);
    setTimeout(() => setSignatureSaved(false), 2000);
  };

  // Display settings handlers
  const updateDisplaySetting = <K extends keyof DisplaySettings>(
    key: K,
    value: DisplaySettings[K]
  ) => {
    const newSettings = { ...displaySettings, [key]: value };
    setDisplaySettings(newSettings);
    saveDisplaySettings(newSettings);
  };

  const handleToggleCustomCategories = (enabled: boolean) => {
    setUseCustomCategories(enabled);
    if (enabled && categories.length === 0) {
      // Copy defaults when enabling custom for the first time
      setCategories([...CATEGORIES]);
    }
    saveCustomCategoryConfig({
      categories: enabled ? (categories.length > 0 ? categories : [...CATEGORIES]) : categories,
      useCustom: enabled,
      lastModified: new Date().toISOString(),
    });
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsNewCategory(true);
    setShowCategoryModal(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setIsNewCategory(false);
    setShowCategoryModal(true);
  };

  const handleDeleteCategory = (categoryName: string) => {
    const updated = categories.filter((c) => c.name !== categoryName);
    setCategories(updated);
    saveCustomCategoryConfig({
      categories: updated,
      useCustom: useCustomCategories,
      lastModified: new Date().toISOString(),
    });
  };

  const handleSaveCategory = (category: Category) => {
    let updated: Category[];
    if (isNewCategory) {
      updated = [...categories, category];
    } else {
      updated = categories.map((c) => (c.name === editingCategory?.name ? category : c));
    }
    setCategories(updated);
    saveCustomCategoryConfig({
      categories: updated,
      useCustom: useCustomCategories,
      lastModified: new Date().toISOString(),
    });
    setShowCategoryModal(false);
  };

  const handleResetCategories = () => {
    resetToDefaultCategories();
    setCategories([...CATEGORIES]);
    setUseCustomCategories(false);
    setSyncMessage({
      type: 'success',
      text: 'Kategorien auf Standard zurückgesetzt',
    });
    setTimeout(() => setSyncMessage(null), 3000);
  };

  // Graph API returns 'displayName', not 'name'
  const existingCategoryNames = masterCategories.map((c: any) => c.displayName || c.name);
  const activeCategories = getActiveCategories();
  const missingCategories = activeCategories.filter((c) => !existingCategoryNames.includes(c.name));

  const handleSyncCategories = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      await ensureMailSortCategories();
      setSyncMessage({
        type: 'success',
        text: 'Kategorien erfolgreich synchronisiert!',
      });
    } catch (error) {
      setSyncMessage({
        type: 'error',
        text: 'Fehler beim Synchronisieren der Kategorien.',
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-text">Einstellungen</h1>
        <p className="text-text-secondary">Verwalten Sie Ihre PostPilot Konfiguration</p>
      </div>

      {/* Display Settings Section */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Darstellung</h2>
          </div>
          <p className="text-sm text-text-secondary">
            Theme, Schriftgröße und Ansichtsoptionen
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Theme Selection */}
          <div>
            <label className="block text-sm font-medium text-text mb-3">
              Farbschema
            </label>
            <div className="flex gap-2">
              {([
                { value: 'light' as ThemeMode, icon: Sun, label: 'Hell' },
                { value: 'dark' as ThemeMode, icon: Moon, label: 'Dunkel' },
                { value: 'system' as ThemeMode, icon: Monitor, label: 'System' },
              ]).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => updateDisplaySetting('theme', value)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
                    displaySettings.theme === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Font Size Selection */}
          <div>
            <label className="block text-sm font-medium text-text mb-3">
              <Type className="w-4 h-4 inline mr-2" />
              Schriftgröße
            </label>
            <div className="flex gap-2">
              {([
                { value: 'small' as FontSize, label: 'Klein', sample: 'Aa' },
                { value: 'medium' as FontSize, label: 'Mittel', sample: 'Aa' },
                { value: 'large' as FontSize, label: 'Groß', sample: 'Aa' },
              ]).map(({ value, label, sample }) => (
                <button
                  key={value}
                  onClick={() => updateDisplaySetting('fontSize', value)}
                  className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all min-w-[80px] ${
                    displaySettings.fontSize === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/50 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="font-medium"
                    style={{
                      fontSize: value === 'small' ? '12px' : value === 'medium' ? '14px' : '16px',
                    }}
                  >
                    {sample}
                  </span>
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Compact View Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <LayoutList className="w-5 h-5 text-text-secondary" />
              <div>
                <p className="font-medium text-text">Kompakte Ansicht</p>
                <p className="text-sm text-text-secondary">
                  Reduzierte Abstände und keine E-Mail-Vorschau
                </p>
              </div>
            </div>
            <button
              onClick={() => updateDisplaySetting('compactView', !displaySettings.compactView)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                displaySettings.compactView ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  displaySettings.compactView ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Categories Section */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text">KI-Kategorien</h2>
              <p className="text-sm text-text-secondary">
                Diese Kategorien werden für die KI-Klassifizierung verwendet
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">
                {useCustomCategories ? 'Benutzerdefiniert' : 'Standard'}
              </span>
              <button
                onClick={() => handleToggleCustomCategories(!useCustomCategories)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  useCustomCategories ? 'bg-primary' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                    useCustomCategories ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Category List */}
          <div className="space-y-3">
            {displayedCategories.map((category) => {
              const exists = existingCategoryNames.includes(category.name);
              const color = getPresetCssColor(category.color);

              return (
                <div
                  key={category.name}
                  className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-lg">{category.emoji}</span>
                    <div>
                      <p className="font-medium text-text">{category.name}</p>
                      <p className="text-sm text-text-secondary">{category.description}</p>
                      {category.keywords.length > 0 && (
                        <p className="text-xs text-text-secondary mt-0.5">
                          Keywords: {category.keywords.slice(0, 3).join(', ')}
                          {category.keywords.length > 3 && '...'}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {exists ? (
                      <span className="flex items-center gap-1 text-sm text-success">
                        <Check className="w-4 h-4" />
                        Outlook
                      </span>
                    ) : (
                      <span className="text-xs text-text-secondary">Nicht in Outlook</span>
                    )}
                    {useCustomCategories && (
                      <>
                        <button
                          onClick={() => handleEditCategory(category)}
                          className="p-1.5 text-text-secondary hover:text-primary hover:bg-primary/10 rounded transition-colors"
                          title="Bearbeiten"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(category.name)}
                          className="p-1.5 text-text-secondary hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Löschen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Category Button (only when using custom) */}
          {useCustomCategories && (
            <button
              onClick={handleAddCategory}
              className="flex items-center gap-2 w-full px-4 py-3 border-2 border-dashed border-border rounded-lg text-text-secondary hover:text-primary hover:border-primary transition-colors"
            >
              <Plus className="w-5 h-5" />
              Neue Kategorie hinzufügen
            </button>
          )}

          {/* Reset Button (only when using custom) */}
          {useCustomCategories && (
            <div className="flex justify-end">
              <button
                onClick={handleResetCategories}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Auf Standard zurücksetzen
              </button>
            </div>
          )}

          {/* Sync Button */}
          {missingCategories.length > 0 && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text">
                    {missingCategories.length} Kategorie(n) fehlen in Outlook
                  </p>
                  <p className="text-xs text-text-secondary">
                    Synchronisieren Sie die Kategorien, um sie in Outlook zu verwenden
                  </p>
                </div>
                <button
                  onClick={handleSyncCategories}
                  disabled={syncing || isCreating}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {syncing || isCreating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Synchronisieren
                </button>
              </div>
            </div>
          )}

          {/* Sync Message */}
          {syncMessage && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg ${
                syncMessage.type === 'success'
                  ? 'bg-success/10 text-success'
                  : 'bg-error/10 text-error'
              }`}
            >
              {syncMessage.type === 'success' ? (
                <Check className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              {syncMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* Rules Section */}
      <RulesManager />

      {/* Signature Section */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSignature className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">E-Mail Signatur</h2>
          </div>
          <p className="text-sm text-text-secondary">
            Wird automatisch an generierte Antworten angehängt
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Import Instructions */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium">
              So importierst du deine Outlook-Signatur:
            </p>
            <ol className="text-sm text-blue-700 mt-2 space-y-1 list-decimal list-inside">
              <li>Öffne <a href="https://outlook.office.com/mail/options/mail/messageContent" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">Outlook Signatur-Einstellungen</a></li>
              <li>Wähle deine Signatur und kopiere sie (Strg+A, Strg+C)</li>
              <li>Füge sie unten ein (Strg+V)</li>
            </ol>
          </div>

          {/* Toggle View */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                showPreview
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              Vorschau
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                !showPreview
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
              }`}
            >
              <Code className="w-4 h-4" />
              HTML
            </button>
          </div>

          {/* Signature Input/Preview */}
          {showPreview ? (
            <div
              className="min-h-[150px] max-h-[250px] overflow-y-auto border border-border rounded-lg p-4 bg-white"
              contentEditable
              onInput={(e) => setSignature(e.currentTarget.innerHTML)}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(signature) }}
              style={{ outline: 'none' }}
            />
          ) : (
            <textarea
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="<p>Mit freundlichen Grüßen</p><p><b>Max Mustermann</b></p>..."
              className="w-full h-[150px] px-4 py-3 border border-border rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleClearSignature}
              className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Löschen
            </button>
            <div className="flex items-center gap-3">
              {signatureSaved && (
                <span className="text-sm text-green-600">Gespeichert!</span>
              )}
              <button
                onClick={handleSaveSignature}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
              >
                <Save className="w-4 h-4" />
                Speichern
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">Hinweis</h3>
        <p className="text-sm text-text-secondary">
          Kategorien werden in Ihrem Outlook-Postfach erstellt und sind überall sichtbar -
          in Outlook Web, Desktop und Mobile. Die Farben entsprechen den Microsoft
          Outlook-Voreinstellungen. {isUsingCustomCategories() ? 'Sie verwenden benutzerdefinierte Kategorien.' : 'Sie verwenden die Standard-Kategorien.'}
        </p>
      </div>

      {/* Category Edit Modal */}
      {showCategoryModal && (
        <CategoryEditModal
          category={editingCategory}
          isNew={isNewCategory}
          onSave={handleSaveCategory}
          onClose={() => setShowCategoryModal(false)}
        />
      )}
    </div>
  );
};
