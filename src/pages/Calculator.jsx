import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Save, Trash2, Send, Download, ArrowLeft } from "lucide-react";
import PortalShell from "@/components/PortalShell";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  const navigate = useNavigate();
  const selectedProjectId = searchParams.get('project') || null;
  const setSelectedProjectId = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('project', id); else next.delete('project');
    setSearchParams(next, { replace: true });
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [hideExportTooltip, setHideExportTooltip] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [projectData, setProjectData] = useState({ ...EMPTY_PROJECT_DATA });
  const [isNewProject, setIsNewProject] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [editingDetails, setEditingDetails] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [emptyDriversPrompt, setEmptyDriversPrompt] = useState(null);
  const detailsFormRef = useRef(null);

  useEffect(() => {
    if (!editingDetails) return;
    const handler = (e) => {
      if (e.target.closest?.('[data-testid="project-edit-details"]')) return;
      if (detailsFormRef.current && !detailsFormRef.current.contains(e.target)) {
        const allFilled = ['project_name','sector','street','city','state','customer_name','customer_email','customer_phone']
          .every(f => projectData[f]?.toString().trim());
        if (allFilled) setEditingDetails(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingDetails, projectData]);

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
      // For new projects, attach the id so subsequent saves go to update path,
      // but do NOT overwrite projectData — that would clobber in-flight user edits.
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
      }
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

  // Load selected project on id change only.
  // Intentionally excluding `projects` from deps so a background refetch of the
  // list doesn't clobber the form while the user is editing.
  useEffect(() => {
    if (selectedProjectId && !isNewProject) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        setProjectData(project);
        setIsDirty(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleSelectProject = (projectId) => {
    setSelectedProjectId(projectId);
    setIsNewProject(false);
    setEditingDetails(false);
  };

  const handleEditDetails = (projectId) => {
    const sameProject = selectedProjectId === projectId;
    setSelectedProjectId(projectId);
    setIsNewProject(false);
    if (sameProject && editingDetails) {
      const allFilled = ['project_name','sector','street','city','state','customer_name','customer_email','customer_phone']
        .every(f => projectData[f]?.toString().trim());
      if (allFilled) {
        setEditingDetails(false);
        return;
      }
    }
    setEditingDetails(true);
  };

  const generateQuoteNumber = async () => {
    const recentProjects = await base44.entities.Project.list('-created_date', 100);
    const existingNumbers = recentProjects
      .map(p => p.quote_number)
      .filter(qn => qn && qn.startsWith('QUOTE-'))
      .map(qn => parseInt(qn.replace('QUOTE-', ''), 10))
      .filter(n => !isNaN(n));
    
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `QUOTE-${String(nextNumber).padStart(3, '0')}`;
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
        if (!projectData.project_name) {
          toast.error('Please give the project a name before adding runs');
          return;
        }
        // saveProjectMutation.onSuccess handles setSelectedProjectId + setIsNewProject —
        // do not duplicate those writes here, that's the race C5/C6 in the audit.
        const result = await saveProjectMutation.mutateAsync(projectData);
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


  const handleDeleteProject = () => {
    if (selectedProjectId) setDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = () => {
    if (selectedProjectId) deleteProjectMutation.mutate(selectedProjectId);
    setDeleteConfirmOpen(false);
  };

  const handleUpdateStatus = async (projectId, newStatus) => {
    try {
      const updateData = { status: newStatus };
      
      // Generate quote number when project is approved. Guard the lookup —
      // `projects` is React Query cache and may be stale or empty.
      if (newStatus === 'approved') {
        const project = projects.find(p => p.id === projectId);
        if (project && !project.quote_number) {
          updateData.quote_number = await generateQuoteNumber();
        }
      }
      
      await base44.entities.Project.update(projectId, updateData);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success(`Project ${newStatus === 'approved' ? 'approved' : 'reverted to ' + newStatus}`);
    } catch (error) {
      toast.error(error?.message || 'Failed to update project status');
    }
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
  const savedProject = projectData.id ? projects.find(p => p.id === projectData.id) : null;
  const detailsSaved = !!savedProject && DETAIL_FIELDS.every(f => savedProject[f]?.toString().trim());
  const showConfigurator = detailsComplete && detailsSaved;
  const saveActive = isDirty && hasAnyDetailData;

  return (
    <PortalShell>
    <TooltipProvider>
      <div className="flex-1 flex gap-4 md:gap-6 px-[15px] pt-6 pb-8 min-h-0 overflow-hidden">
      {/* Main Content + optional right rail */}
      <div className="flex-1 overflow-y-auto flex gap-4 md:gap-6 min-w-0">
        {/* Empty state — looping brand video + start CTA */}
        {!(selectedProjectId || isNewProject) && (
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center overflow-hidden gap-6">
            <video
              src="/empty-state.mov"
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              data-testid="empty-state-video"
              className="max-h-[60%] max-w-[60%] object-contain mix-blend-multiply"
              style={{ filter: 'contrast(1.25) brightness(1.08)' }}
            />
            <div className="flex flex-col items-center gap-3">
              <Button
                size="lg"
                onClick={() => {
                  setSelectedProjectId(null);
                  setProjectData({ ...EMPTY_PROJECT_DATA });
                  setFormResetKey((prev) => prev + 1);
                  setIsNewProject(true);
                }}
                data-testid="empty-state-new"
                className="gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Start new project
              </Button>
              <button
                type="button"
                onClick={() => navigate('/estimates')}
                className="text-xs text-foreground/50 hover:text-foreground underline underline-offset-2"
              >
                or browse estimates
              </button>
            </div>
          </div>
        )}
        {/* Configurator — only renders when a project is selected or being created */}
        {(selectedProjectId || isNewProject) && (
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="space-y-3">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold break-words text-foreground line-clamp-1">
                  {isNewProject ? 'New Project' : projectData.project_name}
                </h2>
                <p className="text-sm text-foreground/60 mt-1 min-h-[1.25rem]">
                  {isNewProject ? 'Configure a new tape light quote' : (projectData.customer_name && projectData.customer_name !== '—' ? projectData.customer_name : ' ')}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {(!isNewProject || projectData.project_name || projectData.customer_name || projectData.customer_email || projectData.customer_phone || projectData.notes) && (
                  <>
                    {!isNewProject && (
                     <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => navigate('/estimates')} aria-label="Return to dashboard" data-testid="project-back">
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Dashboard</TooltipContent>
                        </Tooltip>
                        <DropdownMenu open={exportDropdownOpen} onOpenChange={setExportDropdownOpen}>
                          <Tooltip open={exportDropdownOpen || hideExportTooltip ? false : undefined}>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" disabled={isExporting} aria-label="Export project" data-testid="project-export">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Export</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent>
                            <DropdownMenuItem data-testid="project-export-pdf" onClick={() => {
                              handleExportPDF();
                              setExportDropdownOpen(false);
                              setHideExportTooltip(true);
                              setTimeout(() => setHideExportTooltip(false), 500);
                            }}>
                              Export as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid="project-export-csv" onClick={() => {
                              handleExportCSV();
                              setExportDropdownOpen(false);
                              setHideExportTooltip(true);
                              setTimeout(() => setHideExportTooltip(false), 500);
                            }}>
                              Export as CSV
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={handleDeleteProject} aria-label="Delete project" data-testid="project-delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                     </>
                    )}
                    <Tooltip>
                       <TooltipTrigger asChild>
                         <Button variant="outline" size="icon" onClick={handleSubmitProject} aria-label="Submit project" data-testid="project-submit">
                           <Send className="h-4 w-4" />
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>Submit</TooltipContent>
                     </Tooltip>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <Button variant={saveActive ? 'default' : 'outline'} size="icon" onClick={handleSaveProject} aria-label="Save project" data-testid="project-save">
                           <Save className="h-4 w-4" />
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>Save</TooltipContent>
                     </Tooltip>
                  </>
                )}
              </div>
            </div>

            {(editingDetails || !showConfigurator) && (
              <Card ref={detailsFormRef}>
                <CardContent className="p-6">
                  <ProjectForm project={projectData} onChange={(next) => { setProjectData(next); setIsDirty(true); }} />
                </CardContent>
              </Card>
            )}

            {(selectedProjectId || isNewProject) && (
              <Card
                className={`relative ${editingDetails ? 'locked-monochrome pointer-events-none select-none' : ''}`}
                aria-disabled={editingDetails || undefined}
              >
                {editingDetails && (
                  <div className="absolute inset-0 z-10 rounded-xl bg-background/60" aria-hidden="true" />
                )}
                <CardContent className="p-6">
                  <TapeRunList
                   key={selectedProjectId || `new-${formResetKey}`}
                   runs={tapeRuns}
                   drivers={projectData.drivers || []}
                   onDriversChange={handleDriversChange}
                   onAdd={(data) => { setIsDirty(true); return handleAddTapeRun(data); }}
                   onUpdate={(id, data, options = {}) => { setIsDirty(true); updateTapeRunMutation.mutate({ id, data, silent: options.silent }); }}
                   onDelete={(id) => { setIsDirty(true); deleteTapeRunMutation.mutate(id); }}
                   onReorder={(...args) => { setIsDirty(true); handleReorderRuns(...args); }}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        )}
      </div>
      {/* Right rail: Materials + Summary + Shipping. Visible whenever the rep
          is in a project context and not editing details — including new
          projects, so prototyping tape runs shows live material/cost feedback. */}
      {(selectedProjectId || isNewProject) && !editingDetails && (
        <div className="hidden md:flex flex-col w-60 lg:w-64 min-h-0 overflow-y-auto shrink-0">
          <MaterialsCalculator runs={tapeRuns} drivers={projectData.drivers || []} />
        </div>
      )}
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