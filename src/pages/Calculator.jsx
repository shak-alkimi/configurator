import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Download, Trash2, FileText, FileDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";


import ProjectsList from "../components/calculator/ProjectsList";
import ProjectForm from "../components/calculator/ProjectForm";
import TapeRunList from "../components/calculator/TapeRunList";
import MaterialsCalculator from "../components/calculator/MaterialsCalculator";

export default function Calculator() {
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [projectData, setProjectData] = useState({
    project_name: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    notes: '',
    status: 'draft'
  });
  const [isNewProject, setIsNewProject] = useState(true);

  const queryClient = useQueryClient();

  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date', undefined, undefined, undefined, 'dev'),
  });

  // Fetch tape runs for selected project
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ['tapeRuns', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return [];
      const runs = await base44.entities.TapeRun.filter({ project_id: selectedProjectId }, undefined, undefined, undefined, 'dev');
      return runs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    },
    enabled: !!selectedProjectId,
  });

  // Create/Update project mutation
  const saveProjectMutation = useMutation({
    mutationFn: async (data) => {
      if (isNewProject) {
        return await base44.entities.Project.create(data, 'dev');
      } else {
        return await base44.entities.Project.update(selectedProjectId, data, 'dev');
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
      }
      toast.success('Project saved successfully');
    },
  });

  // Create tape run mutation
  const createTapeRunMutation = useMutation({
    mutationFn: (runData) => base44.entities.TapeRun.create(runData, 'dev'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run added');
    },
  });

  // Delete tape run mutation
  const deleteTapeRunMutation = useMutation({
    mutationFn: (runId) => base44.entities.TapeRun.delete(runId, 'dev'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run deleted');
    },
  });

  // Reorder tape runs mutation
  const reorderTapeRunsMutation = useMutation({
    mutationFn: async (reorderedRuns) => {
      const updates = reorderedRuns.map((run, index) =>
        base44.entities.TapeRun.update(run.id, { order: index }, undefined, undefined, 'dev')
      );
      await Promise.all(updates);
    },
    onMutate: async (newReorderedRuns) => {
      await queryClient.cancelQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      const previousTapeRuns = queryClient.getQueryData(['tapeRuns', selectedProjectId]);
      const runsWithUpdatedOrder = newReorderedRuns.map((run, index) => ({ ...run, order: index }));
      queryClient.setQueryData(['tapeRuns', selectedProjectId], runsWithUpdatedOrder);
      return { previousTapeRuns };
    },
    onError: (err, newReorderedRuns, context) => {
      queryClient.setQueryData(['tapeRuns', selectedProjectId], context.previousTapeRuns);
      toast.error('Failed to reorder');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
    },
  });

  const handleReorderRuns = (reorderedRuns) => {
    reorderTapeRunsMutation.mutate(reorderedRuns);
  };

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId, 'dev'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleNewProject();
      toast.success('Project deleted');
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
      notes: '',
      status: 'draft'
    });
  };

  const handleSelectProject = (projectId) => {
    setSelectedProjectId(projectId);
    setIsNewProject(false);
  };

  const handleSaveProject = async () => {
    if (!projectData.project_name || !projectData.customer_name) {
      toast.error('Please fill in required fields');
      return;
    }

    // Calculate total price from tape runs
    const totalPrice = calculateTotalPrice(tapeRuns);

    await saveProjectMutation.mutateAsync({
      ...projectData,
      total_price: totalPrice
    });
  };

  const handleAddTapeRun = async (runData) => {
    const nextOrder = tapeRuns.length;
    if (!selectedProjectId && isNewProject) {
      // Save project first
      if (!projectData.project_name || !projectData.customer_name) {
        toast.error('Please save project details first');
        return;
      }
      const result = await saveProjectMutation.mutateAsync(projectData);
      setSelectedProjectId(result.id);
      setIsNewProject(false);
      
      // Now add the tape run
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
  };

  const calculateTotalPrice = (runs) => {
    const TAPE_SPECS = {
      "2w": { price_per_foot: 10 },
      "4w": { price_per_foot: 12 }
    };

    const CHANNEL_SPECS = {
      surface: { price_per_foot: 8 },
      recessed: { price_per_foot: 12 },
      corner: { price_per_foot: 10 },
      none: { price_per_foot: 0 }
    };

    let total = 0;
    runs.forEach(run => {
      const tapeSpec = TAPE_SPECS[run.tape_type];
      const channelSpec = CHANNEL_SPECS[run.channel_type];
      if (tapeSpec) total += run.length_feet * tapeSpec.price_per_foot;
      if (channelSpec) total += run.length_feet * channelSpec.price_per_foot;
    });

    // Add drivers and hardware (simplified)
    total += 85; // Base driver cost
    total += 15; // Hardware cost

    return total;
  };

  const handleExportPDF = async () => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }
    
    try {
      const response = await base44.functions.invoke('exportProjectPDF', {
        project_id: selectedProjectId,
        data_env: 'dev'
      });
      
      const blob = new Blob([new Uint8Array(response.data)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectData.project_name || 'project'}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.message || 'Failed to export PDF');
    }
  };

  const handleExportCSV = async () => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }
    
    try {
      const response = await base44.functions.invoke('exportProjectCSV', {
        project_id: selectedProjectId,
        data_env: 'dev'
      });
      
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${projectData.project_name || 'project'}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('CSV downloaded');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error.message || 'Failed to export CSV');
    }
  };

  const handleSpecs = () => {
    toast.info('Specs feature coming soon');
  };

  const handleDeleteProject = () => {
    if (selectedProjectId && confirm('Are you sure you want to delete this project?')) {
      deleteProjectMutation.mutate(selectedProjectId);
    }
  };

  return (
    <div className="h-screen flex gap-0 bg-white">
      {/* Sidebar - Projects List */}
      <div className="hidden md:flex md:w-64 lg:w-80 px-4 lg:px-6 py-6 flex-col">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/363b1fdb0_Screenshot2026-02-16175106.png" alt="Alkimi Logo" className="h-10 w-auto -ml-6" />
          </CardHeader>
          <CardContent className="flex-1 px-2 pb-6 pt-0 overflow-y-auto">
            <ProjectsList
              projects={projects.filter(p => 
                p.project_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.customer_name.toLowerCase().includes(searchQuery.toLowerCase())
              )}
              selectedId={selectedProjectId}
              onSelect={handleSelectProject}
              onNew={handleNewProject}
              isLoading={projectsLoading}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto space-y-4 md:space-y-6 p-4 md:py-6 md:pr-6 md:pl-0">
          {/* Header Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
            <div className="lg:col-span-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 break-words">
                  {isNewProject ? 'New Project' : (projectData.project_name?.length > 43 ? projectData.project_name.substring(0, 43) + '...' : projectData.project_name)}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {isNewProject ? 'Create a new tape light quote' : projectData.customer_name}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap flex-shrink-0">
                {!isNewProject && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="hidden sm:flex">
                          <Download className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={handleExportCSV}>
                          <FileDown className="h-4 w-4 mr-2" />
                          Export as CSV
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportPDF}>
                          <FileDown className="h-4 w-4 mr-2" />
                          Export as PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button variant="outline" size="icon" onClick={handleSpecs} className="hidden sm:flex">
                      <FileText className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDeleteProject}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                <Button size="icon" onClick={handleSaveProject}>
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
            {/* Left Column - Project Details */}
            <div className="lg:col-span-3 space-y-4 md:space-y-6">
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
                    runs={tapeRuns}
                    onAdd={handleAddTapeRun}
                    onUpdate={() => {}}
                    onDelete={(id) => deleteTapeRunMutation.mutate(id)}
                    onReorder={handleReorderRuns}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Materials & Quote */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                <MaterialsCalculator runs={tapeRuns} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}