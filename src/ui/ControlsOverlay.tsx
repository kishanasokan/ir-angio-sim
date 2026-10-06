import { useState } from 'react';
import type { GlyphSet } from '../input/sources/gamepad';
import type { PadStatus } from '../state/hud';
import { glyph, glyphSetName, KEYS_BOTH, KEYS_CATH, KEYS_CONTROL, PAD_ROWS, type KeyRow } from './controls';
import { Button, Kbd } from './primitives';

/**
 * The controls reference (prompts/M1-foundations.md §7): both mode maps with the detected controller's glyphs, and
 * keyboard and mouse parity. Y (or C) switches between Cath mode and Control mode.
 */

export function PadPrompt({ status, glyphs }: { readonly status: PadStatus; readonly glyphs: GlyphSet }) {
  if (status === 'ready') {
    return (
      <p data-testid="pad-status" className="text-xs text-accent-400">
        {glyphSetName(glyphs)} connected
      </p>
    );
  }
  if (status === 'non-standard') {
    return (
      <p data-testid="pad-status" className="text-xs text-caution-400">
        This controller does not report the standard layout, so its buttons may be mixed up. The keyboard and
        mouse work fully.
      </p>
    );
  }
  return (
    <p data-testid="pad-status" className="text-xs text-ink-500">
      Press any button on your controller
    </p>
  );
}

function KeyTable({ title, rows }: { readonly title: string; readonly rows: readonly KeyRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold tracking-[0.2em] text-ink-500 uppercase">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <div key={`${title}-${row.keys}`} className="contents">
            <dt>
              <Kbd>{row.keys}</Kbd>
            </dt>
            <dd className="text-ink-300">{row.action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ControlsReference({ glyphs }: { readonly glyphs: GlyphSet }) {
  const [tab, setTab] = useState<'pad' | 'keys'>('pad');
  return (
    <div className="space-y-4" data-testid="controls-reference">
      <div className="flex gap-2">
        <Button variant={tab === 'pad' ? 'primary' : 'secondary'} onClick={() => setTab('pad')}>
          Controller
        </Button>
        <Button variant={tab === 'keys' ? 'primary' : 'secondary'} onClick={() => setTab('keys')}>
          Keyboard and mouse
        </Button>
      </div>
      {tab === 'pad' ? (
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[0.03] text-[11px] tracking-[0.15em] text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">{glyphSetName(glyphs)}</th>
                <th className="px-3 py-2 font-semibold">Cath mode</th>
                <th className="px-3 py-2 font-semibold">Control mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {PAD_ROWS.map((row) => (
                <tr key={row.control}>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <Kbd>{glyph(glyphs, row.control)}</Kbd>
                  </td>
                  <td className="px-3 py-1.5 text-ink-300">{row.cath}</td>
                  <td className="px-3 py-1.5 text-ink-300">{row.controlMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-3">
          <KeyTable title="Both modes" rows={KEYS_BOTH} />
          <KeyTable title="Cath mode" rows={KEYS_CATH} />
          <KeyTable title="Control mode" rows={KEYS_CONTROL} />
        </div>
      )}
    </div>
  );
}
