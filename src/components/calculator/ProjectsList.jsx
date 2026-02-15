import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Search, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function ProjectsList({ projects, selectedId, onSelect, onNew, isLoading }) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredProjects = React.useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const query = searchQuery.toLowerCase();
    return projects.filter(project => 
      project.project_name.toLowerCase().includes(query) ||
      project.customer_name.toLowerCase().includes(query)
    );
  }, [projects, searchQuery]);
  const statusColors = {
    draft: "bg-slate-100 text-slate-700",
    quoted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    in_progress: "bg-yellow-100 text-yellow-700",
    completed: "bg-purple-100 text-purple-700"
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b space-y-3">
        <Button onClick={onNew} className="w-full hover:opacity-90 text-xs" size="sm" style={{ backgroundColor: '#e9ff64', color: '#000' }}>
          <Plus className="h-3 w-3 mr-1" />
          New Project
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            No projects yet.<br />Create your first project.
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            No projects match your search.
          </div>
        ) : (
          filteredProjects.map((project) => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedId === project.id ? 'ring-2 ring-slate-900 shadow-md' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <CardContent className="p-3">
               <div className="flex items-start justify-between mb-2">
                 <div className="flex-1">
                   <h3 className="font-semibold text-sm">{project.project_name}</h3>
                 </div>
                 <Badge className={`${statusColors[project.status]} text-xs`}>
                   {project.status.replace('_', ' ')}
                 </Badge>
               </div>
               <div className="text-xs text-slate-600 space-y-1">
                 <div>{project.customer_name}</div>
                 {project.total_price && (
                  <div className="font-semibold text-slate-900">
                    ${project.total_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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