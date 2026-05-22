import { useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { DEPLOY_MARKER } from "@/lib/deploy-marker";
import { ChevronDown, Eye, LogOut, Settings as SettingsIcon, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_ITEMS_ALL = [
  { to: "/dashboard", label: "Dashboard", roles: ["admin", "rep"] },
  { to: "/configurator", label: "Configurator", roles: ["admin", "rep"] },
  { to: "/estimates", label: "Estimates", roles: ["admin", "rep"] },
  { to: "/orders", label: "Orders", roles: ["admin", "rep"] },
  { to: "/reps", label: "Reps", roles: ["admin"] },
  { to: "/sales", label: "Sales", roles: ["admin"], soon: true },
  { to: "/inventory", label: "Inventory", roles: ["admin"], soon: true },
  { to: "/docs", label: "Documentation", roles: ["admin", "rep"], soon: true },
];

function NavItem({ to, label, soon }) {
  const base = "text-sm font-medium leading-none py-1 transition-colors";
  if (soon) {
    return (
      <span
        aria-disabled="true"
        className={`${base} text-foreground/30 cursor-not-allowed`}
        title="Coming soon"
      >
        {label}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `${base} ${
          isActive
            ? "text-foreground"
            : "text-foreground/60 hover:text-foreground"
        }`
      }
    >
      {label}
    </NavLink>
  );
}

function AccountPill({ user, isAdmin, onSignOut, onSettings }) {
  const label = user?.full_name || user?.email || "Account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-[3px] bg-foreground text-background text-sm font-medium leading-none hover:bg-foreground/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ padding: '11px 12px 11px 18px' }}
        >
          <span className="max-w-[160px] truncate">{label}</span>
          <span
            className={`inline-flex items-center px-1.5 h-4 rounded-[2px] text-[9px] font-semibold tracking-wider uppercase ${
              isAdmin
                ? "bg-background/15 text-background"
                : "bg-background/10 text-background/80"
            }`}
            aria-label={`Role: ${isAdmin ? 'Admin' : 'Rep'}`}
          >
            {isAdmin ? "Admin" : "Rep"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-[180px]">
        <DropdownMenuItem onSelect={onSettings} className="cursor-pointer">
          <SettingsIcon className="h-3.5 w-3.5 mr-2 opacity-70" aria-hidden="true" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut className="h-3.5 w-3.5 mr-2 opacity-70" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ImpersonationBanner({ asEmail, onExit }) {
  return (
    <div
      role="status"
      className="bg-foreground text-background text-sm flex items-center justify-center gap-3 py-2 px-4"
    >
      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        Viewing as <span className="font-semibold">{asEmail}</span>. Your actions still apply as admin.
      </span>
      <button
        onClick={onExit}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-background/15 hover:bg-background/25 transition-colors"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Exit
      </button>
    </div>
  );
}

export default function PortalShell({ children, showDivider = false }) {
  const { user, isAdmin, isRep, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const asEmail = isAdmin ? searchParams.get("as") : null;

  const navItems = NAV_ITEMS_ALL.filter((item) => {
    if (isAdmin) return item.roles.includes("admin");
    if (isRep) return item.roles.includes("rep");
    return false;
  });

  const exitImpersonation = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("as");
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {asEmail && (
        <ImpersonationBanner asEmail={asEmail} onExit={exitImpersonation} />
      )}
      <header
        role="banner"
        className="sticky top-0 z-40 bg-background/95 backdrop-blur"
      >
        <div className="h-[67px] px-[15px] flex items-center justify-between relative">
          {showDivider && (
            <div
              aria-hidden="true"
              className="absolute left-[15px] right-[15px] bottom-0 h-px origin-center animate-[portal-shell-divider_1800ms_cubic-bezier(0.16,1,0.3,1)_both]"
              style={{ backgroundColor: 'rgba(37, 35, 32, 0.14)' }}
            />
          )}

          <nav
            aria-label="Primary"
            className="flex items-center gap-5"
          >
            {navItems.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </nav>

          <NavLink
            to="/dashboard"
            aria-label="Alkimi home"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 block"
          >
            <img
              src="/alkimi-logo.svg"
              alt="Alkimi"
              className="w-[160px] h-auto"
            />
          </NavLink>

          <div className="flex items-center gap-3">
            <AccountPill
              user={user}
              isAdmin={isAdmin}
              onSettings={() => navigate("/settings")}
              onSignOut={() => logout()}
            />
          </div>
        </div>
      </header>

      <main role="main" className="flex-1 flex flex-col min-h-0">
        {children}
      </main>
      <VersionFooter />
    </div>
  );
}

function VersionFooter() {
  const [backend, setBackend] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("getVersion", {});
      setBackend(res?.data || res);
    } catch (e) {
      setBackend({ error: e?.message || "Failed" });
    } finally {
      setBusy(false);
    }
  };

  const matches = backend && !backend.error && backend.sha === DEPLOY_MARKER;

  return (
    <footer className="px-[15px] py-2 flex items-center justify-end gap-3 text-[10px] text-foreground/40 tabular-nums">
      <span>frontend {DEPLOY_MARKER}</span>
      {backend && (
        <span className={backend.error ? "text-red-600/60" : matches ? "text-foreground/40" : "text-amber-600"}>
          {backend.error ? `backend error: ${backend.error}` : `backend ${backend.sha}${matches ? " ✓" : " ✗"}`}
        </span>
      )}
      <button
        onClick={check}
        disabled={busy}
        className="text-foreground/40 hover:text-foreground/70 underline underline-offset-2 disabled:opacity-50"
      >
        {busy ? "checking…" : backend ? "recheck" : "check backend"}
      </button>
    </footer>
  );
}
