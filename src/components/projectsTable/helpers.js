import { format } from "date-fns";

export const STATUS_STYLE = {
  draft: "bg-foreground/10 text-foreground/70",
  submitted: "bg-foreground/15 text-foreground",
  approved: "bg-primary/15 text-primary",
  // in_fulfillment sits between approved and shipped — SOS-driven, project
  // is committed but stock is still being assembled / packed.
  in_fulfillment: "bg-primary/25 text-primary",
  shipped: "bg-foreground text-background",
};

export const STATUS_ORDER = {
  draft: 0,
  submitted: 1,
  approved: 2,
  in_fulfillment: 3,
  shipped: 4,
};

// Canonical "what counts as an order" status set. A project is in the order
// lifecycle once it's left draft and not yet been deleted. Used by:
//   - src/pages/Orders.jsx page-filter (STATUSES alias)
//   - src/pages/Dashboard.jsx Orders count
// Keep these consumers in sync by importing from here instead of redefining.
// Anything moved to a new lifecycle state must be added here or it will
// vanish from both the Orders page and the dashboard total.
export const ORDER_STATUSES = ["submitted", "approved", "in_fulfillment", "shipped"];

// Statuses a rep or admin can MANUALLY set via writeProjectAsOwner.
// in_fulfillment + shipped are SOS-driven (reconcileSOSOrders) and would be
// rejected by writeProjectAsOwner allowlist — never include here.
export const REP_SETTABLE_STATUSES = ["draft", "submitted", "approved"];

// Project has a deterministic Customer linkage when opus_customer_id is a
// non-empty string. Pure data check — does NOT require the Customer entity
// to be readable (which is admin-only RLS). Reps can call this to know
// whether a project is in the linked state. (#118)
export function isProjectLinked(project) {
  return !!project
    && typeof project.opus_customer_id === 'string'
    && project.opus_customer_id.trim() !== '';
}

// Capitalize first letter; turn snake_case into Title Case so "in_fulfillment"
// renders as "In Fulfillment" rather than "In_fulfillment".
export function statusLabel(s) {
  if (!s) return "";
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sortRows(rows, key, dir) {
  const mult = dir === "asc" ? 1 : -1;
  const getVal = (p) => {
    switch (key) {
      case "project_name":
        return (p.project_name || "").toLowerCase();
      case "customer_name":
        return (p.customer_name || "").toLowerCase();
      case "created_by":
        return (p.created_by || "").toLowerCase();
      case "quote_number":
        return (p.quote_number || "").toLowerCase();
      case "status":
        return STATUS_ORDER[p.status] ?? 99;
      case "updated_date":
        return p.updated_date ? new Date(p.updated_date).getTime() : 0;
      default:
        return "";
    }
  };
  return [...rows].sort((a, b) => {
    const av = getVal(a);
    const bv = getVal(b);
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
}

export function exportProjectsCsv(rows, filenamePrefix) {
  if (!rows.length) return;
  const headers = [
    "Project name",
    "Customer",
    "Quote #",
    "Status",
    "Sector",
    "City",
    "State",
    "Updated",
  ];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.project_name,
        r.customer_name,
        r.quote_number,
        r.status,
        r.sector,
        r.city,
        r.state,
        r.updated_date,
      ]
        .map(escape)
        .join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
