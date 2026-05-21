import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, X, Download } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { formatFeetInches } from "@/components/calculator/calculations";
import { STATUS_STYLE, statusLabel } from "./helpers";

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
