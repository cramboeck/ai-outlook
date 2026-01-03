import type { SmartView } from '../../types';

interface SmartViewsProps {
  views: SmartView[];
  activeViewId?: string;
  onViewSelect?: (view: SmartView) => void;
}

export const SmartViews = ({ views, activeViewId, onViewSelect }: SmartViewsProps) => {
  // Nur Views mit Elementen anzeigen
  const activeViews = views.filter((v) => (v.count ?? 0) > 0);

  if (activeViews.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-text flex items-center gap-2">
        <span>🔍</span> Smart Views
      </h2>
      <div className="flex flex-wrap gap-2">
        {activeViews.map((view) => (
          <button
            key={view.id}
            onClick={() => onViewSelect?.(view)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
              transition-all border
              ${
                activeViewId === view.id
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-text border-border hover:border-primary/50 hover:bg-primary/5'
              }
            `}
          >
            <span>{view.icon}</span>
            <span>{view.name}</span>
            <span
              className={`
                px-1.5 py-0.5 rounded-full text-xs
                ${
                  activeViewId === view.id
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-100 text-text-secondary'
                }
              `}
            >
              {view.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
