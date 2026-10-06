import { useSession, type ToastKind } from '../state/session';

/**
 * Toasts (prompts/M1-foundations.md §7): features that arrive later, blocked actions with their rule's message and
 * source (CLAUDE.md rule 7), and demo milestones. They expire after tuning/render → hud.toastDuration.
 */

const TONE: Readonly<Record<ToastKind, string>> = {
  info: 'border-white/12 text-ink-100',
  success: 'border-accent-400/40 text-ink-100',
  warning: 'border-caution-400/50 text-caution-400',
  blocked: 'border-danger-400/50 text-danger-400',
};

export function Toasts() {
  const toasts = useSession((state) => state.toasts);
  const dismiss = useSession((state) => state.dismissToast);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none flex flex-col items-center gap-2"
      data-testid="toasts"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'blocked' ? 'alert' : 'status'}
          data-testid={`toast-${toast.kind}`}
          className={`pointer-events-auto max-w-md rounded-xl border bg-suite-900/95 px-4 py-2.5 text-sm shadow-xl shadow-black/40 backdrop-blur ${TONE[toast.kind]}`}
          onClick={() => dismiss(toast.id)}
        >
          <p>{toast.text}</p>
          {toast.source !== undefined && (
            <p className="mt-0.5 text-xs text-ink-300">
              Source:{' '}
              {toast.source.url === null ? (
                toast.source.title
              ) : (
                <a
                  href={toast.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-white/30"
                >
                  {toast.source.title}
                </a>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
