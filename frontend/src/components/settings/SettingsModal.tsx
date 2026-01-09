import { useState, useEffect } from 'react';
import { X, Settings, FileSignature, Save, Trash2, Eye, Code } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SIGNATURE_STORAGE_KEY = 'postpilot_signature';

export const getStoredSignature = (): string => {
  return localStorage.getItem(SIGNATURE_STORAGE_KEY) || '';
};

export const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [signature, setSignature] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const stored = getStoredSignature();
      setSignature(stored);
      setSaved(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem(SIGNATURE_STORAGE_KEY, signature);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    setSignature('');
    localStorage.removeItem(SIGNATURE_STORAGE_KEY);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Einstellungen</h2>
              <p className="text-sm text-text-secondary">PostPilot konfigurieren</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Signature Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-primary" />
              <h3 className="text-base font-medium text-text">E-Mail Signatur</h3>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>So importierst du deine Outlook-Signatur:</strong>
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
                className="min-h-[200px] max-h-[300px] overflow-y-auto border border-border rounded-lg p-4 bg-white"
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
                className="w-full h-[200px] px-4 py-3 border border-border rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            )}

            {/* Preview of how it will look */}
            {signature && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-border">
                  <p className="text-xs font-medium text-text-secondary">So wird die Signatur angehängt:</p>
                </div>
                <div className="p-4 bg-white">
                  <p className="text-sm text-text mb-3">...deine generierte Antwort hier...</p>
                  <div className="border-t border-gray-200 pt-3">
                    <div
                      className="text-sm"
                      dangerouslySetInnerHTML={{ __html: signature }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-gray-50 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Signatur löschen
          </button>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-green-600">Gespeichert!</span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm"
            >
              <Save className="w-4 h-4" />
              Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
