import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProjectForm({ project, onChange }) {
  return (
    <div className="space-y-4 pt-6">
      {project.quote_number && project.status === 'approved' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-600">Quote Number:</span>
            <span className="text-sm font-bold text-slate-900">{project.quote_number}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2">
          <Label htmlFor="project_name">Project Name</Label>
          <Input
            id="project_name"
            value={project.project_name || ''}
            onChange={(e) => onChange({ ...project, project_name: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="street">Street</Label>
          <Input
            id="street"
            value={project.street || ''}
            onChange={(e) => onChange({ ...project, street: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={project.city || ''}
                onChange={(e) => onChange({ ...project, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Select
                value={project.state || ''}
                onValueChange={(value) => onChange({ ...project, state: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AL">Alabama</SelectItem>
                  <SelectItem value="AK">Alaska</SelectItem>
                  <SelectItem value="AZ">Arizona</SelectItem>
                  <SelectItem value="AR">Arkansas</SelectItem>
                  <SelectItem value="CA">California</SelectItem>
                  <SelectItem value="CO">Colorado</SelectItem>
                  <SelectItem value="CT">Connecticut</SelectItem>
                  <SelectItem value="DE">Delaware</SelectItem>
                  <SelectItem value="FL">Florida</SelectItem>
                  <SelectItem value="GA">Georgia</SelectItem>
                  <SelectItem value="HI">Hawaii</SelectItem>
                  <SelectItem value="ID">Idaho</SelectItem>
                  <SelectItem value="IL">Illinois</SelectItem>
                  <SelectItem value="IN">Indiana</SelectItem>
                  <SelectItem value="IA">Iowa</SelectItem>
                  <SelectItem value="KS">Kansas</SelectItem>
                  <SelectItem value="KY">Kentucky</SelectItem>
                  <SelectItem value="LA">Louisiana</SelectItem>
                  <SelectItem value="ME">Maine</SelectItem>
                  <SelectItem value="MD">Maryland</SelectItem>
                  <SelectItem value="MA">Massachusetts</SelectItem>
                  <SelectItem value="MI">Michigan</SelectItem>
                  <SelectItem value="MN">Minnesota</SelectItem>
                  <SelectItem value="MS">Mississippi</SelectItem>
                  <SelectItem value="MO">Missouri</SelectItem>
                  <SelectItem value="MT">Montana</SelectItem>
                  <SelectItem value="NE">Nebraska</SelectItem>
                  <SelectItem value="NV">Nevada</SelectItem>
                  <SelectItem value="NH">New Hampshire</SelectItem>
                  <SelectItem value="NJ">New Jersey</SelectItem>
                  <SelectItem value="NM">New Mexico</SelectItem>
                  <SelectItem value="NY">New York</SelectItem>
                  <SelectItem value="NC">North Carolina</SelectItem>
                  <SelectItem value="ND">North Dakota</SelectItem>
                  <SelectItem value="OH">Ohio</SelectItem>
                  <SelectItem value="OK">Oklahoma</SelectItem>
                  <SelectItem value="OR">Oregon</SelectItem>
                  <SelectItem value="PA">Pennsylvania</SelectItem>
                  <SelectItem value="RI">Rhode Island</SelectItem>
                  <SelectItem value="SC">South Carolina</SelectItem>
                  <SelectItem value="SD">South Dakota</SelectItem>
                  <SelectItem value="TN">Tennessee</SelectItem>
                  <SelectItem value="TX">Texas</SelectItem>
                  <SelectItem value="UT">Utah</SelectItem>
                  <SelectItem value="VT">Vermont</SelectItem>
                  <SelectItem value="VA">Virginia</SelectItem>
                  <SelectItem value="WA">Washington</SelectItem>
                  <SelectItem value="WV">West Virginia</SelectItem>
                  <SelectItem value="WI">Wisconsin</SelectItem>
                  <SelectItem value="WY">Wyoming</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2">
          <Label htmlFor="customer_name">Customer Name</Label>
          <Input
            id="customer_name"
            value={project.customer_name || ''}
            onChange={(e) => onChange({ ...project, customer_name: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="customer_email">Email</Label>
          <Input
            id="customer_email"
            type="email"
            value={project.customer_email || ''}
            onChange={(e) => onChange({ ...project, customer_email: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="customer_phone">Customer Phone</Label>
          <Input
            id="customer_phone"
            type="tel"
            value={project.customer_phone || ''}
            onChange={(e) => onChange({ ...project, customer_phone: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 pb-4">
        <div className="col-span-12 space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={project.notes || ''}
            onChange={(e) => onChange({ ...project, notes: e.target.value })}
          />
        </div>
      </div>

    </div>
  );
}