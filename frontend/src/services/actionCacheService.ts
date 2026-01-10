// Action Cache Service
// Caches extracted actions to avoid re-processing and token waste

import type { ExtractedAction } from './actionService';

interface CachedActionSet {
  emailIds: string[];
  actions: ExtractedAction[];
  timestamp: number;
}

interface ActionCache {
  version: number;
  items: CachedActionSet[];
}

const STORAGE_KEY = 'postpilot_action_cache';
const CACHE_VERSION = 1;
const CACHE_TTL_HOURS = 24; // Cache expires after 24 hours

// Load cache from localStorage
export const loadActionCache = (): ActionCache => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const cache = JSON.parse(stored) as ActionCache;
      if (cache.version === CACHE_VERSION) {
        // Remove expired items
        const now = Date.now();
        const ttlMs = CACHE_TTL_HOURS * 60 * 60 * 1000;
        cache.items = cache.items.filter(item => now - item.timestamp < ttlMs);
        return cache;
      }
    }
  } catch (e) {
    console.error('Failed to load action cache:', e);
  }
  return { version: CACHE_VERSION, items: [] };
};

// Save cache to localStorage
const saveActionCache = (cache: ActionCache): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save action cache:', e);
  }
};

// Get cached actions for a set of email IDs
export const getCachedActions = (emailIds: string[]): ExtractedAction[] | null => {
  const cache = loadActionCache();
  const sortedIds = [...emailIds].sort().join(',');

  for (const item of cache.items) {
    const itemIds = [...item.emailIds].sort().join(',');
    if (itemIds === sortedIds) {
      return item.actions;
    }
  }

  return null;
};

// Check if we have actions cached for these emails
export const hasActionCache = (emailIds: string[]): boolean => {
  return getCachedActions(emailIds) !== null;
};

// Cache actions for a set of emails
export const cacheActions = (emailIds: string[], actions: ExtractedAction[]): void => {
  const cache = loadActionCache();
  const sortedIds = [...emailIds].sort().join(',');

  // Remove any existing entry for these emails
  cache.items = cache.items.filter(item => {
    const itemIds = [...item.emailIds].sort().join(',');
    return itemIds !== sortedIds;
  });

  // Add new entry
  cache.items.push({
    emailIds,
    actions,
    timestamp: Date.now(),
  });

  // Keep only last 10 action sets
  if (cache.items.length > 10) {
    cache.items = cache.items.slice(-10);
  }

  saveActionCache(cache);
};

// Get all cached actions
export const getAllCachedActions = (): ExtractedAction[] => {
  const cache = loadActionCache();
  const allActions: ExtractedAction[] = [];

  for (const item of cache.items) {
    allActions.push(...item.actions);
  }

  // Remove duplicates by emailId + action
  const seen = new Set<string>();
  return allActions.filter(action => {
    const key = `${action.emailId}-${action.action}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Clear action cache
export const clearActionCache = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// Remove specific email from cache
export const removeEmailFromActionCache = (emailId: string): void => {
  const cache = loadActionCache();

  // Remove actions for this email from all cached sets
  for (const item of cache.items) {
    item.actions = item.actions.filter(a => a.emailId !== emailId);
    item.emailIds = item.emailIds.filter(id => id !== emailId);
  }

  // Remove empty sets
  cache.items = cache.items.filter(item => item.emailIds.length > 0);

  saveActionCache(cache);
};
