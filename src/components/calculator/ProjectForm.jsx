import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// City must start with a letter; thereafter allow letters, spaces, hyphens, apostrophes, periods.
// Handles real names like Winston-Salem, Coeur d'Alene, St. Louis.
const CITY_PATTERN = /^[A-Za-z][A-Za-z\s\-'.]*$/;

export function isValidCity(value) {
  if (!value) return true; // empty is allowed (optional field)
  return CITY_PATTERN.test(value.trim());
}

export default function ProjectForm({ project, onChange }) {
  const cityError = project.city && !isValidCity(project.city);
  return (
    <div className="space-y-4">
      {project.quote_number && project.status === 'approved' && (
        <div className="bg-secondary border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground/70">Quote Number:</span>
            <span className="text-sm font-bold text-foreground">{project.quote_number}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-8 space-y-2">
          <Label htmlFor="project_name">Project Name</Label>
          <Input
            id="project_name"
            value={project.project_name || ''}
            onChange={(e) => onChange({ ...project, project_name: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="sector">Sector</Label>
          <Select
            value={project.sector || ''}
            onValueChange={(value) => onChange({ ...project, sector: value })}
          >
            <SelectTrigger id="sector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Commercial">Commercial</SelectItem>
              <SelectItem value="Education">Education</SelectItem>
              <SelectItem value="Healthcare">Healthcare</SelectItem>
              <SelectItem value="Hospitality">Hospitality</SelectItem>
              <SelectItem value="Residential">Residential</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2">
          <Label htmlFor="street">Street</Label>
          <Input
            id="street"
            value={project.street || ''}
            onChange={(e) => onChange({ ...project, street: e.target.value })}
          />
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={project.city || ''}
            onChange={(e) => onChange({ ...project, city: e.target.value })}
            aria-invalid={cityError || undefined}
            aria-describedby={cityError ? 'city-error' : undefined}
            className={cityError ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {cityError && (
            <p id="city-error" className="text-xs text-destructive">
              City names must start with a letter (letters, spaces, hyphens, apostrophes, periods only).
            </p>
          )}
        </div>
        <div className="col-span-4 space-y-2">
          <Label htmlFor="state">State</Label>
          <Select
            value={project.state || ''}
            onValueChange={(value) => onChange({ ...project, state: value })}
          >
            <SelectTrigger id="state">
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

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2">
          <Label htmlFor="customer_name">Customer</Label>
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
          <Label htmlFor="customer_phone">Phone</Label>
          <Input
            id="customer_phone"
            type="tel"
            value={project.customer_phone || ''}
            onChange={(e) => onChange({ ...project, customer_phone: e.target.value })}
          />
        </div>
      </div>

    </div>
  );
}