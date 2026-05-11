import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Trash2, Send, Download, Plus, Search } from "lucide-react";
import { calculateTotalPrice } from "@/components/calculator/calculations";
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

import ProjectsList from "../components/calculator/ProjectsList";
import ProjectForm from "../components/calculator/ProjectForm";
import TapeRunList from "../components/calculator/TapeRunList";
import MaterialsCalculator from "../components/calculator/MaterialsCalculator";

const DEFAULT_DRIVER = { name: 'Driver 1', max_watts: 96 };

export default function Calculator() {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ status: 'all', dateFrom: null, dateTo: null });
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [hideExportTooltip, setHideExportTooltip] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [projectData, setProjectData] = useState({
    project_name: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    street: '',
    city: '',
    state: '',
    notes: '',
    status: 'draft'
  });
  const [isNewProject, setIsNewProject] = useState(true);
  const [formResetKey, setFormResetKey] = useState(0);

  const queryClient = useQueryClient();

  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  // Fetch tape runs for selected project — ordered by created_date ascending
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ['tapeRuns', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      return base44.entities.TapeRun.filter({ project_id: selectedProjectId }, 'created_date');
    },
    enabled: !!selectedProjectId,
  });

  // Fetch drivers for selected project
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      return base44.entities.Driver.filter({ project_id: selectedProjectId }, 'created_date');
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
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectData(result);
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
        // Create a default driver for the new project
        await base44.entities.Driver.create({ project_id: result.id, ...DEFAULT_DRIVER });
        queryClient.invalidateQueries({ queryKey: ['drivers', result.id] });
      }
      toast.success('Project saved successfully');
    },
    onError: () => {
      toast.error('Failed to save project');
    },
  });

  // Create tape run mutation
   const createTapeRunMutation = useMutation({
     mutationFn: (runData) => base44.entities.TapeRun.create(runData),
     onSuccess: async () => {
       await queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
       toast.success('Tape run added');
     },
     onError: () => {
       toast.error('Failed to add tape run');
     },
   });

  // Update tape run mutation
   const updateTapeRunMutation = useMutation({
     mutationFn: ({ id, data }) => base44.entities.TapeRun.update(id, data),
     onSuccess: async () => {
       await queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
       toast.success('Tape run updated');
     },
     onError: () => {
       toast.error('Failed to update tape run');
     },
   });

   // Delete tape run mutation
   const deleteTapeRunMutation = useMutation({
     mutationFn: (runId) => base44.entities.TapeRun.delete(runId),
     onSuccess: async () => {
       await queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
       toast.success('Tape run deleted');
     },
     onError: () => {
       toast.error('Failed to delete tape run');
     },
   });

  // Reorder tape runs — now just optimistic local reorder, no DB writes
  const handleReorderRuns = (reorderedRuns) => {
    queryClient.setQueryData(['tapeRuns', selectedProjectId], reorderedRuns);
  };

  // Driver mutations
  const handleDriversChange = async (newDrivers) => {
    if (!selectedProjectId) return;

    const existing = drivers;
    const toDelete = existing.filter(d => !newDrivers.find(nd => nd.id === d.id));
    const toCreate = newDrivers.filter(nd => !nd.id || !existing.find(d => d.id === nd.id));
    const toUpdate = newDrivers.filter(nd => nd.id && existing.find(d => d.id === nd.id));

    await Promise.all([
      ...toDelete.map(d => base44.entities.Driver.delete(d.id)),
      ...toCreate.map(d => base44.entities.Driver.create({ project_id: selectedProjectId, name: d.name, max_watts: d.max_watts ?? 96 })),
      ...toUpdate.map(d => base44.entities.Driver.update(d.id, { name: d.name, max_watts: d.max_watts })),
    ]);
    queryClient.invalidateQueries({ queryKey: ['drivers', selectedProjectId] });
  };

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleNewProject();
      toast.success('Project deleted');
    },
    onError: () => {
      toast.error('Failed to delete project');
    },
  });

  // Load selected project
  useEffect(() => {
    if (selectedProjectId && !isNewProject) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        setProjectData(project);
      }
    }
  }, [selectedProjectId, projects, isNewProject]);

  const handleNewProject = () => {
    setIsNewProject(true);
    setSelectedProjectId(null);
    setProjectData({
      project_name: '',
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      street: '',
      city: '',
      state: '',
      notes: '',
      status: 'draft'
    });
    setFormResetKey(prev => prev + 1);
  };

  const handleSelectProject = (projectId) => {
    navigate(`/project/${projectId}`);
  };

  const generateQuoteNumber = async () => {
    const recentProjects = await base44.entities.Project.list('-created_date', 100);
    const existingNumbers = recentProjects
      .map(p => p.quote_number)
      .filter(qn => qn && qn.startsWith('QUOTE-'))
      .map(qn => parseInt(qn.replace('QUOTE-', '')))
      .filter(n => !isNaN(n));
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    return `QUOTE-${String(nextNumber).padStart(3, '0')}`;
  };

  const handleSaveProject = async () => {
    if (!projectData.project_name || !projectData.customer_name) {
      toast.error('Please fill in required fields');
      return;
    }
    await saveProjectMutation.mutateAsync({ ...projectData });
  };

  const handleAddTapeRun = async (runData) => {
    if (!selectedProjectId && isNewProject) {
      if (!projectData.project_name || !projectData.customer_name) {
        toast.error('Please save project details first');
        return;
      }
      const result = await saveProjectMutation.mutateAsync({ ...projectData });
      await createTapeRunMutation.mutateAsync({ ...runData, project_id: result.id });
    } else {
      await createTapeRunMutation.mutateAsync({ ...runData, project_id: selectedProjectId });
    }
  };

  const handleDeleteProject = () => {
    if (selectedProjectId) {
      deleteProjectMutation.mutate(selectedProjectId);
    }
  };

  const handleUpdateStatus = async (projectId, newStatus) => {
    const updateData = { status: newStatus };
    if (newStatus === 'approved') {
      const project = projects.find(p => p.id === projectId);
      if (!project.quote_number) {
        updateData.quote_number = await generateQuoteNumber();
      }
    }
    await base44.entities.Project.update(projectId, updateData);
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast.success(`Project ${newStatus === 'approved' ? 'approved' : 'reverted to ' + newStatus}`);
  };

  const handleSubmitProject = async () => {
    await saveProjectMutation.mutateAsync({ ...projectData, status: 'submitted' });
  };

  const handleExportPDF = async () => {
    if (!selectedProjectId) { toast.error('Please save the project first'); return; }
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportProjectPDF', { project_id: selectedProjectId });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'project'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('PDF exported successfully');
    } catch {
      toast.error('Failed to export PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = async () => {
    if (!selectedProjectId) { toast.error('Please save the project first'); return; }
    setIsExporting(true);
    try {
      const response = await base44.functions.invoke('exportProjectCSV', { project_id: selectedProjectId });
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
      toast.success('CSV exported successfully');
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setIsExporting(false);
    }
  };

  // Computed total price — derived from runs, never stored
  const computedTotalPrice = calculateTotalPrice(tapeRuns);

  return (
    <TooltipProvider>
      <div className="h-screen flex gap-0 bg-white">
      {/* Sidebar - Projects List */}
      <div className="hidden md:flex flex-col py-6 w-64 lg:w-80 px-4 lg:px-6">
        <Card className="h-full flex flex-col overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <img src="https://media.base44.com/images/public/698fc81203f85a20f281d9dc/badc89fb6_Alkimi_logo_long_black.png" alt="Alkimi Logo" className="h-8 w-auto -ml-6" />
          </CardHeader>
          <CardContent className="flex-1 px-2 pb-6 pt-0 overflow-y-auto">
            <ProjectsList
              projects={projects.filter(p => {
                const matchesSearch = p.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  p.customer_name.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesStatus = filters.status === 'all' || p.status === filters.status;
                const matchesDateFrom = !filters.dateFrom || new Date(p.created_date) >= filters.dateFrom;
                const matchesDateTo = !filters.dateTo || new Date(p.created_date) <= filters.dateTo;
                return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
              })}
              selectedId={selectedProjectId}
              onSelect={handleSelectProject}
              onNew={handleNewProject}
              isLoading={projectsLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onUpdateStatus={handleUpdateStatus}
              filters={filters}
              onFiltersChange={setFilters}
              computedTotals={{ [selectedProjectId]: computedTotalPrice }}
              tapeRuns={tapeRuns}
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto flex gap-0">
        {/* Center - Configurator */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="space-y-4 md:space-y-6 p-4 md:py-6">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold break-words" style={{ color: '#252320' }}>
                  {isNewProject ? 'New Project' : (projectData.project_name?.length > 50 ? projectData.project_name.substring(0, 50) + '...' : projectData.project_name)}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {isNewProject ? 'Configure a new tape light quote' : projectData.customer_name}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {(!isNewProject || projectData.project_name || projectData.customer_name || projectData.customer_email || projectData.customer_phone || projectData.notes) && (
                  <>
                    {!isNewProject && (
                     <>
                        <DropdownMenu open={exportDropdownOpen} onOpenChange={setExportDropdownOpen}>
                          <Tooltip open={exportDropdownOpen || hideExportTooltip ? false : undefined}>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" disabled={isExporting}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Export</TooltipContent>
                          </Tooltip>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => { 
                              handleExportPDF(); 
                              setExportDropdownOpen(false);
                              setHideExportTooltip(true);
                              setTimeout(() => setHideExportTooltip(false), 500);
                            }}>
                              Export as PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { 
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
                            <Button variant="outline" size="icon" onClick={handleDeleteProject}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                     </>
                    )}
                    <Tooltip>
                       <TooltipTrigger asChild>
                         <Button variant="outline" size="icon" onClick={handleSubmitProject}>
                           <Send className="h-4 w-4" />
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>Submit</TooltipContent>
                     </Tooltip>
                     <Tooltip>
                       <TooltipTrigger asChild>
                         <Button size="icon" onClick={handleSaveProject}>
                           <Save className="h-4 w-4" />
                         </Button>
                       </TooltipTrigger>
                       <TooltipContent>Save</TooltipContent>
                     </Tooltip>
                  </>
                )}
              </div>
            </div>

            <Card>
              <CardContent>
                <ProjectForm
                  project={projectData}
                  onChange={setProjectData}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <TapeRunList
                 key={selectedProjectId || `new-${formResetKey}`}
                 runs={tapeRuns}
                 drivers={drivers}
                 onDriversChange={handleDriversChange}
                 onAdd={handleAddTapeRun}
                 onUpdate={(id, data) => updateTapeRunMutation.mutate({ id, data })}
                 onDelete={(id) => deleteTapeRunMutation.mutate(id)}
                 onReorder={handleReorderRuns}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column - Materials & Quote */}
        <div className="hidden md:flex flex-col py-6 w-64 lg:w-80 px-4 lg:px-6 shrink-0">
          <div className="sticky top-6">
            <MaterialsCalculator runs={tapeRuns} />
          </div>
        </div>
      </div>
      </div>
    </TooltipProvider>
  );
}