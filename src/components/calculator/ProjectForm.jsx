import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProjectForm({ project, onChange }) {
  return (
    <div className="space-y-4">
      <div></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="project_name">Project Name</Label>
          <Input
            id="project_name"
            value={project.project_name || ''}
            onChange={(e) => onChange({ ...project, project_name: e.target.value })}
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
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="customer_name">Customer Name</Label>
          <Input
            id="customer_name"
            value={project.customer_name || ''}
            onChange={(e) => onChange({ ...project, customer_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer_email">Customer Email</Label>
          <Input
            id="customer_email"
            type="email"
            value={project.customer_email || ''}
            onChange={(e) => onChange({ ...project, customer_email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input
          id="address"
          value={project.address || ''}
          onChange={(e) => onChange({ ...project, address: e.target.value })}
        />
      </div>

    </div>
  );
}