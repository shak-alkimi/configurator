import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Download } from "lucide-react";
import { toast } from "sonner";
import ProjectForm from "@/components/calculator/ProjectForm";
import DriverGaugeSection from "@/components/calculator/DriverGaugeSection";
import TapeRunInputRow from "@/components/calculator/TapeRunInputRow";
import TapeRunTable from "@/components/calculator/TapeRunTable";
import MaterialsCalculator from "@/components/calculator/MaterialsCalculator";

export default function ProjectDetails() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [projectData, setProjectData] = useState(null);

  // Fetch project
  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => base44.entities.Project.get(projectId),
    enabled: !!projectId,
  });

  // Fetch drivers for this project
  const { data: drivers = [] } = useQuery({
    queryKey: ["drivers", projectId],
    queryFn: () => base44.entities.Driver.filter({ project_id: projectId }, "created_date"),
    enabled: !!projectId,
  });

  // Fetch tape runs for this project
  const { data: tapeRuns = [] } = useQuery({
    queryKey: ["tapeRuns", projectId],
    queryFn: () => base44.entities.TapeRun.filter({ project_id: projectId }, "created_date"),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project) {
      setProjectData(project);
    }
  }, [project]);

  const handleSaveProject = async () => {
    try {
      await base44.entities.Project.update(projectId, projectData);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success("Project saved");
    } catch {
      toast.error("Failed to save project");
    }
  };

  const handleDriversChange = (newDrivers) => {
    queryClient.setQueryData(["drivers", projectId], newDrivers);
  };

  const handleRunAdded = (newRun) => {
    queryClient.invalidateQueries({ queryKey: ["tapeRuns", projectId] });
    toast.success("Tape run added");
  };

  const handleRunUpdated = (updatedRun) => {
    const updated = tapeRuns.map(r => r.id === updatedRun.id ? updatedRun : r);
    queryClient.setQueryData(["tapeRuns", projectId], updated);
    toast.success("Tape run updated");
  };

  const handleRunDeleted = (runId) => {
    const filtered = tapeRuns.filter(r => r.id !== runId);
    queryClient.setQueryData(["tapeRuns", projectId], filtered);
    toast.success("Tape run deleted");
  };

  const handleExportPDF = async () => {
    try {
      const response = await base44.functions.invoke("exportProjectPDF", { project_id: projectId });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectData?.project_name || "project"}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF exported");
    } catch {
      toast.error("Failed to export PDF");
    }
  };

  if (projectLoading || !projectData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex gap-0 bg-white overflow-hidden">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto flex gap-0">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="space-y-4 md:space-y-6 p-4 md:py-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  <h1 className="text-2xl font-bold">{projectData.project_name}</h1>
                  <p className="text-sm text-slate-500">{projectData.customer_name}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={handleExportPDF}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button onClick={handleSaveProject}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>

            {/* Project Form */}
            <Card>
              <CardContent>
                <ProjectForm project={projectData} onChange={setProjectData} />
              </CardContent>
            </Card>

            {/* Drivers Section */}
            <Card>
              <CardContent>
                <DriverGaugeSection
                  drivers={drivers}
                  tapeRuns={tapeRuns}
                  projectId={projectId}
                  onDriversChange={handleDriversChange}
                />
              </CardContent>
            </Card>

            {/* Tape Run Input */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add Tape Run</CardTitle>
              </CardHeader>
              <CardContent>
                <TapeRunInputRow
                  drivers={drivers}
                  projectId={projectId}
                  onRunAdded={handleRunAdded}
                />
              </CardContent>
            </Card>

            {/* Tape Run List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tape Runs ({tapeRuns.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {tapeRuns.length === 0 ? (
                  <p className="text-sm text-slate-500">No tape runs yet</p>
                ) : (
                  <TapeRunTable
                    tapeRuns={tapeRuns}
                    drivers={drivers}
                    onRunUpdated={handleRunUpdated}
                    onRunDeleted={handleRunDeleted}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right sidebar - Materials */}
        <div className="hidden md:flex flex-col py-6 w-64 lg:w-80 px-4 lg:px-6 shrink-0">
          <div className="sticky top-6">
            <MaterialsCalculator runs={tapeRuns} />
          </div>
        </div>
      </div>
    </div>
  );
}