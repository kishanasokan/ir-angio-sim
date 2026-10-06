import type { GlyphSet } from '../input/sources/gamepad';

/**
 * The controls reference (prompts/M1-foundations.md §5, spec 00 §9): both mode maps with the detected controller's
 * glyphs, and the keyboard and mouse equivalents. This is documentation text for the start screen and the pause menu;
 * the mapping itself lives in src/input/mapping.
 */

export type PadControl =
  | 'leftStick'
  | 'l3'
  | 'rightStick'
  | 'r3'
  | 'lt'
  | 'rt'
  | 'lb'
  | 'rb'
  | 'dpadUpDown'
  | 'dpadLeftRight'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'view'
  | 'menu';

const XBOX: Readonly<Record<PadControl, string>> = {
  leftStick: 'Left stick',
  l3: 'L3',
  rightStick: 'Right stick',
  r3: 'R3',
  lt: 'LT',
  rt: 'RT',
  lb: 'LB',
  rb: 'RB',
  dpadUpDown: 'D-pad ↑↓',
  dpadLeftRight: 'D-pad ←→',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  view: 'View',
  menu: 'Menu',
};

const PLAYSTATION: Readonly<Record<PadControl, string>> = {
  ...XBOX,
  lt: 'L2',
  rt: 'R2',
  lb: 'L1',
  rb: 'R1',
  a: '✕',
  b: '○',
  x: '□',
  y: '△',
  view: 'Create',
  menu: 'Options',
};

export function glyph(set: GlyphSet, control: PadControl): string {
  return (set === 'playstation' ? PLAYSTATION : XBOX)[control];
}

export function glyphSetName(set: GlyphSet): string {
  switch (set) {
    case 'xbox':
      return 'Xbox-style controller';
    case 'playstation':
      return 'PlayStation controller';
    case 'generic':
      return 'Controller (standard layout)';
  }
}

export interface PadRow {
  readonly control: PadControl;
  readonly cath: string;
  readonly controlMode: string;
}

export const PAD_ROWS: readonly PadRow[] = [
  {
    control: 'leftStick',
    cath: 'Outer device: ↑↓ push and pull, ←→ rotate',
    controlMode: '↑↓ cranial and caudal, ←→ detector height',
  },
  { control: 'l3', cath: 'Fine mode on or off', controlMode: '—' },
  { control: 'rightStick', cath: 'Inner device: ↑↓ push and pull, ←→ rotate', controlMode: 'Table pan' },
  { control: 'r3', cath: 'Lock or unlock the pair', controlMode: '—' },
  { control: 'lt', cath: 'Fluoro (hold)', controlMode: 'Rotate toward RAO' },
  { control: 'rt', cath: 'Contrast puff (hold)', controlMode: 'Rotate toward LAO' },
  { control: 'lb', cath: 'DSA (arrives in M2)', controlMode: 'Fluoro while moving (hold)' },
  { control: 'rb', cath: 'Device picker', controlMode: 'Cycle the field of view' },
  { control: 'dpadUpDown', cath: 'Active pair (needs three devices)', controlMode: 'Table height' },
  {
    control: 'dpadLeftRight',
    cath: 'Field of view wider or narrower',
    controlMode: 'Collimation narrower or wider',
  },
  { control: 'a', cath: 'Act', controlMode: 'Save the current angle' },
  { control: 'b', cath: 'Back or close', controlMode: 'Back or close' },
  { control: 'x', cath: 'Roadmap outline on or off', controlMode: 'Drugs and sedation (arrive in M3)' },
  { control: 'y', cath: 'Switch to Control mode', controlMode: 'Switch to Cath mode' },
  { control: 'view', cath: '3D view on or off', controlMode: '3D view on or off' },
  { control: 'menu', cath: 'Pause', controlMode: 'Pause' },
];

export interface KeyRow {
  readonly keys: string;
  readonly action: string;
}

export const KEYS_BOTH: readonly KeyRow[] = [
  { keys: 'C', action: 'Switch Cath and Control mode' },
  { keys: 'G', action: '3D view' },
  { keys: 'Esc', action: 'Pause' },
  { keys: 'I', action: 'Device inspector' },
  { keys: 'P', action: 'Perf overlay' },
  { keys: 'Z / X', action: 'Field of view wider / narrower' },
  { keys: 'Space', action: 'Fluoro (hold)' },
];

export const KEYS_CATH: readonly KeyRow[] = [
  { keys: 'W / S', action: 'Inner device push / pull' },
  { keys: 'A / D', action: 'Inner device rotate' },
  { keys: 'Arrow keys', action: 'Outer device push, pull and rotate' },
  { keys: 'Shift (hold)', action: 'Fine mode' },
  { keys: 'L', action: 'Lock the pair' },
  { keys: 'Tab', action: 'Active pair (needs three devices)' },
  { keys: 'E (hold)', action: 'Contrast puff' },
  { keys: 'R', action: 'Roadmap outline' },
  { keys: 'F', action: 'DSA (arrives in M2)' },
  { keys: 'B', action: 'Device picker' },
  { keys: 'Enter', action: 'Act' },
  { keys: 'Backspace', action: 'Back' },
  { keys: 'Left drag', action: 'Inner device: ↕ push, ↔ rotate' },
  { keys: 'Right drag', action: 'Outer device' },
  { keys: 'Wheel', action: 'Fine advance of the inner device' },
  { keys: 'Middle click', action: 'Lock the pair' },
];

export const KEYS_CONTROL: readonly KeyRow[] = [
  { keys: 'Q / E', action: 'Rotate RAO / LAO' },
  { keys: 'W / S', action: 'Cranial / caudal' },
  { keys: 'Arrow keys', action: 'Table pan' },
  { keys: 'Page Up / Down', action: 'Table height' },
  { keys: '[ / ]', action: 'Collimation' },
  { keys: '- / =', action: 'Detector height' },
  { keys: 'Enter', action: 'Save the angle' },
  { keys: 'D', action: 'Drugs and sedation (arrive in M3)' },
  { keys: 'Left drag', action: 'Rotate and angulate the C-arm' },
  { keys: 'Right drag', action: 'Pan the table' },
  { keys: 'Wheel', action: 'Field of view' },
  { keys: 'Alt + mouse', action: 'Orbit, zoom and pan the 3D view' },
];
