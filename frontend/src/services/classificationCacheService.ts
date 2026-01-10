// Classification Cache Service
// Caches AI classification results to avoid re-processing and token waste

import type { Classification } from '../types';

interface CachedClassification {
  emailId: string;
  subject: string;
  sender: string;
  classification: Classification;
  timestamp: number;
  applied: boolean;
}

interface ClassificationCache {
  version: number;
  items: CachedClassification[];
}

const STORAGE_KEY = 'postpilot_classification_cache';
const CACHE_VERSION = 1;
const CACHE_TTL_DAYS = 7; // Cache expires after 7 days

// Load cache from localStorage
export const loadCache = (): ClassificationCache => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const cache = JSON.parse(stored) as ClassificationCache;
      if (cache.version === CACHE_VERSION) {
        // Remove expired items
        const now = Date.now();
        const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
        cache.items = cache.items.filter(item => now - item.timestamp < ttlMs);
        return cache;
      }
    }
  } catch (e) {
    console.error('Failed to load classification cache:', e);
  }
  return { version: CACHE_VERSION, items: [] };
};

// Save cache to localStorage
const saveCache = (cache: ClassificationCache): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Failed to save classification cache:', e);
  }
};

// Get cached classification for an email
export const getCachedClassification = (emailId: string): CachedClassification | null => {
  const cache = loadCache();
  return cache.items.find(item => item.emailId === emailId && !item.applied) || null;
};

// Check if email has been classified (applied or pending)
export const hasClassification = (emailId: string): boolean => {
  const cache = loadCache();
  return cache.items.some(item => item.emailId === emailId);
};

// Add classification to cache
export const cacheClassification = (
  emailId: string,
  subject: string,
  sender: string,
  classification: Classification
): void => {
  const cache = loadCache();

  // Remove existing entry for this email
  cache.items = cache.items.filter(item => item.emailId !== emailId);

  // Add new entry
  cache.items.push({
    emailId,
    subject,
    sender,
    classification,
    timestamp: Date.now(),
    applied: false,
  });

  saveCache(cache);
};

// Mark classification as applied
export const markAsApplied = (emailId: string): void => {
  const cache = loadCache();
  const item = cache.items.find(item => item.emailId === emailId);
  if (item) {
    item.applied = true;
    saveCache(cache);
  }
};

// Get all pending (unapplied) classifications
export const getPendingClassifications = (): CachedClassification[] => {
  const cache = loadCache();
  return cache.items
    .filter(item => !item.applied)
    .sort((a, b) => b.timestamp - a.timestamp);
};

// Get count of pending classifications
export const getPendingCount = (): number => {
  return getPendingClassifications().length;
};

// Remove a classification from cache
export const removeFromCache = (emailId: string): void => {
  const cache = loadCache();
  cache.items = cache.items.filter(item => item.emailId !== emailId);
  saveCache(cache);
};

// Clear all pending classifications
export const clearPendingClassifications = (): void => {
  const cache = loadCache();
  cache.items = cache.items.filter(item => item.applied);
  saveCache(cache);
};

// Clear entire cache
export const clearCache = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// Cache multiple classifications (from batch)
export const cacheClassificationBatch = (
  results: Array<{
    emailId: string;
    subject: string;
    sender: string;
    classification: Classification;
  }>
): void => {
  const cache = loadCache();

  for (const result of results) {
    // Remove existing entry
    cache.items = cache.items.filter(item => item.emailId !== result.emailId);

    // Add new entry
    cache.items.push({
      emailId: result.emailId,
      subject: result.subject,
      sender: result.sender,
      classification: result.classification,
      timestamp: Date.now(),
      applied: false,
    });
  }

  saveCache(cache);
};

// Get cache statistics
export const getCacheStats = (): {
  total: number;
  pending: number;
  applied: number;
  oldestTimestamp: number | null;
} => {
  const cache = loadCache();
  const pending = cache.items.filter(item => !item.applied);
  const applied = cache.items.filter(item => item.applied);
  const timestamps = cache.items.map(item => item.timestamp);

  return {
    total: cache.items.length,
    pending: pending.length,
    applied: applied.length,
    oldestTimestamp: timestamps.length > 0 ? Math.min(...timestamps) : null,
  };
};
