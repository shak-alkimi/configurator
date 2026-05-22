import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, Download, MoreHorizontal, Pencil, Save, Send, Trash2 } from "lucide-react";
import PortalShell from "@/components/PortalShell";
import { STATUS_STYLE, statusLabel } from "@/components/projectsTable/helpers";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
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


import ProjectForm, { isValidCity } from "../components/calculator/ProjectForm";
import TapeRunList from "../components/calculator/TapeRunList";
import MaterialsCalculator from "../components/calculator/MaterialsCalculator";
import { calculateTotalPrice } from "../components/calculator/calculations";

// Blank project form state. Used by the component's initial state and by
// `handleNewProject` when resetting to the "new project" form.
const EMPTY_PROJECT_DATA = Object.freeze({
  project_name: '',
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  street: '',
  city: '',
  state: '',
  sector: '',
  notes: '',
  status: 'draft',
  drivers: [],
});

export default function Calculator() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedProjectId = searchParams.get('project') || null;
  const setSelectedProjectId = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('project', id); else next.delete('project');
    setSearchParams(next, { replace: true });
  };
  const [isExporting, setIsExporting] = useState(false);
  const [projectData, setProjectData] = useState({ ...EMPTY_PROJECT_DATA });
  const [isNewProject, setIsNewProject] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [editingDetails, setEditingDetails] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emptyDriversPrompt, setEmptyDriversPrompt] = useState(null);
  const detailsFormRef = useRef(null);
  // Mirror the middle column's total content height (DetailsHeader +
  // TapeRunList) onto the empty-state Materials card so the right rail's
  // empty state matches whatever the middle column adds up to — works in
  // both the expanded and collapsed details states. Uses a callback ref
  // because the observed element only mounts after the project-context
  // conditional opens up — a regular useRef + useEffect with [] deps would
  // miss the mount.
  const [middleColumnHeight, setMiddleColumnHeight] = useState(null);
  const middleColumnObserverRef = useRef(null);
  const middleColumnRef = React.useCallback((node) => {
    if (middleColumnObserverRef.current) {
      middleColumnObserverRef.current.disconnect();
      middleColumnObserverRef.current = null;
    }
    if (!node || typeof ResizeObserver === 'undefined') return;
    setMiddleColumnHeight(Math.round(node.getBoundingClientRect().height));
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setMiddleColumnHeight(Math.round(entry.contentRect.height));
    });
    ro.observe(node);
    middleColumnObserverRef.current = ro;
  }, []);

  // Header collapse is now a deliberate action only — via the chevron in the
  // strip or after a successful Save click. No outside-click auto-collapse
  // that would interrupt mid-typing.

  const queryClient = useQueryClient();

  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  // Fetch tape runs for selected project
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ['tapeRuns', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const runs = await base44.entities.TapeRun.filter({ project_id: selectedProjectId });
      return runs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    },
    enabled: !!selectedProjectId,
  });

  // Create/Update project mutation
  const saveProjectMutation = useMutation({
    mutationFn: async (data) => {
      if (isNewProject) {
        return await base44.entities.Project.create(data);
      } else {
        return await base44.entities.Project.update(selectedProjectId, data);
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // For new projects, attach the id so subsequent saves go to update path.
      // Patch projectData.id too — otherwise the `isHydrating` check stays true
      // (id mismatch) and the header treats the rep as still loading.
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
      }
      setProjectData((prev) => (prev.id === result.id ? prev : { ...prev, id: result.id }));
      // Only collapse the header when the rep actually has the details
      // filled in. An auto-save triggered by adding a tape run (with empty
      // customer info) shouldn't snap the header closed under them.
      const fullyFilled = ['project_name','sector','street','city','state','customer_name','customer_email','customer_phone']
        .every(f => result?.[f]?.toString().trim());
      if (fullyFilled) setEditingDetails(false);
      setIsDirty(false);
      toast.success('Project saved');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to save project');
    },
  });

  // Create tape run mutation
  const createTapeRunMutation = useMutation({
    mutationFn: (runData) => base44.entities.TapeRun.create(runData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run added');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to add tape run');
    },
  });

  // Update tape run mutation
  const updateTapeRunMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TapeRun.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      if (!variables?.silent) toast.success('Tape run updated');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to update tape run');
    },
  });

  // Delete tape run mutation
  const deleteTapeRunMutation = useMutation({
    mutationFn: (runId) => base44.entities.TapeRun.delete(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run deleted');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to delete tape run');
    },
  });

  // Reorder tape runs mutation.
  // Updates are sequential rather than Promise.all so a mid-batch failure stops
  // immediately instead of letting partial writes commit while later ones race.
  const reorderTapeRunsMutation = useMutation({
    mutationFn: async (reorderedRuns) => {
      for (let i = 0; i < reorderedRuns.length; i++) {
        await base44.entities.TapeRun.update(reorderedRuns[i].id, {
          order: i,
          driver_group: reorderedRuns[i].driver_group ?? '',
        });
      }
    },
    onMutate: async (newReorderedRuns) => {
      await queryClient.cancelQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      const previousTapeRuns = queryClient.getQueryData(['tapeRuns', selectedProjectId]);
      const runsWithUpdatedOrder = newReorderedRuns.map((run, index) => ({ ...run, order: index }));
      queryClient.setQueryData(['tapeRuns', selectedProjectId], runsWithUpdatedOrder);
      return { previousTapeRuns };
    },
    onError: (error, newReorderedRuns, context) => {
      queryClient.setQueryData(['tapeRuns', selectedProjectId], context.previousTapeRuns);
      toast.error(error?.message || 'Failed to reorder');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
    },
  });

  const handleReorderRuns = (reorderedRuns) => {
    reorderTapeRunsMutation.mutate(reorderedRuns);
  };

  // Update drivers — optimistic local update, persisted through a tracked mutation
  // with rollback so a failed save doesn't leave the UI ahead of the server.
  const updateDriversMutation = useMutation({
    mutationFn: ({ projectId, drivers }) =>
      base44.entities.Project.update(projectId, { drivers }),
    onMutate: ({ drivers }) => {
      const previousDrivers = projectData.drivers;
      setProjectData(prev => ({ ...prev, drivers }));
      return { previousDrivers };
    },
    onError: (error, _vars, context) => {
      if (context?.previousDrivers !== undefined) {
        setProjectData(prev => ({ ...prev, drivers: context.previousDrivers }));
      }
      toast.error(error?.message || 'Failed to update drivers');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const handleDriversChange = (newDrivers) => {
    setIsDirty(true);
    if (selectedProjectId) {
      updateDriversMutation.mutate({ projectId: selectedProjectId, drivers: newDrivers });
    } else {
      // No project saved yet — just update local state; first save will persist drivers.
      setProjectData(prev => ({ ...prev, drivers: newDrivers }));
    }
  };

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleNewProject();
      toast.success('Project deleted');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to delete project');
    },
  });

  // Load selected project when either the id changes OR the projects list
  // finally resolves on first mount. The `projectData.id !== selectedProjectId`
  // guard ensures background refetches don't clobber in-progress edits — once
  // a project is hydrated locally, subsequent projects-list refreshes are
  // ignored for that same id.
  useEffect(() => {
    if (selectedProjectId && !isNewProject && projectData.id !== selectedProjectId) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        setProjectData(project);
        setIsDirty(false);
      }
    }
  }, [selectedProjectId, isNewProject, projects, projectData.id]);

  // No empty state on the Configurator: visits without a ?project param drop
  // the rep straight into the new-project form. Dashboard's Configurator card
  // is the visible entry point with the orb video.
  useEffect(() => {
    if (!selectedProjectId && !isNewProject) {
      setIsNewProject(true);
      setProjectData({ ...EMPTY_PROJECT_DATA });
      setFormResetKey((prev) => prev + 1);
    }
  }, [selectedProjectId, isNewProject]);

  const handleNewProject = async (initialName = '') => {
    const seedName = (typeof initialName === 'string' ? initialName : '').trim();

    if (!seedName) {
      // Empty-name reset (logo click, post-delete): clear selection and DON'T
      // enter "new project" mode — the right pane should be empty.
      setIsNewProject(false);
      setSelectedProjectId(null);
      setProjectData({ ...EMPTY_PROJECT_DATA });
      setFormResetKey(prev => prev + 1);
      return;
    }

    try {
      const created = await base44.entities.Project.create({
        project_name: seedName,
        status: 'draft',
        drivers: [{ id: String(Date.now()), name: 'Driver 1', maxWatts: 96 }]
      });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectData(created);
      setSelectedProjectId(created.id);
      setIsNewProject(false);
      setFormResetKey(prev => prev + 1);
      toast.success('Draft created');
    } catch (error) {
      toast.error(error?.message || 'Failed to create draft');
    }
  };

  const handleSaveProject = async () => {
    if (!projectData.project_name) {
      toast.error('Project name is required');
      return;
    }
    if (!isValidCity(projectData.city)) {
      toast.error('City must start with a letter (letters, spaces, hyphens, apostrophes, periods only)');
      return;
    }
    await saveProjectMutation.mutateAsync(projectData);
  };

  const handleAddTapeRun = async (runData) => {
    try {
      const nextOrder = tapeRuns.length;
      if (!selectedProjectId && isNewProject) {
        // Don't block prototyping if the rep hasn't named the project yet —
        // auto-fill a placeholder so the run can save and produce a live cost.
        // The rep can rename in the details strip whenever they're ready.
        const ensuredData = projectData.project_name
          ? projectData
          : { ...projectData, project_name: 'Untitled draft' };
        if (!projectData.project_name) {
          setProjectData(ensuredData);
        }
        // saveProjectMutation.onSuccess handles setSelectedProjectId + setIsNewProject —
        // do not duplicate those writes here, that's the race C5/C6 in the audit.
        const result = await saveProjectMutation.mutateAsync(ensuredData);
        await createTapeRunMutation.mutateAsync({
          ...runData,
          project_id: result.id,
          order: nextOrder
        });
      } else {
        await createTapeRunMutation.mutateAsync({
          ...runData,
          project_id: selectedProjectId,
          order: nextOrder
        });
      }
    } catch (error) {
      toast.error(error?.message || 'Failed to add tape run');
    }
  };

  const handleDuplicateTapeRun = async (run) => {
    if (!selectedProjectId) {
      toast.error('Save the project before duplicating runs');
      return;
    }
    setIsDirty(true);
    const insertAfterOrder = run.order ?? 0;
    // Bump every run with order > insertAfterOrder so the dup sits directly after.
    const toBump = tapeRuns.filter(r => (r.order ?? 0) > insertAfterOrder);
    try {
      await Promise.all(
        toBump.map(r => base44.entities.TapeRun.update(r.id, { order: (r.order ?? 0) + 1 }))
      );
      await createTapeRunMutation.mutateAsync({
        run_name: run.run_name,
        length_feet: run.length_feet,
        tape_output: run.tape_output,
        product_type: run.product_type,
        location: run.location,
        cct: run.cct,
        channel_type: run.channel_type,
        lens: run.lens,
        finish: run.finish,
        notes: run.notes,
        driver_group: run.driver_group,
        project_id: selectedProjectId,
        order: insertAfterOrder + 1,
      });
      toast.success('Tape run duplicated');
    } catch (error) {
      toast.error(error?.message || 'Failed to duplicate run');
    }
  };


  const handleDeleteProject = () => {
    if (selectedProjectId) setDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = () => {
    if (selectedProjectId) deleteProjectMutation.mutate(selectedProjectId);
    setDeleteConfirmOpen(false);
  };

  const performSubmit = async (driversOverride) => {
    try {
      await saveProjectMutation.mutateAsync({
        ...projectData,
        ...(driversOverride ? { drivers: driversOverride } : {}),
        status: 'submitted'
      });
    } catch (error) {
      toast.error(error?.message || 'Failed to submit project');
    }
  };

  const handleSubmitProject = async () => {
    if (!isValidCity(projectData.city)) {
      toast.error('City must start with a letter (letters, spaces, hyphens, apostrophes, periods only)');
      return;
    }
    const emptyDrivers = (projectData.drivers || []).filter(d => !tapeRuns.some(r => r.driver_group === d.name));
    if (emptyDrivers.length > 0) {
      setEmptyDriversPrompt(emptyDrivers);
      return;
    }
    await performSubmit();
  };

  const handleExportPDF = async () => {
    if (!selectedProjectId) {
      toast.error('Please save the project first');
      return;
    }
    
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportProjectPDF', {
        project_id: selectedProjectId
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'project'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('PDF exported');
    } catch (error) {
      toast.error(error?.message || 'Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedProjectId) {
      toast.error('Please save the project first');
      return;
    }
    
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportProjectCSV', {
        project_id: selectedProjectId
      });
      
      // response.data is the CSV text string
      const csvData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'project'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('CSV exported');
    } catch (error) {
      toast.error(error?.message || 'Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const DETAIL_FIELDS = ['project_name','sector','street','city','state','customer_name','customer_email','customer_phone'];
  const detailsComplete = DETAIL_FIELDS.every(f => projectData[f]?.toString().trim());
  const hasAnyDetailData = DETAIL_FIELDS.some(f => projectData[f]?.toString().trim());
  // A project counts as saved the moment it has an id and we're not in
  // new-project mode. (Used to depend on the projects-list refetch result,
  // which introduced a race window where the header wouldn't collapse after
  // the first save.)
  const detailsSaved = !isNewProject && !!selectedProjectId;
  const showConfigurator = detailsComplete && detailsSaved;
  const saveActive = isDirty && hasAnyDetailData;
  // Brief window between mount and the projects-list resolving: we know there's
  // a project to load but haven't hydrated it yet. Treat the header as
  // collapsed during this window to avoid a flash of the expanded form.
  const isHydrating =
    !!selectedProjectId && !isNewProject && projectData.id !== selectedProjectId;
  // Sticky edit mode: when the details form auto-opens (because details are
  // incomplete), commit editingDetails=true. Otherwise typing the last empty
  // field flips showConfigurator → true → form collapses mid-keystroke.
  useEffect(() => {
    if (!isHydrating && !showConfigurator && !editingDetails) {
      setEditingDetails(true);
    }
  }, [isHydrating, showConfigurator, editingDetails]);
  // Live order total — updates as tape runs / drivers change. Shown in the
  // DetailsHeader so reps see price change as they configure.
  const orderTotal = useMemo(
    () => calculateTotalPrice(tapeRuns, projectData.drivers || []),
    [tapeRuns, projectData.drivers]
  );

  return (
    <PortalShell>
    <TooltipProvider>
      <div className="flex-1 flex gap-[15px] px-[15px] pt-[92px] pb-8 min-h-0 overflow-hidden">
      {/* Main Content + optional right rail */}
      <div className="flex-1 overflow-y-auto flex gap-[15px] min-w-0">
        {/* Configurator — visits without a ?project param auto-enter new-project
            mode (see the effect above), so this branch is effectively always
            taken once auth + initial state settle. */}
        {(selectedProjectId || isNewProject) && (
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div ref={middleColumnRef} className="space-y-[15px]">
            {/* Collapsible details header — Option A from the polish plan. */}
            <DetailsHeader
              project={projectData}
              isNewProject={isNewProject}
              expanded={!isHydrating && (editingDetails || !showConfigurator)}
              detailsFormRef={detailsFormRef}
              onExpand={() => setEditingDetails(true)}
              onCollapse={() => { if (showConfigurator) setEditingDetails(false); }}
              onChange={(next) => { setProjectData(next); setIsDirty(true); }}
              saveActive={saveActive}
              isExporting={isExporting}
              orderTotal={orderTotal}
              onSave={handleSaveProject}
              onSubmit={handleSubmitProject}
              onDelete={handleDeleteProject}
              onExportPDF={handleExportPDF}
              onExportCSV={handleExportCSV}
            />

            <Card
              className="relative rounded-[10px] border border-border shadow-none bg-white"
            >
              <CardContent className="p-0">
                <TapeRunList
                  key={selectedProjectId || `new-${formResetKey}`}
                  runs={tapeRuns}
                  drivers={projectData.drivers || []}
                  onDriversChange={handleDriversChange}
                  onAdd={(data) => { setIsDirty(true); return handleAddTapeRun(data); }}
                  onDuplicate={handleDuplicateTapeRun}
                  onUpdate={(id, data, options = {}) => { setIsDirty(true); updateTapeRunMutation.mutate({ id, data, silent: options.silent }); }}
                  onDelete={(id) => { setIsDirty(true); deleteTapeRunMutation.mutate(id); }}
                  onReorder={(...args) => { setIsDirty(true); handleReorderRuns(...args); }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </div>
      {/* Right rail: Materials + Summary + Shipping. Always rendered so the
          middle column's width stays constant — the rail's empty state
          ("Add runs for breakdown") sits there until the rep adds tape runs. */}
      <div className="hidden md:flex flex-col w-72 lg:w-80 min-h-0 overflow-y-auto shrink-0">
        <MaterialsCalculator
          runs={tapeRuns}
          drivers={projectData.drivers || []}
          emptyStateHeight={middleColumnHeight}
        />
      </div>
      </div>
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project and all its tape runs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="project-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProject} data-testid="project-delete-confirm">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={emptyDriversPrompt != null} onOpenChange={(open) => !open && setEmptyDriversPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {emptyDriversPrompt?.length} driver{emptyDriversPrompt?.length === 1 ? '' : 's'} with no runs
            </AlertDialogTitle>
            <AlertDialogDescription>
              {emptyDriversPrompt?.map(d => d.name).join(', ')} {emptyDriversPrompt?.length === 1 ? 'has' : 'have'} no tape runs assigned. Remove {emptyDriversPrompt?.length === 1 ? 'it' : 'them'} before submitting, or keep and submit anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="empty-drivers-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="empty-drivers-keep"
              onClick={() => { const prompt = emptyDriversPrompt; setEmptyDriversPrompt(null); if (prompt) performSubmit(); }}
            >
              Keep & Submit
            </AlertDialogAction>
            <AlertDialogAction
              data-testid="empty-drivers-remove"
              onClick={() => {
                const prompt = emptyDriversPrompt;
                setEmptyDriversPrompt(null);
                if (!prompt) return;
                const emptyNames = new Set(prompt.map(d => d.name));
                const cleaned = (projectData.drivers || []).filter(d => !emptyNames.has(d.name));
                setProjectData(prev => ({ ...prev, drivers: cleaned }));
                performSubmit(cleaned);
              }}
            >
              Remove & Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
    </PortalShell>
  );
}

/**
 * Configurator's project-details header. Two visual modes:
 *   - collapsed strip: one-line summary (name · customer · status) + actions
 *   - expanded: full ProjectForm + same actions
 * Tapping the strip expands; an explicit Close button collapses (only when
 * showConfigurator is true — i.e., all required fields are saved).
 */
function DetailsHeader({
  project,
  isNewProject,
  expanded,
  detailsFormRef,
  onExpand,
  onCollapse,
  onChange,
  saveActive,
  isExporting,
  orderTotal,
  onSave,
  onSubmit,
  onDelete,
  onExportPDF,
  onExportCSV,
}) {
  const customerLine =
    project.customer_name && project.customer_name !== '—' ? project.customer_name : null;
  const statusKey = project.status || 'draft';
  const showActions =
    !isNewProject ||
    project.project_name ||
    project.customer_name ||
    project.customer_email ||
    project.customer_phone ||
    project.notes;

  const formattedTotal =
    typeof orderTotal === 'number' && orderTotal > 0
      ? `$${orderTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : null;

  const summaryLine = (
    <div className="min-w-0 flex-1 flex items-center gap-3">
      <span className="font-semibold text-foreground truncate">
        {isNewProject ? 'New project' : project.project_name || 'Untitled'}
      </span>
      {customerLine && (
        <span className="text-sm text-foreground/60 truncate">{customerLine}</span>
      )}
      {formattedTotal && (
        <span className="text-sm font-semibold text-foreground tabular-nums whitespace-nowrap" aria-label={`Order total ${formattedTotal}`}>
          {formattedTotal}
        </span>
      )}
    </div>
  );

  const statusPill = (
    <span
      className={`inline-flex items-center px-2 h-5 rounded-[3px] text-[10px] font-medium uppercase tracking-wider flex-shrink-0 ${
        STATUS_STYLE[statusKey] || STATUS_STYLE.draft
      }`}
    >
      {statusLabel(statusKey)}
    </span>
  );

  return (
    <Card className="overflow-hidden rounded-[10px] border border-border shadow-none bg-white">
      <div className="flex items-center gap-3 px-6 py-3 min-h-9">
        {expanded ? (
          <>
            {summaryLine}
            {statusPill}
          </>
        ) : (
          <button
            type="button"
            onClick={onExpand}
            className="flex-1 min-w-0 flex items-center gap-3 text-left -mx-2 px-2 py-1 rounded-[3px] hover:bg-foreground/[0.03] transition-colors group"
            data-testid="project-details-strip"
            aria-label="Edit project details"
          >
            {summaryLine}
            {statusPill}
            <Pencil
              className="h-3.5 w-3.5 text-foreground/40 group-hover:text-foreground/70 transition-colors flex-shrink-0"
              aria-hidden="true"
            />
          </button>
        )}

        {showActions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isNewProject && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    data-testid="project-more"
                    className="h-9 w-9"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={isExporting}
                    onClick={onExportPDF}
                    data-testid="project-export-pdf"
                  >
                    <Download className="h-3.5 w-3.5 mr-2 opacity-70" aria-hidden="true" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isExporting}
                    onClick={onExportCSV}
                    data-testid="project-export-csv"
                  >
                    <Download className="h-3.5 w-3.5 mr-2 opacity-70" aria-hidden="true" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={onDelete}
                    className="text-destructive focus:text-destructive"
                    data-testid="project-delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2 opacity-70" aria-hidden="true" />
                    Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSubmit}
              data-testid="project-submit"
              className="h-9 gap-1.5"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Submit
            </Button>
            <Button
              variant={saveActive ? 'default' : 'outline'}
              size="sm"
              onClick={onSave}
              data-testid="project-save"
              className="h-9 gap-1.5"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              Save
            </Button>
            {expanded && !isNewProject && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCollapse}
                aria-label="Close details"
                className="h-9 w-9 p-0"
                title="Collapse details"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div ref={detailsFormRef} className="border-t border-border px-6 py-6">
          <ProjectForm project={project} onChange={onChange} />
        </div>
      )}
    </Card>
  );
}