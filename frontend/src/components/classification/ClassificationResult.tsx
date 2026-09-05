import { Check, AlertCircle, Lightbulb } from 'lucide-react';
import { CategoryBadge } from '../email/CategoryBadge';
import type { Classification } from '../../types';

interface ClassificationResultProps {
  result: Classification;
  onApply?: () => void;
  onDismiss?: () => void;
  isApplying?: boolean;
}

export const ClassificationResult = ({
  result,
  onApply,
  onDismiss,
  isApplying,
}: ClassificationResultProps) => {
  const confidencePercent = Math.round(result.confidence * 100);
  const confidenceColor =
    result.confidence >= 0.8 ? 'text-success' : result.confidence >= 0.5 ? 'text-warning' : 'text-error';

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary mb-2">Vorgeschlagene Kategorie:</p>
          <CategoryBadge category={result.category} size="md" />
        </div>
        <div className={`text-sm font-medium ${confidenceColor}`}>
          {confidencePercent}% sicher
        </div>
      </div>

      <div className="flex items-start gap-2 text-sm text-text-secondary">
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>{result.reasoning}</p>
      </div>

      {result.suggestedAction && (
        <div className="flex items-start gap-2 text-sm text-primary bg-primary/5 p-3 rounded-lg">
          <Lightbulb className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{result.suggestedAction}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onApply}
          disabled={isApplying}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          Anwenden
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-text-secondary hover:text-text hover:bg-gray-100 rounded-lg transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
};
