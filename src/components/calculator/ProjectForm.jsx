import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Link2 } from "lucide-react";
import CustomerPicker from "./CustomerPicker";

// City must start with a letter; thereafter allow letters, spaces, hyphens, apostrophes, periods.
// Handles real names like Winston-Salem, Coeur d'Alene, St. Louis.
const CITY_PATTERN = /^[A-Za-z][A-Za-z\s\-'.]*$/;

export function isValidCity(value) {
  if (!value) return true; // empty is allowed (optional field)
  return CITY_PATTERN.test(value.trim());
}

// ProjectForm props (per #116, P1 fix from Codex audit applied):
//   - project: current project state (includes opus_customer_id and cache fields)
//   - onChange: setter for project state
//   - isAdmin: boolean — admin sees the CustomerPicker; reps don't
//   - linkedCustomer: optional resolved Customer entity (or null). Caller fetches
//     this only when role permits (Customer RLS is admin-only). For reps the
//     value is always null even on linked projects — that's intentional, and
//     the linked/unlinked branch below MUST NOT depend on this prop. Instead,
//     branch on project.opus_customer_id which is always present on the row.
//     linkedCustomer is used only as admin-side enrichment (rich picker label).
export default function ProjectForm({ project, onChange, isAdmin = false, linkedCustomer = null }) {
  // P1 fix from #116 Codex audit: linkage detection must NOT depend on
  // linkedCustomer (admin-only). Use the persisted FK directly so reps on
  // a linked project see the read-only branch, not the unlinked legacy form.
  const isLinked = typeof project.opus_customer_id === 'string'
    && project.opus_customer_id.trim() !== '';
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

      {/* Customer region — #116. Three states:
            (a) admin: CustomerPicker visible. Picking writes opus_customer_id +
                populates cache fields. Once linked, cache fields are read-only.
            (b) rep + linked: read-only cache display (canonical Customer is
                source of truth).
            (c) rep + unlinked: legacy free-text inputs preserved (rep can
                still capture lead info on a draft) + amber notice that an
                admin must link before submit. */}
      {isAdmin ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Customer (linked)</Label>
            <CustomerPicker
              value={project.opus_customer_id || ''}
              linkedCustomer={linkedCustomer}
              onPick={(customer) => onChange({
                ...project,
                opus_customer_id: customer.id,
                // Populate cache fields from the canonical Customer entity.
                // Project addresses (street/city/state) intentionally NOT
                // touched — those are install-site, distinct from Customer
                // billing/shipping address. Address sync is out of scope for #116.
                customer_name: customer.name || '',
                customer_email: customer.email || '',
                customer_phone: customer.phone || '',
              })}
              onClear={() => onChange({
                ...project,
                opus_customer_id: '',
                // Leave cache fields alone on clear — admin may want to keep
                // captured info while re-linking to a different Customer.
              })}
            />
          </div>
          {isLinked ? (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-4 space-y-2">
                <Label className="text-muted-foreground">Email (from Customer)</Label>
                <Input value={project.customer_email || ''} readOnly disabled />
              </div>
              <div className="col-span-4 space-y-2">
                <Label className="text-muted-foreground">Phone (from Customer)</Label>
                <Input value={project.customer_phone || ''} readOnly disabled />
              </div>
            </div>
          ) : null}
        </div>
      ) : isLinked ? (
        /* Rep view, linked: read-only cache display. Uses project's own
           cached customer fields — reps don't read the Customer entity
           directly (RLS), but the linkage and cached identity still flow
           through Project. */
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-2">
            <Label className="text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Customer (linked)
            </Label>
            <Input value={project.customer_name || ''} readOnly disabled />
          </div>
          <div className="col-span-4 space-y-2">
            <Label className="text-muted-foreground">Email</Label>
            <Input value={project.customer_email || ''} readOnly disabled />
          </div>
          <div className="col-span-4 space-y-2">
            <Label className="text-muted-foreground">Phone</Label>
            <Input value={project.customer_phone || ''} readOnly disabled />
          </div>
        </div>
      ) : (
        /* Rep view, unlinked: legacy free-text inputs + linkage notice. */
        <div className="space-y-3">
          <Alert variant="default" className="border-foreground/20 bg-foreground/5">
            <AlertCircle className="h-4 w-4 text-foreground/60" />
            <AlertDescription className="text-sm">
              This project isn't linked to a customer record yet. You can capture lead info below,
              but an admin must link a Customer before this project can be submitted.
            </AlertDescription>
          </Alert>
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
      )}

    </div>
  );
}