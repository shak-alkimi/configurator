import { format } from "date-fns";
import { ChevronDown, ChevronUp, Link2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { STATUS_STYLE, statusLabel, isProjectLinked } from "./helpers";

export function ProjectsTable({
  rows,
  isLoading,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleOne,
  onOpen,
  sortKey,
  sortDir,
  onSort,
  rowTestId,
  selectAllAriaLabel,
  showOwner = false,
  showTotal = false,
}) {
  const colCount = 6 + (showOwner ? 1 : 0) + (showTotal ? 1 : 0);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-[10px]">
      <table className="w-full text-sm" role="grid">
        <thead className="sticky top-0 bg-background z-10">
          <tr className="border-b border-border text-xs uppercase tracking-wider text-foreground/50">
            <th className="w-10 px-4 py-3">
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label={selectAllAriaLabel}
              />
            </th>
            <SortHeader label="Project" sortKeyName="project_name" {...{ sortKey, sortDir, onSort }} />
            <SortHeader label="Customer" sortKeyName="customer_name" {...{ sortKey, sortDir, onSort }} />
            {showTotal && (
              <SortHeader label="Total" sortKeyName="total" align="right" {...{ sortKey, sortDir, onSort }} />
            )}
            {showOwner && (
              <SortHeader label="Owner" sortKeyName="created_by" {...{ sortKey, sortDir, onSort }} />
            )}
            <SortHeader label="Quote #" sortKeyName="quote_number" {...{ sortKey, sortDir, onSort }} />
            <SortHeader label="Status" sortKeyName="status" {...{ sortKey, sortDir, onSort }} />
            <SortHeader label="Updated" sortKeyName="updated_date" align="right" {...{ sortKey, sortDir, onSort }} />
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-12 text-center text-foreground/40">
                Loading…
              </td>
            </tr>
          ) : (
            rows.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                selected={selectedIds.has(p.id)}
                onToggle={() => onToggleOne(p.id)}
                onOpen={() => onOpen(p.id)}
                rowTestId={rowTestId}
                showOwner={showOwner}
                showTotal={showTotal}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({ label, sortKeyName, sortKey, sortDir, onSort, align = "left" }) {
  const isActive = sortKey === sortKeyName;
  // Active column shows the actual sort direction; inactive columns reveal a
  // neutral down-chevron on hover so the affordance is clear.
  const Arrow = isActive && sortDir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={`font-medium px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onSort(sortKeyName)}
        aria-sort={isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`group inline-flex items-center gap-1 transition-colors ${
          align === "right" ? "ml-auto" : ""
        } ${isActive ? "text-foreground" : "hover:text-foreground"}`}
      >
        {label}
        <Arrow
          className={`h-3 w-3 transition-opacity ${
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
          }`}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

function ProjectRow({ project: p, selected, onToggle, onOpen, rowTestId, showOwner, showTotal }) {
  return (
    <tr
      data-testid={rowTestId}
      data-project-id={p.id}
      className={`border-b border-border last:border-b-0 transition-colors ${
        selected ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.02]"
      }`}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${p.project_name || "Untitled"}`}
        />
      </td>
      <td className="px-4 py-3 cursor-pointer" onClick={onOpen}>
        <div className="font-medium text-foreground truncate">
          {p.project_name || "Untitled"}
        </div>
      </td>
      <td className="px-4 py-3 cursor-pointer text-foreground/70" onClick={onOpen}>
        <CustomerCell project={p} />
      </td>
      {showTotal && (
        <td className="px-4 py-3 cursor-pointer text-right tabular-nums font-medium" onClick={onOpen}>
          {Number.isFinite(p.total) && p.total > 0
            ? `$${p.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : <span className="text-foreground/30">—</span>}
        </td>
      )}
      {showOwner && (
        <td className="px-4 py-3 cursor-pointer text-foreground/60 truncate max-w-[200px]" onClick={onOpen} title={p.created_by || "—"}>
          {p.created_by || "—"}
        </td>
      )}
      <td className="px-4 py-3 cursor-pointer text-foreground/60 tabular-nums" onClick={onOpen}>
        {p.quote_number || "—"}
      </td>
      <td className="px-4 py-3 cursor-pointer" onClick={onOpen}>
        <span
          className={`inline-flex items-center h-6 px-2 rounded-[3px] text-[11px] font-medium uppercase tracking-wider ${
            STATUS_STYLE[p.status] || STATUS_STYLE.draft
          }`}
        >
          {statusLabel(p.status)}
        </span>
      </td>
      <td
        className="px-4 py-3 cursor-pointer text-right text-xs text-foreground/50 tabular-nums"
        onClick={onOpen}
      >
        {p.updated_date ? format(new Date(p.updated_date), "MMM d, yyyy") : "—"}
      </td>
    </tr>
  );
}

// Customer cell with inline linkage indicator (#118). Linked rows show a
// small chain-link icon with an aria-label; unlinked rows show an amber
// "Not linked" pill. Indicator is accessible via title/aria, not color-only.
// Same visual for admin + rep (visibility is operational info; admin gets
// link actions in the detail drawer, not the table row).
function CustomerCell({ project }) {
  const linked = isProjectLinked(project);
  const customerName = project.customer_name && project.customer_name.trim() ? project.customer_name : null;
  if (linked) {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Link2
          className="h-3 w-3 text-foreground/40 shrink-0"
          aria-label="Linked to a customer record"
        />
        <span className="truncate">{customerName || "—"}</span>
      </span>
    );
  }
  // Unlinked: amber mini-pill next to the name (or in place of "—" if blank).
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      {customerName ? (
        <span className="truncate">{customerName}</span>
      ) : (
        <span className="text-foreground/40">—</span>
      )}
      <span
        role="status"
        aria-label="Customer not linked to a Customer record"
        title="Customer not linked. An admin must link a Customer record before this project can be submitted."
        className="inline-flex items-center h-5 px-1.5 rounded-[3px] text-[10px] font-medium uppercase tracking-wider border border-foreground/20 bg-foreground/5 text-foreground/70"
      >
        Not linked
      </span>
    </span>
  );
}
