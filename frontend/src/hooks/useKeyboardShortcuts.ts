// Keyboard shortcuts
//
// Attaches a document-level keydown handler and dispatches to a table of
// bindings the caller supplies. Ignores keys while the user is typing in
// inputs/textareas so we don't hijack normal editing.
//
// Bindings are plain objects so the help overlay can render the same list
// the handler evaluates — no drift between docs and reality.

import { useEffect } from 'react';

export interface Shortcut {
  /** Key(s). Single char like "j" or a list like ["j", "ArrowDown"]. */
  keys: string | string[];
  /** Short description shown in the help overlay. */
  description: string;
  /** Grouping header in the help overlay. */
  group?: string;
  /** Whether Shift must be pressed. */
  shift?: boolean;
  /** Allow firing even while a form field is focused (rare — e.g. Escape). */
  allowInInput?: boolean;
  /** What to run. */
  action: () => void;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      // Never hijack the standard OS / browser shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const inInput = isTypingTarget(e.target);

      for (const s of shortcuts) {
        const keys = Array.isArray(s.keys) ? s.keys : [s.keys];
        const matchesKey = keys.some(k => k === e.key || k.toLowerCase() === e.key.toLowerCase());
        if (!matchesKey) continue;
        if (s.shift && !e.shiftKey) continue;
        if (!s.shift && e.shiftKey) continue;
        if (inInput && !s.allowInInput) continue;
        e.preventDefault();
        s.action();
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [shortcuts, enabled]);
}
