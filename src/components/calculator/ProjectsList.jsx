import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, FileText } from "lucide-react";
import { format } from "date-fns";

export default function ProjectsList({ projects, selectedId, onSelect, onNew, isLoading, searchQuery, onSearchChange }) {
  const statusColors = {
    draft: "bg-slate-100 text-slate-700",
    quoted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    completed: "bg-purple-100 text-purple-700"
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 space-y-3">
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            No projects yet.<br />Create your first project.
          </div>
        ) : (
          projects.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedId === project.id ? 'ring-2 ring-slate-900 shadow-md' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-sm">{project.project_name}</h3>
                  <Badge className={`${statusColors[project.status]} text-xs`}>
                    {project.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-600 space-y-1">
                  <div>{project.customer_name}</div>
                  {project.total_price && (
                    <div className="font-semibold text-slate-900">
                      ${project.total_price.toFixed(2)}
                    </div>
                  )}
                  <div className="text-slate-400">
                    {format(new Date(project.created_date), 'MMM d, yyyy')}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}