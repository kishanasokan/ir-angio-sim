import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Confidence } from '../data/facts';

/**
 * Shared UI chrome: buttons, panels and confidence badges. Chrome colors live in the Tailwind theme
 * (docs/M1-plan.md D5); every control shows a clear focus ring, because the controller moves focus.
 */

const FOCUS =
  'outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-suite-950';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonProps) {
  const look =
    variant === 'primary'
      ? 'bg-accent-400 text-suite-950 font-semibold hover:brightness-110 disabled:bg-suite-700 disabled:text-ink-500'
      : variant === 'ghost'
        ? 'text-ink-300 hover:text-ink-100 hover:bg-white/5'
        : 'border border-white/12 bg-white/[0.04] text-ink-100 hover:bg-white/[0.08] disabled:text-ink-500';
  return (
    <button
      type="button"
      className={`rounded-xl px-4 py-2.5 text-sm transition disabled:cursor-not-allowed ${look} ${FOCUS} ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className = '',
  testId,
  onClose,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly testId?: string;
  readonly onClose?: () => void;
}) {
  return (
    <section
      data-panel
      data-testid={testId}
      aria-label={title}
      className={`pointer-events-auto rounded-2xl border border-white/10 bg-suite-900/90 shadow-2xl shadow-black/50 backdrop-blur-md ${className}`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink-100">{title}</h2>
          {subtitle !== undefined && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
        {onClose !== undefined && (
          <Button
            variant="ghost"
            className="-mt-1 -mr-2 px-2 py-1 text-xs"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </Button>
        )}
      </header>
      {children}
    </section>
  );
}

const CONFIDENCE_LOOK: Readonly<Record<Confidence, string>> = {
  sourced: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
  derived: 'bg-sky-400/15 text-sky-300 ring-sky-400/30',
  estimated: 'bg-violet-400/15 text-violet-300 ring-violet-400/30',
  placeholder: 'bg-caution-400/20 text-caution-400 ring-caution-400/50',
  design: 'bg-white/[0.06] text-ink-300 ring-white/15',
};

export function ConfidenceBadge({ confidence }: { readonly confidence: Confidence }) {
  return (
    <span
      data-confidence={confidence}
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ${CONFIDENCE_LOOK[confidence]}`}
    >
      {confidence}
    </span>
  );
}

export function Kbd({ children }: { readonly children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-ink-100">
      {children}
    </kbd>
  );
}

export function Eyebrow({ children }: { readonly children: ReactNode }) {
  return <p className="text-[11px] font-semibold tracking-[0.25em] text-accent-400 uppercase">{children}</p>;
}
