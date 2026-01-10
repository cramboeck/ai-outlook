import type { Category } from '../types';
import { CATEGORIES as DEFAULT_CATEGORIES } from '../config/categories';

const CUSTOM_CATEGORIES_KEY = 'postpilot_custom_categories';

export interface CustomCategoryConfig {
  categories: Category[];
  useCustom: boolean; // If true, use custom categories instead of defaults
  lastModified: string;
}

// Get saved custom category configuration
export const getCustomCategoryConfig = (): CustomCategoryConfig | null => {
  const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

// Save custom category configuration
export const saveCustomCategoryConfig = (config: CustomCategoryConfig): void => {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify({
    ...config,
    lastModified: new Date().toISOString(),
  }));
};

// Get active categories (custom if enabled, otherwise defaults)
export const getActiveCategories = (): Category[] => {
  const config = getCustomCategoryConfig();
  if (config?.useCustom && config.categories.length > 0) {
    return config.categories;
  }
  return DEFAULT_CATEGORIES;
};

// Reset to default categories
export const resetToDefaultCategories = (): void => {
  localStorage.removeItem(CUSTOM_CATEGORIES_KEY);
};

// Check if using custom categories
export const isUsingCustomCategories = (): boolean => {
  const config = getCustomCategoryConfig();
  return config?.useCustom === true && config.categories.length > 0;
};

// Get categories formatted for the API prompt
export const getCategoriesForPrompt = (): string => {
  const categories = getActiveCategories();
  return categories.map(cat =>
    `- "${cat.name}": ${cat.description}${cat.keywords.length > 0 ? ` (Keywords: ${cat.keywords.join(', ')})` : ''}`
  ).join('\n');
};

// Available preset colors for Outlook
export const AVAILABLE_PRESETS = [
  { id: 'preset0', name: 'Rot', color: '#d13438' },
  { id: 'preset1', name: 'Orange', color: '#ff8c00' },
  { id: 'preset2', name: 'Grün', color: '#107c10' },
  { id: 'preset3', name: 'Blau', color: '#0078d4' },
  { id: 'preset4', name: 'Lila', color: '#8764b8' },
  { id: 'preset5', name: 'Grau', color: '#5d5a58' },
  { id: 'preset6', name: 'Türkis', color: '#038387' },
  { id: 'preset7', name: 'Violett', color: '#8e8cd8' },
  { id: 'preset8', name: 'Pink', color: '#e3008c' },
  { id: 'preset9', name: 'Gelb', color: '#986f0b' },
];

// Available emojis for categories
export const AVAILABLE_EMOJIS = [
  '🔴', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤',
  '📧', '📌', '⚡', '💰', '👥', '📅', '⏰', '🔔',
  '📋', '✅', '❌', '⭐', '🎯', '💼', '🏠', '🔒',
];
