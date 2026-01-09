import { useState, useEffect } from 'react';
import { Check, Loader2, AlertCircle, FileSignature, Save, Trash2, Eye, Code } from 'lucide-react';
import { CATEGORIES, getPresetCssColor } from '../config/categories';
import { useCategories } from '../hooks/useCategories';

const SIGNATURE_STORAGE_KEY = 'postpilot_signature';

export const getStoredSignature = (): string => {
  return localStorage.getItem(SIGNATURE_STORAGE_KEY) || '';
};

export const Settings = () => {
  const { masterCategories, ensureMailSortCategories, isCreating } = useCategories();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Signature state
  const [signature, setSignature] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [signatureSaved, setSignatureSaved] = useState(false);

  useEffect(() => {
    setSignature(getStoredSignature());
  }, []);

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

  // Graph API returns 'displayName', not 'name'
  const existingCategoryNames = masterCategories.map((c: any) => c.displayName || c.name);
  const missingCategories = CATEGORIES.filter((c) => !existingCategoryNames.includes(c.name));

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
        <p className="text-text-secondary">Verwalten Sie Ihre MailSort Kategorien</p>
      </div>

      {/* Categories Section */}
      <div className="bg-white rounded-xl border border-border">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text">Kategorien</h2>
          <p className="text-sm text-text-secondary">
            Diese Kategorien werden für die KI-Klassifizierung verwendet
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Category List */}
          <div className="space-y-3">
            {CATEGORIES.map((category) => {
              const exists = existingCategoryNames.includes(category.name);
              const color = getPresetCssColor(category.color);

              return (
                <div
                  key={category.name}
                  className="flex items-center justify-between p-3 border border-border rounded-lg"
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {exists ? (
                      <span className="flex items-center gap-1 text-sm text-success">
                        <Check className="w-4 h-4" />
                        In Outlook
                      </span>
                    ) : (
                      <span className="text-sm text-text-secondary">Nicht in Outlook</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

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
                  Kategorien synchronisieren
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
              dangerouslySetInnerHTML={{ __html: signature }}
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
          Outlook-Voreinstellungen.
        </p>
      </div>
    </div>
  );
};
