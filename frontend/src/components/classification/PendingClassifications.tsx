import { useState, useEffect } from 'react';
import { Clock, Check, X, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { CategoryBadge } from '../email/CategoryBadge';
import { useClassify } from '../../hooks/useClassify';
import { setEmailCategory, setEmailCategoriesBatch } from '../../services/graphService';

interface PendingClassificationsProps {
  onApplied?: () => void;
  compact?: boolean;
}

export const PendingClassifications = ({ onApplied, compact = false }: PendingClassificationsProps) => {
  const { getPendingClassifications, markAsApplied, removeFromCache, clearPendingClassifications } = useClassify();
  const [pending, setPending] = useState(getPendingClassifications());
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [isApplying, setIsApplying] = useState<string | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);

  // Refresh pending list
  const refreshPending = () => {
    setPending(getPendingClassifications());
  };

  useEffect(() => {
    refreshPending();
    // Refresh when window gets focus (in case classifications happen in another tab)
    const handleFocus = () => refreshPending();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handleApply = async (emailId: string, category: string) => {
    setIsApplying(emailId);
    try {
      await setEmailCategory(emailId, [category]);
      markAsApplied(emailId);
      refreshPending();
      onApplied?.();
    } catch (error) {
      console.error('Failed to apply category:', error);
    } finally {
      setIsApplying(null);
    }
  };

  const handleDismiss = (emailId: string) => {
    removeFromCache(emailId);
    refreshPending();
  };

  const handleApplyAll = async () => {
    if (pending.length === 0) return;

    setIsApplyingAll(true);
    try {
      // Batch apply all pending classifications
      const updates = pending.map((item) => ({
        id: item.emailId,
        categories: [item.classification.category],
      }));

      await setEmailCategoriesBatch(updates);

      // Mark all as applied
      for (const item of pending) {
        markAsApplied(item.emailId);
      }

      refreshPending();
      onApplied?.();
    } catch (error) {
      console.error('Failed to apply all categories:', error);
    } finally {
      setIsApplyingAll(false);
    }
  };

  const handleClearAll = () => {
    clearPendingClassifications();
    refreshPending();
  };

  if (pending.length === 0) {
    return null;
  }

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `vor ${days} Tag${days > 1 ? 'en' : ''}`;
    if (hours > 0) return `vor ${hours} Std.`;
    if (minutes > 0) return `vor ${minutes} Min.`;
    return 'gerade eben';
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-text">Ausstehende Klassifizierungen</h3>
            <p className="text-sm text-text-secondary">
              {pending.length} E-Mail{pending.length !== 1 ? 's' : ''} warten auf Anwendung
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 bg-primary text-white text-sm font-medium rounded-full">
            {pending.length}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-text-secondary" />
          ) : (
            <ChevronDown className="w-5 h-5 text-text-secondary" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Action buttons */}
          <div className="px-4 py-2 bg-gray-50 border-b border-border flex items-center justify-between">
            <p className="text-xs text-text-secondary">
              Klassifizierungen werden 7 Tage gespeichert
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAll}
                className="text-xs text-text-secondary hover:text-red-600 transition-colors"
              >
                Alle verwerfen
              </button>
              <button
                onClick={handleApplyAll}
                disabled={isApplyingAll}
                className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
              >
                {isApplyingAll ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Alle anwenden
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {pending.map((item) => (
              <div
                key={item.emailId}
                className="px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text truncate text-sm">
                      {item.subject || '(Kein Betreff)'}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      {item.sender}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <CategoryBadge category={item.classification.category} size="sm" />
                      <span className="text-xs text-text-secondary">
                        {Math.round(item.classification.confidence * 100)}% Konfidenz
                      </span>
                      <span className="text-xs text-text-secondary">
                        · {formatTime(item.timestamp)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleApply(item.emailId, item.classification.category)}
                      disabled={isApplying === item.emailId}
                      className="p-1.5 text-success hover:bg-success/10 rounded transition-colors disabled:opacity-50"
                      title="Anwenden"
                    >
                      {isApplying === item.emailId ? (
                        <span className="w-4 h-4 border-2 border-success/30 border-t-success rounded-full animate-spin block" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDismiss(item.emailId)}
                      className="p-1.5 text-text-secondary hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Verwerfen"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
