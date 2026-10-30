import { Link } from "@tanstack/react-router";
import { useAuth } from "react-oidc-context";
import type { Me } from "../queries";

const navLink = "rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid";
const navLinkActive = "rounded-md px-3 py-1.5 bg-grid text-ink font-medium";

export function AppHeader({ me }: { me: Me }) {
  const auth = useAuth();
  const isAdmin = me.roles.includes("admin");
  const hasCabinet = me.roles.includes("partner") && me.partnerId !== null;

  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="font-semibold">
          Партнёрская аналитика
        </Link>
        <nav className="flex gap-1 text-sm">
          {hasCabinet && (
            <Link to="/cabinet" className={navLink} activeProps={{ className: navLinkActive }}>
              Кабинет
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className={navLink} activeProps={{ className: navLinkActive }}>
              Админка
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-ink-2">{me.username ?? me.subject}</span>
          <span className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">
            {isAdmin ? "администратор" : "партнёр"}
          </span>
          <button type="button" onClick={() => void auth.signoutRedirect()} className="rounded-md px-3 py-1.5 text-ink-2 hover:bg-grid">
            Выйти
          </button>
        </div>
      </div>
    </header>
  );
}
