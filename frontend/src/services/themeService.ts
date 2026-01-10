// Theme and Display Settings Service

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontSize = 'small' | 'medium' | 'large';

export interface DisplaySettings {
  theme: ThemeMode;
  fontSize: FontSize;
  compactView: boolean;
}

const STORAGE_KEY = 'postpilot_display_settings';

const DEFAULT_SETTINGS: DisplaySettings = {
  theme: 'light',
  fontSize: 'medium',
  compactView: false,
};

export const getDisplaySettings = (): DisplaySettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load display settings:', e);
  }
  return DEFAULT_SETTINGS;
};

export const saveDisplaySettings = (settings: DisplaySettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    applyDisplaySettings(settings);
  } catch (e) {
    console.error('Failed to save display settings:', e);
  }
};

export const applyDisplaySettings = (settings: DisplaySettings): void => {
  const root = document.documentElement;

  // Apply theme
  const isDark = settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');

  // Apply font size
  root.setAttribute('data-font-size', settings.fontSize);

  // Apply compact view
  root.setAttribute('data-compact', settings.compactView ? 'true' : 'false');
};

// Font size CSS values
export const FONT_SIZE_VALUES: Record<FontSize, { base: string; small: string; xs: string }> = {
  small: { base: '13px', small: '11px', xs: '10px' },
  medium: { base: '14px', small: '12px', xs: '11px' },
  large: { base: '16px', small: '14px', xs: '12px' },
};

// Initialize settings on load
export const initializeDisplaySettings = (): void => {
  const settings = getDisplaySettings();
  applyDisplaySettings(settings);

  // Listen for system theme changes
  if (settings.theme === 'system') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      applyDisplaySettings(getDisplaySettings());
    });
  }
};
