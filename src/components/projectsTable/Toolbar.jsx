import { Search, Download, ChevronDown, X, Users, Eye } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusLabel } from "./helpers";

export function StatusFilterPills({ items, counts, active, onChange }) {
  return (
    <div className="flex items-center gap-2" role="tablist" aria-label="Filter by status">
      {items.map(({ key, label }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={`h-9 px-4 rounded-[3px] text-sm font-medium leading-none transition-colors ${
              isActive
                ? "bg-foreground text-background"
                : "text-foreground/60 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs opacity-60 tabular-nums">
              {counts[key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({ value, onChange, ariaLabel, placeholder = "Search by name, customer, quote #" }) {
  const hasValue = value.length > 0;
  return (
    <div className="relative w-72">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={`w-full h-9 pl-9 ${
          hasValue ? "pr-9" : "pr-3"
        } text-sm bg-transparent border border-border rounded-[3px] focus:outline-none focus:border-foreground/40 transition-colors`}
      />
      {hasValue && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-[3px] text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function RepFilter({ reps, value, onChange, onImpersonate }) {
  const currentLabel =
    value === "all" ? "All reps" : value;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[3px] border border-border text-sm text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
        aria-label="Filter by rep"
      >
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[160px] truncate">{currentLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange("all")}>
          All reps
          <span className="ml-auto text-xs text-foreground/40">
            ({reps.reduce((s, r) => s + r.count, 0)})
          </span>
        </DropdownMenuItem>
        {reps.length === 0 ? (
          <DropdownMenuItem disabled className="text-foreground/40">
            No reps yet
          </DropdownMenuItem>
        ) : (
          reps.map((r) => {
            const inactive = r.count === 0;
            return (
              <div
                key={r.email}
                className="flex items-center gap-1 group"
              >
                <DropdownMenuItem
                  onClick={() => onChange(r.email)}
                  className={`flex-1 ${inactive ? "text-foreground/40" : ""}`}
                >
                  <span className="truncate">{r.email}</span>
                  <span className="ml-auto text-xs text-foreground/40 tabular-nums">
                    {r.count}
                  </span>
                </DropdownMenuItem>
                {onImpersonate && (
                  <button
                    type="button"
                    onClick={() => onImpersonate(r.email)}
                    className="px-2 py-1.5 rounded-sm text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    title={`View as ${r.email}`}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BulkActionBar({ count, statuses, onClear, onStatusChange, onExport, busy }) {
  return (
    <div
      className="mb-3 flex items-center justify-between gap-4 px-4 h-12 bg-foreground text-background rounded-[3px] animate-in fade-in slide-in-from-top-1 duration-200"
      role="region"
      aria-label="Bulk actions"
    >
      <div className="text-sm font-medium">
        {count} selected
        <button
          onClick={onClear}
          className="ml-3 text-xs underline opacity-70 hover:opacity-100"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[3px] bg-background/10 text-sm font-medium hover:bg-background/20 disabled:opacity-50 transition-colors"
          >
            Change status
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {statuses.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onStatusChange(s)}>
                {statusLabel(s)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[3px] bg-background/10 text-sm font-medium hover:bg-background/20 transition-colors"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export CSV
        </button>
      </div>
    </div>
  );
}
