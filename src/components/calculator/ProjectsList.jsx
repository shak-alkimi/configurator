import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, FileText, Search, RotateCcw, Filter, X, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export default function ProjectsList({ projects, selectedId, onSelect, onNew, isLoading, searchQuery, onSearchChange, onUpdateStatus, filters, onFiltersChange }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const statusColors = {
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-blue-100 text-blue-700",
    approved: "bg-green-100 text-green-700",
    completed: "bg-purple-100 text-purple-700"
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 space-y-3">
        <Button onClick={onNew} className="w-full" size="sm">
          <Plus className="h-4 w-4" />
        </Button>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search projects..."
              className="h-9 text-sm pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-9 w-9 flex-shrink-0 ${showFilters ? 'bg-[#eeeeee]' : ''}`}
          >
            <Filter className="h-4 w-4" />
            {(filters.status !== 'all' || filters.dateFrom || filters.dateTo) && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                {[filters.status !== 'all' ? 1 : 0, filters.dateFrom ? 1 : 0, filters.dateTo ? 1 : 0].reduce((a, b) => a + b, 0)}
              </span>
            )}
          </Button>
        </div>
        
        {showFilters && (
          <div className="space-y-3 p-3 border rounded-lg bg-[#eeeeee]">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Status</label>
              <Select
                value={filters.status}
                onValueChange={(value) => onFiltersChange({ ...filters, status: value })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Date From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 text-sm justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateFrom ? format(filters.dateFrom, 'MMM d, yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateFrom}
                    onSelect={(date) => onFiltersChange({ ...filters, dateFrom: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Date To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 text-sm justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateTo ? format(filters.dateTo, 'MMM d, yyyy') : 'Select date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateTo}
                    onSelect={(date) => onFiltersChange({ ...filters, dateTo: date })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange({ status: 'all', dateFrom: null, dateTo: null })}
              className="w-full"
            >
              <X className="h-4 w-4 mr-2" />
              Clear filters
            </Button>
          </div>
        )}
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
                        className="h-7 px-2 text-xs bg-white border border-slate-200 hover:bg-slate-50 whitespace-nowrap"
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