import type { PartnerStatus } from "../queries";

/** Status is never color alone: an icon and a word carry it too. */
export function StatusBadge({ status }: { status: PartnerStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-good-text">
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-good" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Активен
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-ink-2">
      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
        <path d="M6 4v8M10 4v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Отключён
    </span>
  );
}
