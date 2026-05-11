import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import TabSelect from "@/components/calculator/TabSelect";
import { base44 } from "@/api/base44Client";

const INCHES_OPTIONS = ["0", "2.5", "5", "7.5", "10"];

export default function TapeRunInputRow({ drivers, projectId, onRunAdded }) {
  const [formData, setFormData] = useState({
    run_name: "",
    location: "",
    product_type: "",
    feet: "",
    inches: "0",
    cct: "",
    tape_output: "",
    finish: "",
    lens: "",
    channel_type: "",
    driver_group: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.feet || !formData.location) {
      return;
    }

    setIsSubmitting(true);
    try {
      const length_feet = parseFloat(formData.feet) + parseFloat(formData.inches) / 12;
      const newRun = await base44.entities.TapeRun.create({
        project_id: projectId,
        run_name: formData.run_name || `Run ${new Date().getTime()}`,
        location: formData.location,
        product_type: formData.product_type,
        length_feet,
        cct: formData.cct,
        tape_output: formData.tape_output,
        finish: formData.finish,
        lens: formData.lens,
        channel_type: formData.channel_type,
        driver_group: formData.driver_group,
        notes: formData.notes,
      });
      onRunAdded(newRun);
      setFormData({
        run_name: "",
        location: "",
        product_type: "",
        feet: "",
        inches: "0",
        cct: "",
        tape_output: "",
        finish: "",
        lens: "",
        channel_type: "",
        driver_group: "",
        notes: "",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2 mb-4">
      <div className="grid grid-cols-12 gap-2 items-end">
        {/* Location */}
        <div className="col-span-2">
          <label className="text-xs text-slate-600 block mb-1">Location</label>
          <Input
            placeholder="e.g., Kitchen"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Product Type */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Type</label>
          <TabSelect value={formData.product_type} onValueChange={(v) => setFormData({ ...formData, product_type: v })} triggerClassName="h-8 text-xs">
            <SelectItem value="Tape">Tape</SelectItem>
            <SelectItem value="Flex">Flex</SelectItem>
          </TabSelect>
        </div>

        {/* Length: Feet */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Feet</label>
          <Input
            type="number"
            placeholder="0"
            value={formData.feet}
            onChange={(e) => setFormData({ ...formData, feet: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Length: Inches */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Inches</label>
          <TabSelect value={formData.inches} onValueChange={(v) => setFormData({ ...formData, inches: v })} triggerClassName="h-8 text-xs">
            {INCHES_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </TabSelect>
        </div>

        {/* CCT */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">CCT</label>
          <TabSelect value={formData.cct} onValueChange={(v) => setFormData({ ...formData, cct: v })} triggerClassName="h-8 text-xs">
            <SelectItem value="2400k">2400k</SelectItem>
            <SelectItem value="2700k">2700k</SelectItem>
            <SelectItem value="3000k">3000k</SelectItem>
            <SelectItem value="3500k">3500k</SelectItem>
            <SelectItem value="Warm Dim (30k-18k)">Warm Dim</SelectItem>
            <SelectItem value="Tunable White (18k-40k)">Tunable</SelectItem>
          </TabSelect>
        </div>

        {/* Output */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Output</label>
          <TabSelect value={formData.tape_output} onValueChange={(v) => setFormData({ ...formData, tape_output: v })} triggerClassName="h-8 text-xs">
            <SelectItem value="300lm (3.0w/ft)">300lm</SelectItem>
            <SelectItem value="360lm (3.6w/ft)">360lm</SelectItem>
            <SelectItem value="600lm (6.0w/ft)">600lm</SelectItem>
          </TabSelect>
        </div>

        {/* Housing */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Housing</label>
          <TabSelect value={formData.channel_type} onValueChange={(v) => setFormData({ ...formData, channel_type: v })} triggerClassName="h-8 text-xs">
            <SelectItem value="corner">Corner</SelectItem>
            <SelectItem value="recessed">Recessed</SelectItem>
            <SelectItem value="surface">Surface</SelectItem>
          </TabSelect>
        </div>

        {/* Lens */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Lens</label>
          <Input
            placeholder="Lens"
            value={formData.lens}
            onChange={(e) => setFormData({ ...formData, lens: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Finish */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Finish</label>
          <Input
            placeholder="Finish"
            value={formData.finish}
            onChange={(e) => setFormData({ ...formData, finish: e.target.value })}
            className="h-8 text-xs"
          />
        </div>

        {/* Driver */}
        <div className="col-span-1">
          <label className="text-xs text-slate-600 block mb-1">Driver</label>
          <TabSelect value={formData.driver_group} onValueChange={(v) => setFormData({ ...formData, driver_group: v })} triggerClassName="h-8 text-xs">
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.name}>
                {d.name}
              </SelectItem>
            ))}
          </TabSelect>
        </div>

        {/* Submit */}
        <div className="col-span-1 flex justify-end">
          <Button
            size="icon"
            className="h-8 w-8"
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.feet || !formData.location}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Notes row */}
      <div>
        <label className="text-xs text-slate-600 block mb-1">Notes</label>
        <Input
          placeholder="Optional notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}