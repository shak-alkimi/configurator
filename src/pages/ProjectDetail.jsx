import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Calendar, DollarSign } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import TaskList from "../components/project/TaskList";
import MaterialsCalculator from "../components/calculator/MaterialsCalculator";
import { format } from "date-fns";

export default function ProjectDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const projects = await base44.entities.Project.filter({ id: projectId });
      return projects[0];
    },
    enabled: !!projectId
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => base44.entities.TapeRun.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list()
  });

  if (projectLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!project) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-slate-500 mb-4">Project not found</p>
            <Link to={createPageUrl('Calculator')}>
              <Button>Back to Projects</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusColors = {
    draft: "bg-slate-100 text-slate-800",
    quoted: "bg-blue-100 text-blue-800",
    approved: "bg-green-100 text-green-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    completed: "bg-purple-100 text-purple-800"
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl('Calculator')}>
              <Button variant="outline" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{project.project_name}</h1>
              <p className="text-slate-600">{project.customer_name}</p>
            </div>
          </div>
          <Badge className={statusColors[project.status]}>
            {project.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Project Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Deadline</p>
                  <p className="font-semibold">
                    {project.deadline ? format(new Date(project.deadline), 'MMM d, yyyy') : 'Not set'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total Price</p>
                  <p className="font-semibold">
                    {project.total_price ? `$${project.total_price.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'Not calculated'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">Progress</p>
                  <p className="text-sm font-semibold">{project.progress || 0}%</p>
                </div>
                <Progress value={project.progress || 0} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tasks Section */}
          <Card>
            <CardHeader>
              <CardTitle>Project Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskList projectId={projectId} tasks={tasks} users={users} />
            </CardContent>
          </Card>

          {/* Materials Section */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Materials & Quote</CardTitle>
              </CardHeader>
              <CardContent>
                {runs.length > 0 ? (
                  <MaterialsCalculator runs={runs} />
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <p>No tape runs added yet</p>
                    <Link to={createPageUrl('Calculator')}>
                      <Button className="mt-4" variant="outline">
                        Add Materials
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Notes Section */}
        {project.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Project Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap">{project.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}