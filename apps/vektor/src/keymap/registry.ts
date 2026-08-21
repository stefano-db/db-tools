export interface Shortcut {
  /** z. B. 'mod+shift+z', 'v', 'delete', 'arrowleft'. 'mod' = Cmd auf macOS, Ctrl sonst. */
  combo: string;
  label: string;
  handler: (evt: KeyboardEvent) => void;
  allowRepeat?: boolean;
}

interface HoldBinding {
  onDown: () => void;
  onUp: () => void;
  isDown: boolean;
}

const shortcuts = new Map<string, Shortcut>();
const holds = new Map<string, HoldBinding>();
let installed = false;
let detach: (() => void) | null = null;

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

function normalize(combo: string): string {
  return combo
    .toLowerCase()
    .split('+')
    .map((part) => (part === 'mod' ? (isMac ? 'meta' : 'ctrl') : part))
    .sort()
    .join('+');
}

function comboFromEvent(evt: KeyboardEvent): string {
  const parts: string[] = [];
  if (evt.metaKey) parts.push('meta');
  if (evt.ctrlKey) parts.push('ctrl');
  if (evt.altKey) parts.push('alt');
  if (evt.shiftKey) parts.push('shift');
  const key = evt.key.toLowerCase();
  if (!['meta', 'control', 'alt', 'shift'].includes(key)) parts.push(key === ' ' ? 'space' : key);
  return parts.sort().join('+');
}

function isEditableTarget(evt: KeyboardEvent): boolean {
  const target = evt.target;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function registerShortcut(shortcut: Shortcut): () => void {
  const key = normalize(shortcut.combo);
  shortcuts.set(key, shortcut);
  return () => {
    if (shortcuts.get(key) === shortcut) shortcuts.delete(key);
  };
}

/** Gedrückt-halten-Taste (Space-Pan): down/up-Paar, ohne Auto-Repeat. */
export function registerHold(key: string, onDown: () => void, onUp: () => void): () => void {
  const normalized = normalize(key);
  holds.set(normalized, { onDown, onUp, isDown: false });
  return () => holds.delete(normalized);
}

export function installKeymap(target: Window): () => void {
  if (installed && detach) detach();
  installed = true;

  const onKeyDown = (evt: KeyboardEvent): void => {
    if (isEditableTarget(evt)) return;

    const rawKey = evt.key.toLowerCase() === ' ' ? 'space' : evt.key.toLowerCase();
    const hold = holds.get(rawKey);
    if (hold && !evt.metaKey && !evt.ctrlKey && !evt.altKey) {
      evt.preventDefault();
      if (!evt.repeat && !hold.isDown) {
        hold.isDown = true;
        hold.onDown();
      }
      return;
    }

    const shortcut = shortcuts.get(comboFromEvent(evt));
    if (!shortcut) return;
    if (evt.repeat && !shortcut.allowRepeat) return;
    evt.preventDefault();
    shortcut.handler(evt);
  };

  const onKeyUp = (evt: KeyboardEvent): void => {
    const rawKey = evt.key.toLowerCase() === ' ' ? 'space' : evt.key.toLowerCase();
    const hold = holds.get(rawKey);
    if (hold && hold.isDown) {
      hold.isDown = false;
      hold.onUp();
    }
  };

  const onBlur = (): void => {
    for (const hold of holds.values()) {
      if (hold.isDown) {
        hold.isDown = false;
        hold.onUp();
      }
    }
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  detach = () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
    installed = false;
  };
  return detach;
}
