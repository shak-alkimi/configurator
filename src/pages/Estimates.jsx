import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import PortalShell from "@/components/PortalShell";
import {
  useProjectsTable,
  StatusFilterPills,
  SearchInput,
  BulkActionBar,
  ProjectsTable,
  ProjectDetailDrawer,
  RepFilter,
  exportProjectsCsv,
  statusLabel,
} from "@/components/projectsTable";

const STATUSES = ["draft", "submitted", "approved", "shipped"];
const PILL_ITEMS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "shipped", label: "Shipped" },
];

// Estimates is the full view of every project.
const baseFilter = () => true;

export default function Estimates() {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const t = useProjectsTable({ baseFilter, statuses: STATUSES });

  const startImpersonation = (email) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("as", email);
      next.delete("rep");
      return next;
    });
  };

  const onExport = () =>
    exportProjectsCsv(
      t.pageProjects.filter((p) => t.selectedIds.has(p.id)),
      "estimates"
    );

  return (
    <PortalShell>
      <h1 className="sr-only">Estimates</h1>
      <div className="px-[15px] pt-[92px] pb-8 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-4 mb-6">
          <StatusFilterPills
            items={PILL_ITEMS}
            counts={t.counts}
            active={t.activeStatus}
            onChange={t.setActiveStatus}
          />
          <div className="flex items-center gap-3">
            {t.isAdmin && !t.impersonateAs && (
              <RepFilter
                reps={t.reps}
                value={t.repFilter}
                onChange={t.setRepFilter}
                onImpersonate={startImpersonation}
              />
            )}
            <SearchInput
              value={t.search}
              onChange={t.setSearch}
              ariaLabel="Search estimates"
            />
          </div>
        </div>

        {t.selectedIds.size > 0 && (
          <BulkActionBar
            count={t.selectedIds.size}
            statuses={STATUSES}
            onClear={t.clearSelection}
            onStatusChange={(status) => {
              const count = t.selectedIds.size;
              t.updateStatus.mutate(
                { ids: [...t.selectedIds], status },
                {
                  onSuccess: () =>
                    toast.success(
                      `${count} ${count === 1 ? "estimate" : "estimates"} set to ${statusLabel(status)}`
                    ),
                  onError: (e) =>
                    toast.error(e?.message || "Failed to update estimates"),
                }
              );
            }}
            onExport={onExport}
            busy={t.updateStatus.isPending}
          />
        )}

        <ProjectsTable
          rows={t.rows}
          isLoading={t.isLoading}
          selectedIds={t.selectedIds}
          allSelected={t.allVisibleSelected}
          onToggleAll={t.toggleSelectAll}
          onToggleOne={t.toggleSelectOne}
          onOpen={t.selectProject}
          sortKey={t.sortKey}
          sortDir={t.sortDir}
          onSort={t.onSort}
          rowTestId="estimates-row"
          selectAllAriaLabel="Select all visible estimates"
          showOwner={t.isAdmin && !t.impersonateAs}
          showTotal
        />

        {t.rows.length === 0 && !t.isLoading && (
          <div className="py-16 text-center text-sm text-foreground/50">
            No estimates match the current filter.
          </div>
        )}
      </div>

      <ProjectDetailDrawer
        project={t.selectedProject}
        eyebrow="Estimate"
        onClose={() => t.selectProject(null)}
        onOpenConfigurator={() =>
          t.selectedProject && navigate(`/configurator?project=${t.selectedProject.id}`)
        }
      />
    </PortalShell>
  );
}
