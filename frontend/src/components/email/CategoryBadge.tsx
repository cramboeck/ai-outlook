import { getCategoryByName, getPresetCssColor } from '../../config/categories';

interface CategoryBadgeProps {
  category: string;
  size?: 'sm' | 'md';
  showEmoji?: boolean;
}

export const CategoryBadge = ({ category, size = 'md', showEmoji = true }: CategoryBadgeProps) => {
  const categoryInfo = getCategoryByName(category);
  const color = categoryInfo ? getPresetCssColor(categoryInfo.color) : '#8e8cd8';
  const emoji = categoryInfo?.emoji || '';

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium rounded-full ${sizes[size]}`}
      style={{
        backgroundColor: `${color}15`,
        color: color,
      }}
    >
      {showEmoji && emoji && <span>{emoji}</span>}
      {category}
    </span>
  );
};
