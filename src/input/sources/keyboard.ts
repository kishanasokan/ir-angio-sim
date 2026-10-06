import type { KeyState } from '../mapping/mapKeyboard';

/**
 * The keyboard source: tracks which keys (KeyboardEvent.code) are down. Keys the mapping uses do not scroll the page
 * or move focus while the simulation has it. Losing focus releases every key, so none sticks. A key pressed and
 * released between two polls still counts as down for one poll, so a quick tap is never lost.
 */

const CAPTURED = new Set([
  'Space',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'PageUp',
  'PageDown',
  'Backspace',
]);

export interface KeyboardSource {
  /** The keys down now, plus any tapped since the last call. */
  state(): KeyState;
  /** The keys held now, without taking the taps (for display). */
  peek(): KeyState;
  dispose(): void;
}

export function createKeyboardSource(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
): KeyboardSource {
  const down = new Set<string>();
  const tapped = new Set<string>();
  const onDown = (event: KeyboardEvent) => {
    down.add(event.code);
    tapped.add(event.code);
    if (CAPTURED.has(event.code)) {
      event.preventDefault();
    }
  };
  const onUp = (event: KeyboardEvent) => {
    down.delete(event.code);
  };
  const onBlur = () => {
    down.clear();
    tapped.clear();
  };
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return {
    state: () => {
      const state = { down: new Set([...down, ...tapped]) };
      tapped.clear();
      return state;
    },
    peek: () => ({ down: new Set(down) }),
    dispose: () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
