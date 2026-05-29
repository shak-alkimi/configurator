import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, X, Download, Link2, Unlink, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatFeetInches } from "@/components/calculator/calculations";
import { useAuth } from "@/lib/AuthContext";
import CustomerPicker from "@/components/calculator/CustomerPicker";
import { STATUS_STYLE, statusLabel, isProjectLinked } from "./helpers";

export function ProjectDetailDrawer({ project, eyebrow, onClose, onOpenConfigurator }) {
  return (
    <Sheet open={!!project} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto p-0 [&>button]:hidden"
      >
        {project && (
          <ProjectDetail
            project={project}
            eyebrow={eyebrow}
            onClose={onClose}
            onOpenConfigurator={onOpenConfigurator}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProjectDetail({ project, eyebrow, onClose, onOpenConfigurator }) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const { isAdmin } = useAuth();
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["tapeRuns", project.id],
    queryFn: () => base44.entities.TapeRun.filter({ project_id: project.id }, "order"),
  });

  const handleSharePdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await base44.functions.invoke("exportProjectPDF", {
        project_id: project.id,
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.project_name || "estimate"}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF ready to share");
    } catch (e) {
      toast.error(e?.message || "Failed to generate PDF");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <header className="sticky top-0 bg-background z-10 px-8 pt-8 pb-6 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-foreground/50 uppercase tracking-wider mb-2">
              {eyebrow}
              {project.quote_number && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  <span className="tabular-nums normal-case tracking-normal">
                    {project.quote_number}
                  </span>
                </>
              )}
            </div>
            <SheetTitle className="text-[28px] font-semibold leading-tight text-foreground break-words">
              {project.project_name || "Untitled"}
            </SheetTitle>
            {project.customer_name && (
              <p className="text-sm text-foreground/60 mt-2">
                {project.customer_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 -mt-1 -mr-1 inline-flex items-center justify-center w-8 h-8 rounded-[3px] text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-5">
          <span
            className={`inline-flex items-center h-6 px-2 rounded-[3px] text-[11px] font-medium uppercase tracking-wider ${
              STATUS_STYLE[project.status] || STATUS_STYLE.draft
            }`}
          >
            {statusLabel(project.status)}
          </span>
          <button
            onClick={onOpenConfigurator}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[3px] border border-border text-sm font-medium hover:bg-foreground/5 transition-colors"
            data-testid="detail-open-configurator"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Edit in Configurator
          </button>
          <button
            onClick={handleSharePdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[3px] border border-border text-sm font-medium hover:bg-foreground/5 disabled:opacity-50 transition-colors"
            data-testid="detail-share-pdf"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {downloadingPdf ? "Generating…" : "Share PDF"}
          </button>
        </div>
      </header>

      <div className="px-8 py-6 space-y-8">
        <CustomerPanel project={project} isAdmin={isAdmin} />

        <section>
          <h3 className="text-xs uppercase tracking-wider text-foreground/50 mb-3">
            Details
          </h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {project.customer_email && <InfoField label="Email" value={project.customer_email} />}
            {project.customer_phone && <InfoField label="Phone" value={project.customer_phone} />}
            {project.sector && <InfoField label="Sector" value={project.sector} />}
            {(project.city || project.state) && (
              <InfoField
                label="Location"
                value={[project.city, project.state].filter(Boolean).join(", ")}
              />
            )}
            {project.street && (
              <InfoField label="Street" value={project.street} className="col-span-2" />
            )}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-xs uppercase tracking-wider text-foreground/50">
              Tape runs
            </h3>
            {!isLoading && runs.length > 0 && (
              <span className="text-xs text-foreground/40 tabular-nums">
                {runs.length}
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="py-6 text-center text-foreground/40 text-sm">Loading…</div>
          ) : runs.length === 0 ? (
            <div className="py-6 text-center text-foreground/40 text-sm border border-border rounded-[10px]">
              No tape runs configured.
            </div>
          ) : (
            <ul className="space-y-2">
              {runs.map((run, i) => (
                <TapeRunCard key={run.id} run={run} index={i} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TapeRunCard({ run, index }) {
  const specs = [
    run.length_feet != null && { label: "Length", value: formatFeetInches(run.length_feet) },
    run.tape_output && { label: "Output", value: run.tape_output },
    run.cct && { label: "CCT", value: run.cct },
    run.channel_type && { label: "Channel", value: run.channel_type, capitalize: true },
  ].filter(Boolean);

  return (
    <li className="border border-border rounded-[10px] p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            {run.run_name || `Run ${index + 1}`}
          </div>
          {run.location && (
            <div className="text-xs text-foreground/50 truncate mt-0.5">
              {run.location}
            </div>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-4 gap-3 text-xs">
        {specs.map(({ label, value, capitalize }) => (
          <div key={label} className="min-w-0">
            <dt className="text-foreground/40 uppercase tracking-wider">{label}</dt>
            <dd
              className={`text-foreground mt-0.5 truncate tabular-nums ${
                capitalize ? "capitalize" : ""
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function InfoField({ label, value, className = "" }) {
  return (
    <div className={className}>
      <div className="text-xs text-foreground/40 uppercase tracking-wider">{label}</div>
      <div className="text-foreground mt-0.5 break-words">{value}</div>
    </div>
  );
}

// Customer linkage panel (#118). Renders linked / unlinked state + admin
// Link / Change / Unlink actions. Reps see indicator + read-only display.
//
// State derivation uses project.opus_customer_id (not the linkedCustomer
// entity) per the #117 fix — so reps with no Customer-read RLS still see
// the correct linked/unlinked branch.
//
// Server boundary: all writes go through writeProjectAsOwner, which
// already enforces (a) admin-only on opus_customer_id, (b) Customer-
// exists validation, (c) status='submitted'/'approved' gate, and (per
// #118) (d) unlink-only-on-draft. UI gates here are friendly-UX layer.
function CustomerPanel({ project, isAdmin }) {
  const queryClient = useQueryClient();
  const linked = isProjectLinked(project);
  const isDraft = project.status === 'draft' || !project.status;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // Admin-only: resolve the linked Customer entity for richer display.
  // Rep falls back to the project's cached customer_name/email/phone.
  const { data: linkedCustomer = null } = useQuery({
    queryKey: ['customer', project.opus_customer_id],
    queryFn: async () => {
      if (!project.opus_customer_id) return null;
      return await base44.entities.Customer.get(project.opus_customer_id).catch(() => null);
    },
    enabled: !!project.opus_customer_id && isAdmin,
  });

  const applyPatch = async (patch, successMsg) => {
    setPending(true);
    try {
      const res = await base44.functions.invoke('writeProjectAsOwner', {
        op: 'update',
        projectId: project.id,
        patch,
      });
      if (!res?.data?.ok) {
        throw new Error(res?.data?.error || 'Update failed');
      }
      toast.success(successMsg);
      // Invalidate so drawer + table refresh.
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['customer', project.opus_customer_id] });
      queryClient.invalidateQueries({ queryKey: ['customer', patch.opus_customer_id] });
    } catch (err) {
      toast.error(err?.message || 'Update failed');
    } finally {
      setPending(false);
    }
  };

  const handlePick = async (customer) => {
    await applyPatch(
      {
        opus_customer_id: customer.id,
        customer_name: customer.name || '',
        customer_email: customer.email || '',
        customer_phone: customer.phone || '',
      },
      linked ? 'Customer changed' : 'Customer linked',
    );
    setPickerOpen(false);
  };

  const handleUnlink = async () => {
    setUnlinkConfirmOpen(false);
    await applyPatch({ opus_customer_id: '' }, 'Customer unlinked');
  };

  // Display name/email: admin uses linkedCustomer when available (canonical),
  // otherwise falls back to project cache fields. Reps always use cache.
  const displayName = (isAdmin && linkedCustomer?.name)
    || project.customer_name
    || null;
  const displayEmail = (isAdmin && linkedCustomer?.email)
    || project.customer_email
    || null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider text-foreground/50 flex items-center gap-1.5">
          <Link2 className="h-3 w-3" aria-hidden="true" />
          Customer
        </h3>
        {linked ? (
          <span
            className="text-[10px] font-medium uppercase tracking-wider text-foreground/40"
            aria-label="Project is linked to a Customer record"
          >
            Linked
          </span>
        ) : (
          <span
            className="inline-flex items-center h-5 px-1.5 rounded-[3px] text-[10px] font-medium uppercase tracking-wider border border-foreground/20 bg-foreground/5 text-foreground/70"
            aria-label="Customer not linked to a Customer record"
          >
            Not linked
          </span>
        )}
      </div>

      {linked ? (
        <div className="space-y-2">
          <div className="text-sm">
            <div className="text-foreground font-medium">{displayName || '(unnamed)'}</div>
            {displayEmail && (
              <div className="text-foreground/60 text-xs mt-0.5">{displayEmail}</div>
            )}
          </div>
          {isAdmin && (
            <div className="flex gap-2 pt-1">
              {pickerOpen ? (
                <div className="flex-1">
                  <CustomerPicker
                    value={project.opus_customer_id || ''}
                    linkedCustomer={linkedCustomer}
                    onPick={handlePick}
                    disabled={pending}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    disabled={pending}
                  >
                    Change customer
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUnlinkConfirmOpen(true)}
                    disabled={pending || !isDraft}
                    title={!isDraft
                      ? 'Unlink is only available on draft Projects. Use Change customer instead.'
                      : 'Unlink this customer'}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                    Unlink
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-foreground/60 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-foreground/60 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              This project isn't linked to a Customer record.
              {isAdmin
                ? ' Link a Customer below before this project can be submitted.'
                : ' An admin must link a Customer before this project can be submitted.'}
            </span>
          </div>
          {/* Show legacy free-text customer info if present (helps admin pick the right Customer). */}
          {(project.customer_name || project.customer_email) && (
            <div className="text-xs text-foreground/50 space-y-0.5">
              {project.customer_name && <div>Captured name: <span className="text-foreground/70">{project.customer_name}</span></div>}
              {project.customer_email && <div>Captured email: <span className="text-foreground/70">{project.customer_email}</span></div>}
            </div>
          )}
          {isAdmin && (
            <div>
              {pickerOpen ? (
                <div>
                  <CustomerPicker
                    value=""
                    linkedCustomer={null}
                    onPick={handlePick}
                    disabled={pending}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  disabled={pending}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Link customer
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <AlertDialog open={unlinkConfirmOpen} onOpenChange={setUnlinkConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlink this customer?</AlertDialogTitle>
              <AlertDialogDescription>
                The project will be marked as not linked. It can't be submitted until a customer is re-linked.
                The cached customer name / email / phone stay on the project until you edit them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnlink} disabled={pending}>Unlink</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}
