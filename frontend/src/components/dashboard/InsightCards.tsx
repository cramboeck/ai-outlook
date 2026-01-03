import { ChevronRight } from 'lucide-react';
import type { InsightCard } from '../../types';

interface InsightCardsProps {
  insights: InsightCard[];
  onInsightClick?: (insight: InsightCard) => void;
}

export const InsightCards = ({ insights, onInsightClick }: InsightCardsProps) => {
  if (insights.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
        <span className="text-4xl mb-2 block">✨</span>
        <h3 className="font-semibold text-green-800">Alles im Griff!</h3>
        <p className="text-green-600 text-sm">Keine dringenden Aktionen erforderlich</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text flex items-center gap-2">
        <span>🎯</span> Aktuelle Insights
      </h2>
      <div className="grid gap-3">
        {insights.slice(0, 4).map((insight) => (
          <button
            key={insight.id}
            onClick={() => onInsightClick?.(insight)}
            className="flex items-center justify-between p-4 bg-white border border-border rounded-xl hover:border-primary/50 hover:shadow-sm transition-all text-left group"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${insight.color} bg-opacity-10`}
                style={{
                  backgroundColor: `${getColorValue(insight.color)}15`,
                }}
              >
                {insight.icon}
              </div>
              <div>
                <h3 className="font-semibold text-text">{insight.title}</h3>
                <p className="text-sm text-text-secondary">{insight.description}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-text-secondary group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
};

// Helper: Tailwind-Klasse zu Hex-Farbe
function getColorValue(colorClass: string): string {
  const colors: Record<string, string> = {
    'bg-red-500': '#ef4444',
    'bg-orange-500': '#f97316',
    'bg-yellow-500': '#eab308',
    'bg-green-500': '#22c55e',
    'bg-blue-500': '#3b82f6',
    'bg-purple-500': '#a855f7',
    'bg-gray-500': '#6b7280',
  };
  return colors[colorClass] || '#6b7280';
}
