// Shortcut Help Overlay
//
// Centered modal triggered by "?" — lists all available keyboard
// shortcuts grouped by section. Renders the same Shortcut[] array the
// useKeyboardShortcuts hook evaluates so the two stay in sync.

import { X, Keyboard } from 'lucide-react';
import type { Shortcut } from '../hooks/useKeyboardShortcuts';

interface Props {
  isOpen: boolean;
  shortcuts: Shortcut[];
  onClose: () => void;
}

function keyLabel(keys: Shortcut['keys'], shift?: boolean): string {
  const arr = Array.isArray(keys) ? keys : [keys];
  const pretty = arr.map(k => {
    if (k === 'ArrowDown') return '↓';
    if (k === 'ArrowUp') return '↑';
    if (k === 'Escape') return 'Esc';
    if (k === '?') return '?';
    return k.toUpperCase();
  });
  return shift ? `Shift + ${pretty.join(' / ')}` : pretty.join(' / ');
}

export const ShortcutHelpOverlay = ({ isOpen, shortcuts, onClose }: Props) => {
  if (!isOpen) return null;

  const byGroup: Record<string, Shortcut[]> = {};
  for (const s of shortcuts) {
    const g = s.group || 'Allgemein';
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g].push(s);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-primary/5 to-primary/10">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-text">Tastatur-Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/40 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {Object.entries(byGroup).map(([group, items]) => (
            <div key={group}>
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {items.map((s, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-text">{s.description}</span>
                    <kbd className="font-mono text-xs px-2 py-1 rounded bg-gray-100 border border-gray-300 text-text-secondary min-w-[3rem] text-center">
                      {keyLabel(s.keys, s.shift)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-6 py-3 border-t border-border bg-gray-50 text-xs text-text-secondary text-center">
          Drücke <kbd className="font-mono px-1 py-0.5 rounded bg-white border border-gray-300">Esc</kbd> oder klicke daneben, um zu schließen.
        </div>
      </div>
    </div>
  );
};
