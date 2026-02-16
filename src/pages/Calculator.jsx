import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Save, Download, Trash2, ChevronDown, FileText } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
  const [userOrg, setUserOrg] = useState(null);

  const queryClient = useQueryClient();

  // Fetch current user and organization
  useEffect(() => {
    const fetchUser = async () => {
      const user = await base44.auth.me();
      if (user?.organization_id) {
        setUserOrg(user.organization_id);
      }
    };
    fetchUser();
  }, []);

  // Fetch projects filtered by user's organization
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects', userOrg],
    queryFn: async () => {
      if (userOrg) {
        return await base44.entities.Project.filter({ organization_id: userOrg }, '-updated_date');
      }
      // If no org assigned, fetch projects created by this user
      const user = await base44.auth.me();
      return await base44.entities.Project.filter({ created_by: user.email }, '-updated_date');
    }
  });

  // Fetch tape runs for selected project
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ['tapeRuns', selectedProjectId],
    queryFn: () => selectedProjectId ? base44.entities.TapeRun.filter({ project_id: selectedProjectId }) : [],
    enabled: !!selectedProjectId
  });

  // Fetch pricing catalog
  const { data: productCatalog = [] } = useQuery({
    queryKey: ['productCatalog'],
    queryFn: () => base44.entities.ProductCatalog.list()
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
      queryClient.invalidateQueries({ queryKey: ['projects', userOrg] });
      if (isNewProject) {
        setSelectedProjectId(result.id);
        setIsNewProject(false);
      }
      toast.success('Project saved successfully');
    }
  });

  // Create tape run mutation
  const createTapeRunMutation = useMutation({
    mutationFn: (runData) => base44.entities.TapeRun.create(runData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run added');
    }
  });

  // Delete tape run mutation
  const deleteTapeRunMutation = useMutation({
    mutationFn: (runId) => base44.entities.TapeRun.delete(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tapeRuns', selectedProjectId] });
      toast.success('Tape run deleted');
    }
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (projectId) => base44.entities.Project.delete(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      handleNewProject();
      toast.success('Project deleted');
    }
  });

  // Load selected project
  useEffect(() => {
    if (selectedProjectId && !isNewProject) {
      const project = projects.find((p) => p.id === selectedProjectId);
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

    const dataToSave = {
      ...projectData,
      total_price: totalPrice
    };

    // Only add organization_id if user has one
    if (userOrg) {
      dataToSave.organization_id = userOrg;
    }

    await saveProjectMutation.mutateAsync(dataToSave);
  };

  const handleAddTapeRun = async (runData) => {
    if (!selectedProjectId && isNewProject) {
      // Save project first
      if (!projectData.project_name || !projectData.customer_name) {
        toast.error('Please save project details first');
        return;
      }

      const dataToSave = { ...projectData };
      if (userOrg) {
        dataToSave.organization_id = userOrg;
      }

      const result = await saveProjectMutation.mutateAsync(dataToSave);
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
    let total = 0;

    runs.forEach((run) => {
      const tapePrice = productCatalog.find((p) => p.product_type === 'tape' && p.variant === run.tape_type)?.price_per_unit || 0;
      const channelPrice = productCatalog.find((p) => p.product_type === 'channel' && p.variant === run.channel_type)?.price_per_unit || 0;

      total += run.length_feet * tapePrice;
      total += run.length_feet * channelPrice;
    });

    // Add drivers and hardware
    const driverPrice = productCatalog.find((p) => p.product_type === 'driver' && p.variant === '60w')?.price_per_unit || 85;
    const hardwarePrice = productCatalog.find((p) => p.product_type === 'hardware')?.price_per_unit || 15;

    total += driverPrice;
    total += hardwarePrice;

    return total;
  };

  const handleExportQuoteCSV = () => {
    try {
      const headers = ['Item', 'Quantity', 'Unit Price', 'Total'];
      const rows = [];

      // Tape light totals
      tapeRuns.forEach((run) => {
        const tapePrice = productCatalog.find((p) => p.product_type === 'tape' && p.variant === run.tape_type)?.price_per_unit || 0;
        rows.push([`${run.tape_type} - ${run.run_name}`, run.length_feet, tapePrice.toFixed(2), (run.length_feet * tapePrice).toFixed(2)]);
      });

      // Build CSV
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectData.project_name || 'quote'}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success('Quote exported as CSV');
    } catch (error) {
      toast.error('Failed to export CSV');
    }
  };

  const handleExportQuotePDF = async () => {
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
    <div className="flex-1 overflow-y-auto hide-scrollbar flex bg-slate-50">
      {/* Sidebar - Projects List */}
      <div className="w-80 p-6 flex flex-col">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <ProjectsList
            projects={projects}
            selectedId={selectedProjectId}
            onSelect={handleSelectProject}
            onNew={handleNewProject}
            isLoading={projectsLoading} />
        </Card>
      </div>
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          {/* Header Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <h2 className="text-2xl font-bold text-slate-900">
                {isNewProject ? 'New Project' : projectData.project_name}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                {isNewProject ? 'Create a new tape light quote' : projectData.customer_name}
              </p>
            </div>
            <div className="lg:col-span-1 flex flex-col gap-2 self-start">
              {!isNewProject &&
              <div className="grid grid-cols-3 gap-2 w-full">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 justify-center text-xs">
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportQuoteCSV}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportQuotePDF}>PDF</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  <Button variant="outline" size="sm" onClick={handleExportSubmittal} className="h-8 justify-center text-xs">
                    <FileText className="h-3 w-3 mr-1" />
                    Specs
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDeleteProject} className="h-8 justify-center text-xs">
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              }
              <Button size="sm" onClick={handleSaveProject} style={{ backgroundColor: '#e9ff64', color: '#000' }} className="hover:opacity-90 text-xs h-8 w-full">
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
                {detailsExpanded &&
                <CardContent>
                    <ProjectForm
                    project={projectData}
                    onChange={setProjectData} />

                  </CardContent>
                }
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
                    onDelete={(id) => deleteTapeRunMutation.mutate(id)} />

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