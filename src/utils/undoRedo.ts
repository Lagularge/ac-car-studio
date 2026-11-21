/**
 * Unified Undo/Redo & Mouse-Side-Button Navigation History utilities for AC Car Studio.
 * Works across the main Electron window AND detached OS pop-out BrowserWindows.
 */

export interface UndoRedoHandler {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoCount: number;
  redoCount: number;
  undoLabel?: string;
  redoLabel?: string;
}

export interface HistoryRecord<T> {
  value: T;
  label?: string;
  coalesceKey?: string;
  timestamp: number;
}

/**
 * Generic bounded Undo/Redo stack with time-window coalescing for smooth slider drags
 * and optional eviction callback (e.g. for GPU disposal of detached Three.js nodes).
 */
export class HistoryStack<T> {
  private past: Array<HistoryRecord<T>> = [];
  private future: Array<HistoryRecord<T>> = [];
  private readonly maxEntries: number;
  private readonly coalesceMs: number;
  private readonly onEvict?: (value: T) => void;

  constructor(options?: {
    maxEntries?: number;
    coalesceMs?: number;
    onEvict?: (value: T) => void;
  }) {
    this.maxEntries = options?.maxEntries ?? 50;
    this.coalesceMs = options?.coalesceMs ?? 450;
    this.onEvict = options?.onEvict;
  }

  /**
   * Pushes a new entry onto the undo stack.
   * If `coalesceKey` matches the top entry within `coalesceMs`, `mergeCoalesced` can update
   * the top entry in-place so continuous slider drags collapse into a single crisp undo step.
   */
  push(
    value: T,
    options?: {
      label?: string;
      coalesceKey?: string;
      now?: number;
      mergeCoalesced?: (existing: T, incoming: T) => T;
    }
  ): void {
    const now = options?.now ?? Date.now();

    // Clear redo branch on new forward edit
    if (this.future.length > 0) {
      if (this.onEvict) {
        for (const f of this.future) this.onEvict(f.value);
      }
      this.future = [];
    }

    const top = this.past[this.past.length - 1];
    if (
      options?.coalesceKey &&
      top &&
      top.coalesceKey === options.coalesceKey &&
      now - top.timestamp <= this.coalesceMs
    ) {
      if (options.mergeCoalesced) {
        top.value = options.mergeCoalesced(top.value, value);
      }
      if (options.label) top.label = options.label;
      top.timestamp = now;
      return;
    }

    this.past.push({
      value,
      label: options?.label,
      coalesceKey: options?.coalesceKey,
      timestamp: now,
    });

    while (this.past.length > this.maxEntries) {
      const removed = this.past.shift();
      if (removed && this.onEvict) {
        this.onEvict(removed.value);
      }
    }
  }

  /** Pops top entry from past -> moves to future and returns it. */
  undo(): HistoryRecord<T> | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return entry;
  }

  /** Pops top entry from future -> moves back to past and returns it. */
  redo(): HistoryRecord<T> | null {
    const entry = this.future.pop();
    if (!entry) return null;
    this.past.push(entry);
    return entry;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoCount(): number {
    return this.past.length;
  }

  get redoCount(): number {
    return this.future.length;
  }

  get undoLabel(): string | undefined {
    return this.past[this.past.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.future[this.future.length - 1]?.label;
  }

  clear(): void {
    if (this.onEvict) {
      for (const p of this.past) this.onEvict(p.value);
      for (const f of this.future) this.onEvict(f.value);
    }
    this.past = [];
    this.future = [];
  }
}

/**
 * Browser-style Back/Forward Navigation Stack for screen & tab transitions
 * (driven by mouse side buttons XButton1/XButton2, Electron app-command, Alt+Left/Right, or UI buttons).
 */
export class NavHistoryStack<T> {
  private entries: T[];
  private index: number;
  private readonly maxEntries: number;
  private readonly isEqual: (a: T, b: T) => boolean;

  constructor(
    initial: T,
    isEqual: (a: T, b: T) => boolean,
    maxEntries = 60
  ) {
    this.entries = [initial];
    this.index = 0;
    this.isEqual = isEqual;
    this.maxEntries = maxEntries;
  }

  get current(): T {
    return this.entries[this.index];
  }

  get canBack(): boolean {
    return this.index > 0;
  }

  get canForward(): boolean {
    return this.index < this.entries.length - 1;
  }

  push(next: T): boolean {
    if (this.isEqual(this.entries[this.index], next)) {
      return false;
    }
    if (this.index < this.entries.length - 1) {
      this.entries = this.entries.slice(0, this.index + 1);
    }
    this.entries.push(next);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    } else {
      this.index++;
    }
    return true;
  }

  replaceCurrent(next: T): void {
    this.entries[this.index] = next;
  }

  back(): T | null {
    if (!this.canBack) return null;
    this.index--;
    return this.entries[this.index];
  }

  forward(): T | null {
    if (!this.canForward) return null;
    this.index++;
    return this.entries[this.index];
  }
}

