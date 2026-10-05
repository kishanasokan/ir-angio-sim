import type { KeyState } from '../mapping/mapKeyboard';

/**
 * The keyboard source: tracks which keys (KeyboardEvent.code) are down. Keys the mapping uses do not scroll the page
 * or move focus while the simulation has it. Losing focus releases every key, so none sticks.
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
  state(): KeyState;
  dispose(): void;
}

export function createKeyboardSource(target: Window): KeyboardSource {
  const down = new Set<string>();
  const onDown = (event: KeyboardEvent) => {
    down.add(event.code);
    if (CAPTURED.has(event.code)) {
      event.preventDefault();
    }
  };
  const onUp = (event: KeyboardEvent) => {
    down.delete(event.code);
  };
  const onBlur = () => down.clear();
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  return {
    state: () => ({ down: new Set(down) }),
    dispose: () => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
