import { useMemo, useState } from 'react';
import { appData, CASE_ID } from '../app/appData';
import { buildRodInstance } from '../data/catalog';
import { inspectorTabs, type InspectorRow, type InspectorValue } from '../data/inspector';
import { tierParams } from '../data/simConfig';
import type { HudView } from '../state/hud';
import { useSession } from '../state/session';
import { formatNumber, formatQuantity, formatUnit } from './format';
import { Button, ConfidenceBadge, Panel } from './primitives';

/**
 * The device inspector (I; prompts/M1-foundations.md §7): every resolved value the simulation uses for each device in
 * the stack, the sheath, the phantom and the solver, in clinical and SI units, with its confidence badge, its source
 * (linked) and its note. Placeholders stand out so the medical reviewer can find and close them (golden rule 2).
 */

function formatValue(value: InspectorValue): string {
  switch (value.kind) {
    case 'number':
      return formatQuantity(value.value, value.unit);
    case 'range':
      return `${formatNumber(value.min)}–${formatQuantity(value.max, value.unit)}`;
    case 'options': {
      const unit = formatUnit(value.unit);
      const list = `${value.options.join(', ')}${unit === '' ? '' : ` ${unit}`}`;
      return value.selected === null
        ? list
        : `${value.selected}${unit === '' ? '' : ` ${unit}`} (of ${list})`;
    }
    case 'text':
      return value.text;
  }
}

function Row({ row }: { readonly row: InspectorRow }) {
  const placeholder = row.confidence === 'placeholder';
  return (
    <tr
      data-testid="inspector-row"
      data-confidence={row.confidence}
      className={placeholder ? 'bg-caution-400/[0.07] shadow-[inset_3px_0_0_0] shadow-caution-400' : ''}
    >
      <td className="px-3 py-2 align-top text-ink-100">{row.label}</td>
      <td className="px-3 py-2 align-top font-mono whitespace-nowrap text-ink-100">
        {formatValue(row.clinical)}
      </td>
      <td className="px-3 py-2 align-top font-mono whitespace-nowrap text-ink-500">
        {row.si === null ? '' : formatValue(row.si)}
      </td>
      <td className="px-3 py-2 align-top">
        <ConfidenceBadge confidence={row.confidence} />
      </td>
      <td className="px-3 py-2 align-top text-ink-300">
        {row.sources.map((source) =>
          source.url === null ? (
            <span key={source.id} className="block">
              {source.title}
            </span>
          ) : (
            <a
              key={source.id}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="block underline decoration-white/25 hover:text-ink-100"
            >
              {source.title}
            </a>
          ),
        )}
      </td>
      <td className="max-w-xs px-3 py-2 align-top text-ink-500">{row.note}</td>
    </tr>
  );
}

export function DeviceInspector({
  hud,
  sheathFrench,
}: {
  readonly hud: HudView;
  readonly sheathFrench: number;
}) {
  const data = appData();
  const close = useSession((state) => state.closePanel);
  const tier = hud.tier ?? data.limits.tiers[0] ?? 'high';
  const ids = hud.devices.map((device) => device.rodModelId).join(',');
  const tabs = useMemo(() => {
    const segment = tierParams(data.repository, tier).segmentLength;
    return inspectorTabs(data.repository, {
      caseId: CASE_ID,
      devices: ids === '' ? [] : ids.split(',').map((id) => buildRodInstance(data.repository, id, segment)),
      sheathFrench,
      anatomyId: hud.anatomyId,
      tierId: tier,
    });
  }, [data, tier, ids, sheathFrench, hud.anatomyId]);
  const [selected, setSelected] = useState(0);
  const tab = tabs[Math.min(selected, tabs.length - 1)];
  const placeholders = tab?.rows.filter((row) => row.confidence === 'placeholder').length ?? 0;

  return (
    <Panel
      title="Device inspector"
      subtitle="Every value the simulation uses, as written in /data and in SI, with its confidence and source."
      testId="device-inspector"
      onClose={close}
      className="flex max-h-[88vh] w-[min(72rem,96vw)] flex-col"
    >
      <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-4 py-3">
        {tabs.map((entry, i) => (
          <Button
            key={entry.id}
            data-testid={`inspector-tab-${entry.id}`}
            variant={entry === tab ? 'primary' : 'secondary'}
            onClick={() => setSelected(i)}
            className="py-1.5 text-xs"
          >
            {entry.title}
          </Button>
        ))}
      </div>
      {tab !== undefined && (
        <div className="min-h-0 overflow-auto">
          <p className="px-4 pt-3 text-xs text-ink-500">
            {tab.subtitle}
            {placeholders > 0 && (
              <span className="ml-2 text-caution-400">
                {placeholders} placeholder{placeholders === 1 ? '' : 's'} awaiting a source
              </span>
            )}
          </p>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="sticky top-0 bg-suite-900 text-[10px] tracking-[0.15em] text-ink-500 uppercase">
              <tr>
                <th className="px-3 py-2 font-semibold">Value</th>
                <th className="px-3 py-2 font-semibold">As written</th>
                <th className="px-3 py-2 font-semibold">SI</th>
                <th className="px-3 py-2 font-semibold">Confidence</th>
                <th className="px-3 py-2 font-semibold">Source</th>
                <th className="px-3 py-2 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {tab.rows.map((row, i) => (
                <Row key={`${row.label}-${i}`} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
