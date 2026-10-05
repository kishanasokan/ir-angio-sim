import type { RawPad } from '../../sim/core/records';

/**
 * The gamepad source (prompts/M1-foundations.md §5): polls the Gamepad API once per animation frame and returns the
 * first connected pad in the standard mapping as a RawPad, with the glyph set its id suggests.
 */

export type GlyphSet = 'xbox' | 'playstation' | 'generic';

/** Glyphs from a gamepad id. 8BitDo pads in XInput mode report as Xbox. */
export function glyphSetFor(id: string): GlyphSet {
  const name = id.toLowerCase();
  if (/xbox|xinput|045e|microsoft/.test(name)) {
    return 'xbox';
  }
  if (/playstation|dualshock|dualsense|sony|054c|wireless controller/.test(name)) {
    return 'playstation';
  }
  return 'generic';
}

export interface PadReading {
  /** The pad's state, or null when no pad is connected (Firefox exposes pads only after a button press). */
  readonly pad: RawPad | null;
  readonly gamepad: Gamepad | null;
  readonly glyphs: GlyphSet;
  /** False for a pad without the standard mapping: the UI shows a notice and suggests the keyboard. */
  readonly standard: boolean;
}

export function readGamepad(source: Pick<Navigator, 'getGamepads'> | undefined): PadReading {
  const pads = source?.getGamepads?.() ?? [];
  const gamepad = pads.find((pad): pad is Gamepad => pad !== null && pad.connected) ?? null;
  if (gamepad === null) {
    return { pad: null, gamepad: null, glyphs: 'generic', standard: true };
  }
  return {
    pad: { axes: [...gamepad.axes], buttons: gamepad.buttons.map((button) => button.value) },
    gamepad,
    glyphs: glyphSetFor(gamepad.id),
    standard: gamepad.mapping === 'standard',
  };
}
