import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { sortRows } from "./helpers";
import { calculateTotalPrice } from "@/components/calculator/calculations";

/**
 * Orchestrates the shared Projects-as-table experience used by Estimates / Orders.
 *
 * @param {object} opts
 * @param {(p: any) => boolean} opts.baseFilter - which projects belong to this page
 * @param {string[]} opts.statuses             - status keys allowed on this page (for the count map)
 */
export function useProjectsTable({ baseFilter, statuses }) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useAuth();

  // URL-backed state
  const selectedId = searchParams.get("project");
  const activeStatus = searchParams.get("status") || "all";
  const search = searchParams.get("q") || "";
  const sortKey = searchParams.get("sort") || "updated_date";
  const sortDir = searchParams.get("dir") || "desc";
  // Admin-only filters: rep selection and impersonation are both stored in the
  // same `as` URL param. For reps these are ignored (RLS already scopes them).
  const repFilter = isAdmin ? searchParams.get("rep") || "all" : "all";
  const impersonateAs = isAdmin ? searchParams.get("as") || null : null;

  const [selectedIds, setSelectedIds] = useState(new Set());

  const patchParams = (updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(updates)) {
        if (v == null || v === "" || v === "all") next.delete(k);
        else next.set(k, v);
      }
      return next;
    });
  };

  const setActiveStatus = (status) => patchParams({ status });
  const setSearch = (q) => patchParams({ q });
  const setRepFilter = (rep) => patchParams({ rep });

  // Defaults: sort by updated_date desc. URL params are omitted at the default
  // (so a fresh visit has a clean URL); any other state writes both params.
  const onSort = (key) => {
    const nextDir =
      key === sortKey
        ? sortDir === "asc"
          ? "desc"
          : "asc"
        : key === "updated_date"
        ? "desc"
        : "asc";
    const atDefault = key === "updated_date" && nextDir === "desc";
    patchParams({
      sort: atDefault ? null : key,
      dir: atDefault ? null : nextDir,
    });
  };

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-updated_date"),
  });

  // Fetch all tape runs so the table can show a per-project $ total. Grouped
  // by project_id below and combined with each project's `drivers` to compute
  // the same total the Materials/Summary card uses inside the Configurator.
  const { data: allTapeRuns = [] } = useQuery({
    queryKey: ["allTapeRuns"],
    queryFn: () => base44.entities.TapeRun.list(),
  });
  const runsByProject = useMemo(() => {
    const m = new Map();
    for (const r of allTapeRuns) {
      if (!r.project_id) continue;
      if (!m.has(r.project_id)) m.set(r.project_id, []);
      m.get(r.project_id).push(r);
    }
    return m;
  }, [allTapeRuns]);
  const projectsWithTotal = useMemo(
    () => projects.map((p) => ({
      ...p,
      total: calculateTotalPrice(runsByProject.get(p.id) || [], p.drivers || []),
    })),
    [projects, runsByProject]
  );

  // Source the rep filter dropdown from User entity (not project creators) so
  // accounts that have signed up but haven't created anything still appear.
  // Inactive accounts get greyed in the Toolbar's RepFilter.
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
    enabled: isAdmin,
  });

  const pageProjects = useMemo(
    () => projectsWithTotal.filter(baseFilter),
    [projectsWithTotal, baseFilter]
  );

  // Admins may also scope visible rows to a single rep (via the rep filter
  // pill) or "view as" a rep (impersonation banner). Both narrow the set the
  // same way client-side; the banner just adds a UI affordance.
  const scopedToEmail = impersonateAs || (repFilter !== "all" ? repFilter : null);

  // Counts power the status pills. They must respect rep/impersonation scope
  // and search (so "All N" matches the table the user is actually looking at),
  // but ignore the active status itself — otherwise selecting one pill would
  // zero out the others.
  const scopedProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pageProjects.filter((p) => {
      if (scopedToEmail && p.created_by !== scopedToEmail) return false;
      if (q) {
        const hay = `${p.project_name || ""} ${p.customer_name || ""} ${p.quote_number || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pageProjects, scopedToEmail, search]);

  const counts = useMemo(() => {
    const c = { all: scopedProjects.length };
    for (const s of statuses) c[s] = 0;
    for (const p of scopedProjects) {
      if (c[p.status] != null) c[p.status]++;
    }
    return c;
  }, [scopedProjects, statuses]);

  const rows = useMemo(() => {
    const filtered = activeStatus === "all"
      ? scopedProjects
      : scopedProjects.filter((p) => p.status === activeStatus);
    return sortRows(filtered, sortKey, sortDir);
  }, [scopedProjects, activeStatus, sortKey, sortDir]);

  // Rep list for the dropdown. Sourced from User entity so accounts with no
  // projects-on-this-page still appear (just with count: 0, greyed in the UI).
  // Per-rep counts and lastActivity come from this page's pageProjects, so
  // Orders shows different per-rep numbers than Estimates.
  const reps = useMemo(() => {
    if (!isAdmin) return [];
    const stats = new Map();
    for (const p of pageProjects) {
      const email = p.created_by;
      if (!email) continue;
      const entry = stats.get(email) || { count: 0, lastActivity: 0 };
      entry.count++;
      const t = p.updated_date ? new Date(p.updated_date).getTime() : 0;
      if (t > entry.lastActivity) entry.lastActivity = t;
      stats.set(email, entry);
    }
    return users
      .map((u) => {
        const s = stats.get(u.email);
        return {
          email: u.email,
          count: s?.count || 0,
          lastActivity: s?.lastActivity || 0,
        };
      })
      .sort((a, b) => {
        // Active reps first (by most recent activity), then inactive (alpha).
        if (a.count === 0 && b.count !== 0) return 1;
        if (b.count === 0 && a.count !== 0) return -1;
        if (a.count === 0 && b.count === 0) return a.email.localeCompare(b.email);
        return b.lastActivity - a.lastActivity;
      });
  }, [pageProjects, users, isAdmin]);

  const allVisibleSelected =
    rows.length > 0 && rows.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const p of rows) next.delete(p.id);
        return next;
      }
      const next = new Set(prev);
      for (const p of rows) next.add(p.id);
      return next;
    });
  };

  const toggleSelectOne = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearSelection = () => setSelectedIds(new Set());

  // Clear selection when the visible set changes via filter, search, rep
  // scope, or impersonation — keeps "N selected" honest.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeStatus, search, scopedToEmail]);

  const selectProject = (id) => patchParams({ project: id });
  const selectedProject = pageProjects.find((p) => p.id === selectedId) ?? null;

  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }) => {
      await Promise.all(
        ids.map((id) => base44.entities.Project.update(id, { status }))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      clearSelection();
    },
  });

  return {
    // data
    rows,
    isLoading,
    counts,
    pageProjects,
    reps,
    // role
    isAdmin,
    impersonateAs,
    // filters
    activeStatus,
    setActiveStatus,
    search,
    setSearch,
    repFilter,
    setRepFilter,
    // sort
    sortKey,
    sortDir,
    onSort,
    // selection
    selectedIds,
    allVisibleSelected,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    // detail
    selectedProject,
    selectProject,
    // mutations
    updateStatus,
  };
}
