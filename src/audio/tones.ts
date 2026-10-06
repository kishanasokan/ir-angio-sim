import type { ToneConfig } from '../data/renderConfig';

/**
 * Sound in M1 (docs/M1-plan.md D22): a short alarm tone with the hub-force-danger rumble, because rumble is always
 * backed by sight and sound (spec 00 §9), and a softer tone when an action is blocked. Each tone is a sine that starts
 * at its gain and fades to silence over its duration. Browsers let a page make sound only after a user gesture, so
 * the AudioContext is created on the first key press or click; until then, and while muted, tones are skipped.
 */

export interface TonePlayer {
  play(tone: ToneConfig): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

export function createTonePlayer(target: Window): TonePlayer {
  let context: AudioContext | null = null;
  let muted = false;
  const unlock = () => {
    if (context === null && typeof AudioContext === 'function') {
      context = new AudioContext();
    }
    void context?.resume().catch(() => undefined);
  };
  target.addEventListener('keydown', unlock);
  target.addEventListener('pointerdown', unlock);
  return {
    play(tone: ToneConfig): void {
      if (muted || context === null || context.state !== 'running') {
        return;
      }
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      gain.gain.setValueAtTime(tone.gain, start);
      gain.gain.linearRampToValueAtTime(0, start + tone.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + tone.duration);
    },
    setMuted(value: boolean): void {
      muted = value;
    },
    dispose(): void {
      target.removeEventListener('keydown', unlock);
      target.removeEventListener('pointerdown', unlock);
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}
