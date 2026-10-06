import type { PointerState } from '../mapping/mapPointer';

/**
 * The mouse source: accumulates drags (left and right button), wheel notches and middle clicks on the view between
 * animation frames; take() returns them and starts again (prompts/M1-foundations.md §5). Alt with the mouse belongs
 * to the 3D view's orbit camera, so the source ignores it.
 */

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;
/** WheelEvent pixels per notch in line-free browsers. */
const PIXELS_PER_NOTCH = 100;

export interface PointerSource {
  take(): PointerState;
  dispose(): void;
}

export function createPointerSource(element: HTMLElement): PointerSource {
  let state = { leftDx: 0, leftDy: 0, rightDx: 0, rightDy: 0, wheel: 0, middleClicks: 0 };
  const buttons = new Set<number>();
  const onDown = (event: PointerEvent) => {
    if (event.altKey) {
      return;
    }
    buttons.add(event.button);
    if (event.button === MIDDLE) {
      state.middleClicks += 1;
      event.preventDefault();
    }
    element.setPointerCapture(event.pointerId);
  };
  const onUp = (event: PointerEvent) => {
    buttons.delete(event.button);
  };
  const onMove = (event: PointerEvent) => {
    if (buttons.has(LEFT)) {
      state.leftDx += event.movementX;
      state.leftDy += event.movementY;
    }
    if (buttons.has(RIGHT)) {
      state.rightDx += event.movementX;
      state.rightDy += event.movementY;
    }
  };
  const onWheel = (event: WheelEvent) => {
    if (event.altKey) {
      return;
    }
    // Up (negative deltaY) is positive: away from the user.
    const notches =
      event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
        ? -event.deltaY / PIXELS_PER_NOTCH
        : -Math.sign(event.deltaY);
    state.wheel += notches;
    event.preventDefault();
  };
  const onContextMenu = (event: Event) => event.preventDefault();
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onUp);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', onContextMenu);
  return {
    take: () => {
      const taken = state;
      state = { leftDx: 0, leftDy: 0, rightDx: 0, rightDy: 0, wheel: 0, middleClicks: 0 };
      return taken;
    },
    dispose: () => {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onUp);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('contextmenu', onContextMenu);
    },
  };
}

export { LEFT as POINTER_LEFT, RIGHT as POINTER_RIGHT };
