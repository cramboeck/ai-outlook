import type { CategoryBucket } from '../../services/inboxCategorizer';

interface CategoryStackedBarProps {
  buckets: CategoryBucket[];
  total: number;
  onSelectCategory: (id: string) => void;
}

export const CategoryStackedBar = ({ buckets, total, onSelectCategory }: CategoryStackedBarProps) => {
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      {/* Balken */}
      <div
        className="w-full h-3 rounded-full overflow-hidden flex bg-gray-100"
        role="img"
        aria-label={`Verteilung von ${total} ungelesenen Mails auf ${buckets.length} Kategorien`}
      >
        {buckets.map((b) => {
          const pct = (b.mails.length / total) * 100;
          return (
            <button
              key={b.rule.id}
              type="button"
              onClick={() => onSelectCategory(b.rule.id)}
              title={`${b.rule.label}: ${b.mails.length}`}
              className="h-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary"
              style={{ width: `${pct}%`, backgroundColor: b.rule.colorHex }}
              aria-label={`${b.rule.label}: ${b.mails.length}`}
            />
          );
        })}
      </div>

      {/* Legende */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {buckets.map((b) => (
          <button
            key={b.rule.id}
            type="button"
            onClick={() => onSelectCategory(b.rule.id)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: b.rule.colorHex }}
            />
            <span className="text-text-secondary">
              {b.rule.emoji} {b.rule.label}
            </span>
            <span className="font-medium text-text">{b.mails.length}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