export const ACCS_UNDO_REDO_EVENT = 'accs:undo-redo';
export const ACCS_NAV_HISTORY_EVENT = 'accs:nav-history';

/**
 * Returns true ONLY when keyboard focus is inside a free-form text input where
 * native text-character undo/redo should take precedence over app-level undo/redo.
 * Note: Numeric sliders (`range`), number spinners (`number`), color pickers (`color`),
 * checkboxes, and selects return false so Ctrl+Z / Ctrl+Y immediately undo/redo edits!
 */
export function isUndoRedoEditableTextTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  if (typeof el.tagName !== 'string') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const inputType = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return (
      inputType === 'text' ||
      inputType === 'search' ||
      inputType === 'url' ||
      inputType === 'email' ||
      inputType === 'password' ||
      inputType === 'tel'
    );
  }
  return false;
}

/**
 * Attaches global Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Alt+Left / Alt+Right, and
 * Mouse Side Button (button 3 = Back, button 4 = Forward) listeners to any Window
 * (main Electron window or detached pop-out OS window).
 */
export function attachWindowShortcutListeners(
  win: Window,
  callbacks: {
    onUndo: () => void;
    onRedo: () => void;
    onNav: (direction: 'back' | 'forward') => void;
  }
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    // Alt + Left / Right -> Screen Back / Forward
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key === 'ArrowLeft') {
        if (!isUndoRedoEditableTextTarget(e.target)) {
          e.preventDefault();
          callbacks.onNav('back');
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (!isUndoRedoEditableTextTarget(e.target)) {
          e.preventDefault();
          callbacks.onNav('forward');
        }
        return;
      }
    }

    // Ctrl+Z / Cmd+Z (Undo) and Ctrl+Y / Cmd+Y / Ctrl+Shift+Z (Redo)
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        if (isUndoRedoEditableTextTarget(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        if (k === 'y' || (k === 'z' && e.shiftKey)) {
          callbacks.onRedo();
        } else {
          callbacks.onUndo();
        }
      }
    }
  };

  // Prevent Chromium from navigating file:// history when pressing mouse side buttons (3=Back, 4=Forward)
  const onMouseDown = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  };

  const onAuxClick = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) {
      e.preventDefault();
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 3) {
      e.preventDefault();
      callbacks.onNav('back');
    } else if (e.button === 4) {
      e.preventDefault();
      callbacks.onNav('forward');
    }
  };

  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('mousedown', onMouseDown, true);
  win.addEventListener('mouseup', onMouseUp, true);
  win.addEventListener('auxclick', onAuxClick, true);

  return () => {
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('mousedown', onMouseDown, true);
    win.removeEventListener('mouseup', onMouseUp, true);
    win.removeEventListener('auxclick', onAuxClick, true);
  };
}
