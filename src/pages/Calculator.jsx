import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Download, Trash2, FileText } from "lucide-react";
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
      standard_white: { watts_per_foot: 4.4, price_per_foot: 12 },
      standard_warm: { watts_per_foot: 4.4, price_per_foot: 12 },
      rgb: { watts_per_foot: 7.2, price_per_foot: 18 },
      rgbw: { watts_per_foot: 9.6, price_per_foot: 24 },
      high_output: { watts_per_foot: 18, price_per_foot: 28 }
    };

    const CHANNEL_SPECS = {
      surface_mount: { price_per_foot: 8, clips_per_foot: 2 },
      recessed: { price_per_foot: 12, clips_per_foot: 2 },
      corner: { price_per_foot: 10, clips_per_foot: 2 },
      none: { price_per_foot: 0, clips_per_foot: 0 }
    };

    const DRIVER_SPECS = [
      { max_watts: 60, price: 45 },
      { max_watts: 96, price: 65 },
      { max_watts: 150, price: 85 },
      { max_watts: 320, price: 125 }
    ];

    // Calculate tape cost and total watts
    let tapeCost = 0;
    let totalWatts = 0;
    runs.forEach(run => {
      const specs = TAPE_SPECS[run.tape_type];
      tapeCost += run.length_feet * specs.price_per_foot;
      totalWatts += run.length_feet * specs.watts_per_foot;
    });

    // Calculate channel cost
    let channelCost = 0;
    runs.forEach(run => {
      const specs = CHANNEL_SPECS[run.channel_type];
      channelCost += run.length_feet * specs.price_per_foot;
    });

    // Calculate required drivers
    let driverCost = 0;
    let remainingWatts = totalWatts;
    while (remainingWatts > 0) {
      const driver = DRIVER_SPECS.find(d => d.max_watts >= remainingWatts) || DRIVER_SPECS[DRIVER_SPECS.length - 1];
      driverCost += driver.price;
      remainingWatts -= driver.max_watts;
    }

    // Calculate mounting hardware (clips)
    const totalClips = runs.reduce((sum, run) => {
      const specs = CHANNEL_SPECS[run.channel_type];
      return sum + (run.length_feet * specs.clips_per_foot);
    }, 0);
    const clipSets = Math.ceil(totalClips / 50);
    const clipCost = clipSets * 15;

    return tapeCost + channelCost + driverCost + clipCost;
  };

  const handleExportQuote = () => {
    toast.info('Export feature coming soon');
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
    <div className="h-screen flex gap-6 bg-white">
      {/* Sidebar - Projects List */}
      <div className="w-80 px-6 py-4 flex flex-col">
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698fc81203f85a20f281d9dc/363b1fdb0_Screenshot2026-02-16175106.png" alt="Alkimi Logo" className="h-10 w-auto -ml-6" />
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-y-auto">
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
        <div className="mx-auto space-y-6 p-6">
          {/* Header Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                {isNewProject ? 'New Project' : projectData.project_name}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {isNewProject ? 'Create a new tape light quote' : projectData.customer_name}
              </p>
            </div>
            <div className="flex gap-2">
              {!isNewProject && (
                <>
                  <Button variant="outline" size="icon">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={handleSpecs}>
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

          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Project Details */}
            <div className="col-span-2 space-y-6">
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
                  />
                </CardContent>
              </Card>
            </div>

            {/* Right Column - Materials & Quote */}
            <div className="w-80 px-4 -mr-4 ml-auto">
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