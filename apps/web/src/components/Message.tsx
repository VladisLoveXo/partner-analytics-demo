import type { ReactNode } from "react";

interface Props {
  title: string;
  text?: string;
  action?: ReactNode;
}

export function Message({ title, text, action }: Props) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-card p-6 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {text && <p className="mt-2 text-sm text-ink-2">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageTitle({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}

export const buttonClass = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
