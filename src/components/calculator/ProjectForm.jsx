import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProjectForm({ project, onChange }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="project_name">Project Name *</Label>
          <Input
            id="project_name"
            value={project.project_name || ''}
            onChange={(e) => onChange({ ...project, project_name: e.target.value })}
            placeholder="Kitchen Renovation"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={project.status || 'draft'}
            onValueChange={(value) => onChange({ ...project, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="quoted">Quoted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customer_name">Customer Name *</Label>
          <Input
            id="customer_name"
            value={project.customer_name || ''}
            onChange={(e) => onChange({ ...project, customer_name: e.target.value })}
            placeholder="John Smith"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer_email">Customer Email</Label>
          <Input
            id="customer_email"
            type="email"
            value={project.customer_email || ''}
            onChange={(e) => onChange({ ...project, customer_email: e.target.value })}
            placeholder="john@example.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="customer_phone">Customer Phone</Label>
        <Input
          id="customer_phone"
          value={project.customer_phone || ''}
          onChange={(e) => onChange({ ...project, customer_phone: e.target.value })}
          placeholder="(555) 123-4567"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="deadline">Project Deadline</Label>
          <Input
            id="deadline"
            type="date"
            value={project.deadline || ''}
            onChange={(e) => onChange({ ...project, deadline: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="progress">Progress (%)</Label>
          <Input
            id="progress"
            type="number"
            min="0"
            max="100"
            value={project.progress || 0}
            onChange={(e) => onChange({ ...project, progress: parseInt(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Project Notes</Label>
        <Textarea
          id="notes"
          value={project.notes || ''}
          onChange={(e) => onChange({ ...project, notes: e.target.value })}
          placeholder="Additional details about the project..."
          rows={3}
        />
      </div>
    </div>
  );
}