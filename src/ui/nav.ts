import { BUTTON_DOWN } from '../input/mapping/frame';
import { PAD_BUTTONS, type RawPad } from '../sim/core/records';

/**
 * Controller navigation of menus and panels (controller-first, spec 00 §9): the D-pad moves focus between the open
 * panel's controls, A activates the focused one and B goes back. This only moves DOM focus; it never touches the
 * simulation, whose input always goes through the mappers.
 */

export type NavAction = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

const NAV_BUTTONS: readonly (readonly [number, NavAction])[] = [
  [PAD_BUTTONS.up, 'up'],
  [PAD_BUTTONS.down, 'down'],
  [PAD_BUTTONS.left, 'left'],
  [PAD_BUTTONS.right, 'right'],
  [PAD_BUTTONS.a, 'select'],
  [PAD_BUTTONS.b, 'back'],
];

/** Navigation actions from the buttons pressed since the previous reading (press edges only). */
export function padNav(raw: RawPad | null, previous: RawPad | null): NavAction[] {
  if (raw === null) {
    return [];
  }
  const down = (pad: RawPad | null, index: number) => (pad?.buttons[index] ?? 0) >= BUTTON_DOWN;
  return NAV_BUTTONS.filter(([index]) => down(raw, index) && !down(previous, index)).map(
    ([, action]) => action,
  );
}

/** True when any button went down since the previous reading. */
export function anyPress(raw: RawPad | null, previous: RawPad | null): boolean {
  if (raw === null) {
    return false;
  }
  return raw.buttons.some((value, i) => value >= BUTTON_DOWN && (previous?.buttons[i] ?? 0) < BUTTON_DOWN);
}

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])';

export function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.offsetParent !== null,
  );
}

/** Moves focus to the next or previous control inside `root`, wrapping around. */
export function moveFocus(root: ParentNode, delta: number): void {
  const items = focusables(root);
  if (items.length === 0) {
    return;
  }
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    current < 0 ? (delta > 0 ? 0 : items.length - 1) : (current + delta + items.length) % items.length;
  items[next]?.focus();
}

/** Applies a navigation action inside `root`; returns true for back, which the caller handles. */
export function applyNav(root: ParentNode, action: NavAction): boolean {
  switch (action) {
    case 'up':
    case 'left':
      moveFocus(root, -1);
      return false;
    case 'down':
    case 'right':
      moveFocus(root, 1);
      return false;
    case 'select': {
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.contains(active)) {
        active.click();
      } else {
        moveFocus(root, 1);
      }
      return false;
    }
    case 'back':
      return true;
  }
}
