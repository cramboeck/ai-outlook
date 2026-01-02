import { useState } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import { CATEGORIES, getPresetCssColor } from '../config/categories';
import { useCategories } from '../hooks/useCategories';

export const Settings = () => {
  const { masterCategories, ensureMailSortCategories, isCreating } = useCategories();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const existingCategoryNames = masterCategories.map((c) => c.name);
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
