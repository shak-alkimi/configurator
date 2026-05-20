import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, FileText, Search, RotateCcw, Pencil } from "lucide-react";
import { format } from "date-fns";

export default function ProjectsList({ projects, selectedId, onSelect, onEditDetails, onNew, isLoading, searchQuery, onSearchChange, onUpdateStatus }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const newNameInputRef = useRef(null);

  useEffect(() => {
    if (isCreating) {
      newNameInputRef.current?.focus();
    }
  }, [isCreating]);

  const commitNewProject = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setIsCreating(false);
      setNewName('');
      return;
    }
    onNew(trimmed);
    setIsCreating(false);
    setNewName('');
  };

  const cancelNewProject = () => {
    setIsCreating(false);
    setNewName('');
  };
  const statusColors = {
    draft: "bg-secondary text-foreground/70",
    submitted: "bg-secondary text-foreground",
    approved: "bg-primary/15 text-primary"
  };

  return (
    <div className="h-full flex flex-col gap-6 px-6 pb-6">
      <div className="flex flex-col gap-3">
        <Button
          onClick={() => {
            setIsCreating(true);
            onSelect(null);
          }}
          className="w-full"
          size="sm"
          aria-label="Add new project"
          data-testid="project-new"
          disabled={isCreating}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground/40" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder=""
            className="h-9 text-sm pl-9"
            aria-label="Search projects"
            data-testid="project-search"
          />
        </div>
      </div>
      {isCreating && (
        <Card className="ring-2 ring-inset ring-ring border-transparent shadow-md">
          <CardContent className="p-4">
            <Input
              ref={newNameInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitNewProject();
                } else if (e.key === 'Tab') {
                  e.preventDefault();
                  if (newName.trim()) commitNewProject();
                  else cancelNewProject();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelNewProject();
                }
              }}
              onBlur={cancelNewProject}
              placeholder="Project name"
              className="h-9 text-sm"
              aria-label="New project name"
            />
          </CardContent>
        </Card>
      )}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
        {isLoading ? (
          <div className="text-center py-8 text-foreground/40 text-sm">Loading...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-8 text-foreground/40 text-sm">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          </div>
        ) : (
          projects.map((project) => (
            <Card
              key={project.id}
              data-testid="project-list-item"
              data-project-id={project.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedId === project.id ? 'ring-2 ring-inset ring-ring border-transparent shadow-md' : ''
              }`}
              onClick={() => onSelect(project.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-2">
                  <h3 className="font-semibold text-sm flex-1 min-w-0 break-words line-clamp-2 min-h-[2.5rem]">{project.project_name}</h3>
                  <div
                    className="relative flex flex-col items-end gap-1"
                    onMouseEnter={() => setHoveredId(project.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <Badge className={`${statusColors[project.status]} text-xs flex-shrink-0 cursor-default`}>
                      {project.status}
                    </Badge>
                    {hoveredId === project.id && project.status === 'submitted' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs bg-background border border-border hover:bg-secondary whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(project.id, 'draft');
                        }}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Revert
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-foreground/70 space-y-1">
                   <div className="min-h-[1rem]">{project.customer_name || ' '}</div>
                   <div className="flex items-center justify-between">
                    <div className="text-foreground/40">
                      {format(new Date(project.created_date), 'MMM d, yyyy')}
                    </div>
                    <div className="flex items-center gap-2">
                      {project.quote_number && project.status === 'approved' && (
                        <div className="text-foreground/60 font-medium">
                          {project.quote_number}
                        </div>
                      )}
                      {selectedId === project.id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditDetails?.(project.id);
                          }}
                          aria-label="Edit project details"
                          data-testid="project-edit-details"
                          className="text-foreground/40 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
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