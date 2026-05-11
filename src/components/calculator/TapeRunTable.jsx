import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Check, X, Trash2 } from "lucide-react";
import TabSelect from "@/components/calculator/TabSelect";
import { base44 } from "@/api/base44Client";

const INCHES_OPTIONS = ["0", "2.5", "5", "7.5", "10"];

export default function TapeRunTable({ tapeRuns, drivers, onRunUpdated, onRunDeleted }) {
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const startEdit = (run) => {
    const feet = Math.floor(run.length_feet);
    const inches = ((run.length_feet - feet) * 12).toFixed(1);
    setEditingId(run.id);
    setEditData({
      run_name: run.run_name || "",
      location: run.location || "",
      product_type: run.product_type || "",
      feet: String(feet),
      inches: String(inches),
      cct: run.cct || "",
      tape_output: run.tape_output || "",
      finish: run.finish || "",
      lens: run.lens || "",
      channel_type: run.channel_type || "",
      driver_group: run.driver_group || "",
      notes: run.notes || "",
    });
  };

  const saveEdit = async (runId) => {
    const length_feet = parseFloat(editData.feet) + parseFloat(editData.inches) / 12;
    const updated = await base44.entities.TapeRun.update(runId, {
      ...editData,
      length_feet,
    });
    onRunUpdated(updated);
    setEditingId(null);
  };

  const deleteRun = async (runId) => {
    await base44.entities.TapeRun.delete(runId);
    onRunDeleted(runId);
  };

  const sortedRuns = [...tapeRuns].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  return (
    <div className="space-y-2">
      {sortedRuns.map((run) => (
        <div key={run.id} className="bg-white rounded-lg border border-slate-200 p-3">
          {editingId === run.id ? (
            // Edit mode
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-2">
                <label className="text-xs text-slate-600 block mb-1">Location</label>
                <Input
                  value={editData.location}
                  onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                  className="h-8 text-xs"
                />
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Type</label>
                <TabSelect value={editData.product_type} onValueChange={(v) => setEditData({ ...editData, product_type: v })} triggerClassName="h-8 text-xs">
                  <SelectItem value="Tape">Tape</SelectItem>
                  <SelectItem value="Flex">Flex</SelectItem>
                </TabSelect>
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Feet</label>
                <Input type="number" value={editData.feet} onChange={(e) => setEditData({ ...editData, feet: e.target.value })} className="h-8 text-xs" />
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Inches</label>
                <TabSelect value={editData.inches} onValueChange={(v) => setEditData({ ...editData, inches: v })} triggerClassName="h-8 text-xs">
                  {INCHES_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </TabSelect>
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">CCT</label>
                <TabSelect value={editData.cct} onValueChange={(v) => setEditData({ ...editData, cct: v })} triggerClassName="h-8 text-xs">
                  <SelectItem value="2400k">2400k</SelectItem>
                  <SelectItem value="2700k">2700k</SelectItem>
                  <SelectItem value="3000k">3000k</SelectItem>
                  <SelectItem value="3500k">3500k</SelectItem>
                  <SelectItem value="Warm Dim (30k-18k)">Warm Dim</SelectItem>
                  <SelectItem value="Tunable White (18k-40k)">Tunable</SelectItem>
                </TabSelect>
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Output</label>
                <TabSelect value={editData.tape_output} onValueChange={(v) => setEditData({ ...editData, tape_output: v })} triggerClassName="h-8 text-xs">
                  <SelectItem value="300lm (3.0w/ft)">300lm</SelectItem>
                  <SelectItem value="360lm (3.6w/ft)">360lm</SelectItem>
                  <SelectItem value="600lm (6.0w/ft)">600lm</SelectItem>
                </TabSelect>
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Housing</label>
                <TabSelect value={editData.channel_type} onValueChange={(v) => setEditData({ ...editData, channel_type: v })} triggerClassName="h-8 text-xs">
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="recessed">Recessed</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                </TabSelect>
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Lens</label>
                <Input value={editData.lens} onChange={(e) => setEditData({ ...editData, lens: e.target.value })} className="h-8 text-xs" />
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Finish</label>
                <Input value={editData.finish} onChange={(e) => setEditData({ ...editData, finish: e.target.value })} className="h-8 text-xs" />
              </div>

              <div className="col-span-1">
                <label className="text-xs text-slate-600 block mb-1">Driver</label>
                <TabSelect value={editData.driver_group} onValueChange={(v) => setEditData({ ...editData, driver_group: v })} triggerClassName="h-8 text-xs">
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.name}>
                      {d.name}
                    </SelectItem>
                  ))}
                </TabSelect>
              </div>

              <div className="col-span-1 flex gap-1 justify-end">
                <Button size="icon" className="h-8 w-8" onClick={() => saveEdit(run.id)}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            // View mode
            <>
              <div className="space-y-1">
                <div className="grid grid-cols-12 gap-2 text-xs">
                  <div className="col-span-2">
                    <span className="font-medium">{run.location}</span>
                  </div>
                  <div className="col-span-1">{run.product_type}</div>
                  <div className="col-span-1">{Math.floor(run.length_feet)}'</div>
                  <div className="col-span-1">{((run.length_feet % 1) * 12).toFixed(1)}"</div>
                  <div className="col-span-1">{run.cct}</div>
                  <div className="col-span-1">{run.tape_output}</div>
                  <div className="col-span-1">{run.channel_type}</div>
                  <div className="col-span-1">{run.lens}</div>
                  <div className="col-span-1">{run.finish}</div>
                  <div className="col-span-1">{run.driver_group}</div>
                  <div className="col-span-1 flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(run)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-600 hover:text-red-700" onClick={() => deleteRun(run.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {run.notes && <div className="text-xs text-slate-500">Notes: {run.notes}</div>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}