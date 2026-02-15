import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Download, Trash2, ChevronDown, FileText } from "lucide-react";
import { toast } from "sonner";

import ProjectsList from "../components/calculator/ProjectsList";
import ProjectForm from "../components/calculator/ProjectForm";
import TapeRunList from "../components/calculator/TapeRunList";
import MaterialsCalculator from "../components/calculator/MaterialsCalculator";

export default function Calculator() {
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [projectData, setProjectData] = useState({
    project_name: '',
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    notes: '',
    status: 'draft'
  });
  const [isNewProject, setIsNewProject] = useState(true);
  const [detailsExpanded, setDetailsExpanded] = useState(true);

  const queryClient = useQueryClient();

  // Fetch all projects
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-updated_date'),
  });

  // Fetch tape runs for selected project
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ['tapeRuns', selectedProjectId],
    queryFn: () => selectedProjectId ? base44.entities.TapeRun.filter({ project_id: selectedProjectId }) : [],
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
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
      }
      toast.success('Project saved successfully');
    },
  });

  // Create tape run mutation
  const createTapeRunMutation = useMutation({
    mutationFn: (runData) => base44.entities.TapeRun.create(runData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run added');
    },
  });

  // Delete tape run mutation
  const deleteTapeRunMutation = useMutation({
    mutationFn: (runId) => base44.entities.TapeRun.delete(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run deleted');
    },
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
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
        project_id: result.id
      });
    } else {
      await createTapeRunMutation.mutateAsync({
        ...runData,
        project_id: selectedProjectId
      });
    }
  };

  const calculateTotalPrice = (runs) => {
    const TAPE_SPECS = {
      standard_white: { price_per_foot: 12 },
      standard_warm: { price_per_foot: 12 },
      rgb: { price_per_foot: 18 },
      rgbw: { price_per_foot: 24 },
      high_output: { price_per_foot: 28 }
    };

    const CHANNEL_SPECS = {
      surface_mount: { price_per_foot: 8 },
      recessed: { price_per_foot: 12 },
      corner: { price_per_foot: 10 },
      none: { price_per_foot: 0 }
    };

    let total = 0;
    runs.forEach(run => {
      total += run.length_feet * TAPE_SPECS[run.tape_type].price_per_foot;
      total += run.length_feet * CHANNEL_SPECS[run.channel_type].price_per_foot;
    });

    // Add drivers and hardware (simplified)
    total += 85; // Base driver cost
    total += 15; // Hardware cost

    return total;
  };

  const handleExportQuote = async () => {
    try {
      const response = await base44.functions.invoke('exportQuotePDF', {
        projectData,
        runs: tapeRuns
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'quote'}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Quote exported as PDF');
    } catch (error) {
      toast.error('Failed to export quote');
    }
  };

  const handleExportSubmittal = async () => {
    try {
      const response = await base44.functions.invoke('exportSubmittalPackage', {
        projectData,
        runs: tapeRuns
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'submittal'} - Submittal Package.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Submittal package exported as PDF');
    } catch (error) {
      toast.error('Failed to export submittal package');
    }
  };

  const handleDeleteProject = () => {
    if (selectedProjectId && confirm('Are you sure you want to delete this project?')) {
      deleteProjectMutation.mutate(selectedProjectId);
    }
  };

  return (
    <div className="h-screen flex bg-slate-50">
      {/* Sidebar - Projects List */}
      <div className="w-80 border-r bg-white">
        <div className="h-full flex flex-col">
          <div className="pt-4 pr-4 pb-4 border-b">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/f2bc037c5_Screenshot2026-02-14160229.png" 
              alt="ALKIMI Logo"
              className="h-12 mb-3 w-full object-cover object-left"
              style={{ filter: 'invert(1)' }}
            />
            <p className="text-xs text-slate-500 pl-4">Project Quotes</p>
          </div>
          <ProjectsList
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={handleSelectProject}
            onNew={handleNewProject}
            isLoading={projectsLoading}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-6">
          {/* Header Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <h2 className="text-2xl font-bold text-slate-900">
                {isNewProject ? 'New Project' : projectData.project_name}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {isNewProject ? 'Create a new tape light quote' : 'Edit project details and runs'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {!isNewProject && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportQuote} className="flex-1 h-8 justify-center text-xs">
                    <Download className="h-3 w-3 mr-1" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportSubmittal} className="flex-1 h-8 justify-center text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    Submittal
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeleteProject} className="flex-1 h-8 justify-center text-xs">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              )}
              <Button size="sm" onClick={handleSaveProject} style={{ backgroundColor: '#e9ff64', color: '#000' }} className="hover:opacity-90 text-xs h-10 w-full px-16">
                <Save className="h-3 w-3 mr-1" />
                Save Project
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column - Project Details */}
            <div className="lg:col-span-3 space-y-6">
              <Card>
                <CardHeader className="cursor-pointer" onClick={() => setDetailsExpanded(!detailsExpanded)}>
                  <div className="flex items-center justify-between">
                    <CardTitle>Project Details</CardTitle>
                    <ChevronDown className={`h-5 w-5 transition-transform ${detailsExpanded ? 'rotate-0' : '-rotate-90'}`} />
                  </div>
                </CardHeader>
                {detailsExpanded && (
                  <CardContent>
                    <ProjectForm
                      project={projectData}
                      onChange={setProjectData}
                    />
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>ALKILINE</CardTitle>
                </CardHeader>
                <CardContent>
                  <TapeRunList
                    runs={tapeRuns}
                    onAdd={handleAddTapeRun}
                    onUpdate={() => {}}
                    onDelete={(id) => deleteTapeRunMutation.mutate(id)}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Materials & Quote */}
            <div className="lg:col-span-1">
              <div className="sticky top-6">
                <MaterialsCalculator runs={tapeRuns} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}