import { useEffect, useState, type RefObject } from 'react';
import { readGamepad, type GlyphSet } from '../input/sources/gamepad';
import type { RawPad } from '../sim/core/records';
import type { PadStatus } from '../state/hud';
import { anyPress, applyNav, padNav } from './nav';

/**
 * Controller navigation for screens outside the sandbox (start and setup): polls the pad each animation frame, moves
 * focus with the D-pad, activates with A and calls `onBack` for B. It also reports the pad's glyph set and whether a
 * button has been pressed yet, because Firefox exposes a pad only after a press (prompts/M1-foundations.md §5).
 */

let pressedOnce = false;

export interface MenuPad {
  readonly status: PadStatus;
  readonly glyphs: GlyphSet;
}

export function useMenuPad(root: RefObject<HTMLElement | null>, onBack?: () => void): MenuPad {
  const [pad, setPad] = useState<MenuPad>({ status: 'none', glyphs: 'generic' });
  useEffect(() => {
    let previous: RawPad | null = null;
    let frame = 0;
    let last: MenuPad = { status: 'none', glyphs: 'generic' };
    const poll = () => {
      frame = requestAnimationFrame(poll);
      const reading = readGamepad(navigator);
      if (anyPress(reading.pad, previous)) {
        pressedOnce = true;
      }
      const element = root.current;
      if (element !== null) {
        for (const action of padNav(reading.pad, previous)) {
          if (applyNav(element, action)) {
            onBack?.();
          }
        }
      }
      previous = reading.pad;
      const status: PadStatus =
        reading.gamepad === null
          ? 'none'
          : !reading.standard
            ? 'non-standard'
            : pressedOnce
              ? 'ready'
              : 'waiting';
      if (status !== last.status || reading.glyphs !== last.glyphs) {
        last = { status, glyphs: reading.glyphs };
        setPad(last);
      }
    };
    frame = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(frame);
  }, [root, onBack]);
  return pad;
}
