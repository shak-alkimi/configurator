import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectItem } from "@/components/ui/select";
import TabSelect from "@/components/calculator/TabSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { calculateRunFullCost, formatFeetInches, titleCase } from "@/components/calculator/calculations";
import DriverManager from "@/components/calculator/DriverManager";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TAPE_INCH_OPTIONS = ['0', '2.5', '5', '7.5', '10'];

// Blank new-run form state. Used by the initial state and the post-add reset.
const EMPTY_NEW_RUN = Object.freeze({
  run_name: '',
  feet: '',
  inches: '',
  tape_output: '',
  product_type: '',
  location: '',
  cct: '',
  channel_type: '',
  lens: '',
  finish: '',
  notes: '',
  driver_group: '',
});

// Format total inches as "Xft Y.Zin"
function formatSnapped(totalInches) {
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  const inDisplay = Number.isInteger(inches) ? `${inches}` : inches.toFixed(1);
  return `${ft}ft ${inDisplay}in`;
}


// Given feet + inches strings, return total feet
function getSnappedFeet(feetStr, inchesStr) {
  const ft = parseFloat(feetStr) || 0;
  const inches = parseFloat(inchesStr) || 0;
  return ft + inches / 12;
}

// Extract the nearest valid inches option string from a length_feet value
function extractInchesOption(lengthFeet) {
  const rawInches = (lengthFeet % 1) * 12;
  const snapped = Math.round(rawInches / 2.5) * 2.5;
  const clamped = Math.min(snapped, 10);
  return TAPE_INCH_OPTIONS.find(o => parseFloat(o) === clamped) ?? '0';
}

export default function TapeRunList({ runs, drivers, onDriversChange, onAdd, onUpdate, onDelete, onReorder, onDuplicate }) {
  const sortedDrivers = [...(drivers || [])].sort((a, b) => {
    const numA = parseInt(/^Driver\s+(\d+)$/.exec(a.name || '')?.[1] ?? Infinity, 10);
    const numB = parseInt(/^Driver\s+(\d+)$/.exec(b.name || '')?.[1] ?? Infinity, 10);
    return numA - numB;
  });
  const [localRuns, setLocalRuns] = useState(runs);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [newRun, setNewRun] = useState({ ...EMPTY_NEW_RUN });

  useEffect(() => {
    setLocalRuns(runs);
  }, [runs]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isFormValid()) {
      handleAdd();
    }
  };

  // Compute snapped preview for new run
  const newRunSnappedFeet = getSnappedFeet(newRun.feet, newRun.inches);

  const handleAdd = async () => {
    const totalFeet = getSnappedFeet(newRun.feet, newRun.inches);

    if (!newRun.product_type || !newRun.cct || !newRun.tape_output || !newRun.channel_type || !newRun.lens || !newRun.finish || !newRun.driver_group || totalFeet <= 0) {
      return;
    }

    // Wait for the add to succeed before clearing — if it errors (e.g. server
    // rejects or project save fails), the rep's typed values stay in the form.
    try {
      await onAdd({
        run_name: newRun.run_name,
        length_feet: totalFeet,
        tape_output: newRun.tape_output,
        product_type: newRun.product_type,
        location: newRun.location,
        cct: newRun.cct,
        channel_type: newRun.channel_type,
        lens: newRun.lens,
        finish: newRun.finish,
        notes: newRun.notes,
        driver_group: newRun.driver_group,
      });
      setNewRun({ ...EMPTY_NEW_RUN });
    } catch {
      // Calculator's handleAddTapeRun already toasts on error — keep form.
    }
  };

  const formatChannelType = titleCase;

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const srcGroup = result.source.droppableId;
    const dstGroup = result.destination.droppableId;
    if (srcGroup === dstGroup && result.source.index === result.destination.index) return;

    const movedRunId = result.draggableId;
    const movedRun = localRuns.find(r => String(r.id) === movedRunId);
    if (!movedRun) return;

    const groupOrder = [...sortedDrivers.map(d => d.name), '__unassigned__'];
    const grouped = Object.fromEntries(groupOrder.map(g => [g, []]));
    for (const r of localRuns) {
      const k = r.driver_group && sortedDrivers.some(d => d.name === r.driver_group) ? r.driver_group : '__unassigned__';
      grouped[k].push(r);
    }

    grouped[srcGroup] = grouped[srcGroup].filter(r => String(r.id) !== movedRunId);
    const newDriverGroup = dstGroup === '__unassigned__' ? '' : dstGroup;
    const updatedMoved = { ...movedRun, driver_group: newDriverGroup };
    grouped[dstGroup] = [
      ...grouped[dstGroup].slice(0, result.destination.index),
      updatedMoved,
      ...grouped[dstGroup].slice(result.destination.index),
    ];

    const newFlat = groupOrder.flatMap(g => grouped[g]);
    setLocalRuns(newFlat);
    setTimeout(() => onReorder(newFlat), 0);
  };

  // Move a run from one index to another. Used by drag-drop AND by the up/down
  // buttons that exist so agents and keyboard users can reorder without DnD.
  const reorderRunAt = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= localRuns.length) return;
    if (fromIndex === toIndex) return;
    const reordered = Array.from(localRuns);
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setLocalRuns(reordered);
    setTimeout(() => onReorder(reordered), 0);
  };

  const isFormValid = () => {
    return newRunSnappedFeet > 0 && newRun.product_type && newRun.cct && newRun.tape_output && newRun.channel_type && newRun.lens && newRun.finish && newRun.driver_group;
  };

  const addDriver = (maxWatts) => {
    const used = new Set((drivers || []).map(d => {
      const m = /^Driver\s+(\d+)$/.exec(d.name || '');
      return m ? parseInt(m[1], 10) : null;
    }).filter(n => n != null));
    let nextN = 1;
    while (used.has(nextN)) nextN++;
    onDriversChange([...(drivers || []), { id: String(Date.now()), name: `Driver ${nextN}`, maxWatts }]);
  };

  return (
    <div>
      <section data-section="drivers" className={`px-6 border-b border-border ${(drivers?.length || 0) === 0 ? 'py-3' : 'space-y-2 py-6 min-h-[152px]'}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-foreground/50">Drivers</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="h-9 w-9 rounded border-foreground hover:border-foreground" aria-label="Add driver" data-testid="driver-add">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem data-testid="driver-add-60" onClick={() => addDriver(60)}>60W Driver</DropdownMenuItem>
              <DropdownMenuItem data-testid="driver-add-96" onClick={() => addDriver(96)}>96W Driver</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DriverManager
          drivers={drivers || []}
          runs={localRuns}
          onDriversChange={onDriversChange}
          onClearDriverRuns={(driverName) => {
            const affected = (localRuns || []).filter(r => r.driver_group === driverName);
            affected.forEach(r => onUpdate(r.id, { driver_group: '' }, { silent: true }));
            if (affected.length > 0) {
              toast.success(`Cleared ${affected.length} run${affected.length === 1 ? '' : 's'} from ${driverName}`);
            }
          }}
        />
      </section>

      <section data-section="configure" className="space-y-2 px-6 py-6 border-b border-border last:border-b-0 min-h-[152px]">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-foreground/50">Configure</h3>
          <Button
            onClick={handleAdd}
            size="icon"
            variant={isFormValid() ? 'default' : 'outline'}
            className={`h-9 w-9 rounded ${isFormValid() ? 'bg-secondary text-foreground hover:bg-secondary/80 border-0' : ''}`}
            disabled={!isFormValid()}
            aria-label="Add tape run"
            data-testid="tape-run-add"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="w-full">
            {/* New Run Row */}
            <div className="flex gap-2 items-end w-full">
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-name" className="text-xs text-foreground/60 text-left">Type</Label>
                <Input id="new-run-name" data-testid="new-run-name" value={newRun.run_name} onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-location" className="text-xs text-foreground/60 text-left">Location</Label>
                <Input id="new-run-location" data-testid="new-run-location" value={newRun.location} onChange={e => setNewRun({ ...newRun, location: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-product" className="text-xs text-foreground/60 text-left">Product</Label>
                <TabSelect id="new-run-product" value={newRun.product_type} onValueChange={(value) => setNewRun({ ...newRun, product_type: value, tape_output: '' })} triggerClassName="h-9 w-full">
                  <SelectItem value="Flex">Flex</SelectItem>
                  <SelectItem value="Tape">Tape</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                <Label htmlFor="new-run-length-feet" className="text-xs text-foreground/60 text-left">Length</Label>
                <div className="flex gap-2">
                  <div className="relative w-20 shrink-0">
                    <Input id="new-run-length-feet" data-testid="new-run-length-feet" type="number" min="0" placeholder="ft" value={newRun.feet} onChange={(e) => setNewRun({ ...newRun, feet: e.target.value })} onKeyDown={handleKeyDown} className="w-full pl-2 pr-7 h-9 text-sm" />
                    {newRun.feet && (
                      <span aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-foreground pointer-events-none">ft</span>
                    )}
                  </div>
                  <TabSelect id="new-run-length-inches" value={newRun.inches} onValueChange={(v) => setNewRun({ ...newRun, inches: v })} triggerClassName="w-20 h-9" placeholder="in" aria-label="Length inches">
                    {TAPE_INCH_OPTIONS.map(o => <SelectItem key={o} value={o}>{`${o}in`}</SelectItem>)}
                  </TabSelect>
                </div>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-cct" className="text-xs text-foreground/60 text-left">CCT</Label>
                <TabSelect id="new-run-cct" value={newRun.cct} onValueChange={(value) => setNewRun({ ...newRun, cct: value, tape_output: value === 'Warm Dim (30k-18k)' ? '360lm (3.6w/ft)' : newRun.tape_output })} triggerClassName="h-9 w-full" displayMap={{"Warm Dim (30k-18k)": "WD", "Tunable White (18k-40k)": "TW"}}>
                  <SelectItem value="2400k">2400k</SelectItem>
                  <SelectItem value="2700k">2700k</SelectItem>
                  <SelectItem value="3000k">3000k</SelectItem>
                  <SelectItem value="3500k">3500k</SelectItem>
                  <SelectItem value="Warm Dim (30k-18k)">Warm Dim (30k-18k)</SelectItem>
                  <SelectItem value="Tunable White (18k-40k)" disabled className="text-foreground/40">Tunable White (18k-40k)</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-output" className="text-xs text-foreground/60 text-left">Output</Label>
                <TabSelect id="new-run-output" value={newRun.tape_output} onValueChange={(value) => setNewRun({ ...newRun, tape_output: value })} triggerClassName="h-9 w-full" displayMap={{"300lm (3.0w/ft)": "300lm", "360lm (3.6w/ft)": "360lm", "600lm (6.0w/ft)": "600lm"}}>
                  <SelectItem value="300lm (3.0w/ft)" disabled={newRun.cct === 'Warm Dim (30k-18k)'} className={newRun.cct === 'Warm Dim (30k-18k)' ? 'text-foreground/40' : ''}>300lm (3.0w/ft)</SelectItem>
                  <SelectItem value="360lm (3.6w/ft)">360lm (3.6w/ft)</SelectItem>
                  <SelectItem value="600lm (6.0w/ft)" disabled={newRun.cct === 'Warm Dim (30k-18k)'} className={newRun.cct === 'Warm Dim (30k-18k)' ? 'text-foreground/40' : ''}>600lm (6.0w/ft)</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-housing" className="text-xs text-foreground/60 text-left">Housing</Label>
                <TabSelect id="new-run-housing" value={newRun.channel_type} onValueChange={(value) => setNewRun({ ...newRun, channel_type: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-lens" className="text-xs text-foreground/60 text-left">Lens</Label>
                <TabSelect id="new-run-lens" value={newRun.lens} onValueChange={(value) => setNewRun({ ...newRun, lens: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="Clear">Clear</SelectItem>
                  <SelectItem value="Frosted">Frosted</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-finish" className="text-xs text-foreground/60 text-left">Finish</Label>
                <TabSelect id="new-run-finish" value={newRun.finish} onValueChange={(value) => setNewRun({ ...newRun, finish: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="Aluminum">Aluminum</SelectItem>
                  <SelectItem value="Black">Black</SelectItem>
                  <SelectItem value="White">White</SelectItem>
                </TabSelect>
              </div>

              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <Label htmlFor="new-run-driver" className="text-xs text-foreground/60 text-left">Driver</Label>
                <TabSelect
                  id="new-run-driver"
                  value={newRun.driver_group}
                  onValueChange={(value) => {
                    // "__add__" sentinel: rep has no drivers yet and chose the
                    // inline "Add driver" option — create the default driver
                    // and assign this run to it in one click.
                    if (value === '__add__') {
                      const nextN = (drivers?.length || 0) + 1;
                      const newDriverName = `Driver ${nextN}`;
                      onDriversChange([
                        ...(drivers || []),
                        { id: String(Date.now()), name: newDriverName, maxWatts: 96 },
                      ]);
                      setNewRun({ ...newRun, driver_group: newDriverName });
                      return;
                    }
                    setNewRun({ ...newRun, driver_group: value });
                  }}
                  triggerClassName="h-9 w-full"
                >
                  {sortedDrivers.length === 0 ? (
                    <SelectItem value="__add__">+ Add driver</SelectItem>
                  ) : (
                    sortedDrivers.map(d => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))
                  )}
                </TabSelect>
              </div>
            </div>
          </div>
      </section>

      {/* Existing Runs — grouped by driver */}
      {localRuns.length > 0 && (
      <section data-section="runs" className="space-y-0 px-6 py-6 min-h-[152px]">
        <h3 className="text-xs uppercase tracking-wider text-foreground/50">Runs</h3>
        {(() => {
        const groups = [];
        for (const d of sortedDrivers) {
          const groupRuns = localRuns.filter(r => r.driver_group === d.name);
          if (groupRuns.length) groups.push({ key: d.name, label: d.name, runs: groupRuns });
        }
        const unassigned = localRuns.filter(r => !r.driver_group || !sortedDrivers.some(d => d.name === r.driver_group));
        if (unassigned.length) groups.push({ key: '__unassigned__', label: 'Unassigned', runs: unassigned });

        return (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key} data-testid="tape-run-group" data-group={group.key}>
                <div className="text-xs font-medium mb-1 px-1 text-right">{group.label}</div>
                <Droppable droppableId={group.key}>
                  {(provided) => (
                    <div
                      className="space-y-3"
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                    >
                      {group.runs.map((run, index) => (
                <Draggable key={String(run.id)} draggableId={String(run.id)} index={index}>
                  {(provided, snapshot) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      data-testid="tape-run-row"
                      data-run-id={run.id}
                      className={`shadow-none ${editingId === run.id || snapshot.isDragging ? 'bg-background border border-border' : 'bg-secondary/60 border-0'}`}
                      style={provided.draggableProps.style}
                    >
                      <CardContent className="p-4">
                        {editingId === run.id ? (
                          <div className="flex flex-wrap gap-2 items-end bg-background">
                            <div className="space-y-1">
                              <Label className="text-xs">Type</Label>
                              <Input value={editValues.run_name} onChange={e => setEditValues({...editValues, run_name: e.target.value})} className="h-8 w-16 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Location</Label>
                              <Input value={editValues.location} onChange={e => setEditValues({...editValues, location: e.target.value})} className="h-8 w-20 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Product</Label>
                              <TabSelect value={editValues.product_type} onValueChange={v => setEditValues({...editValues, product_type: v})} triggerClassName="h-8 w-20 text-xs">
                                <SelectItem value="Flex">Flex</SelectItem>
                                <SelectItem value="Tape">Tape</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Feet</Label>
                              <Input type="number" min="0" value={editValues.feet} onChange={e => setEditValues({...editValues, feet: e.target.value})} className="h-8 w-16 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Inches</Label>
                              <TabSelect value={editValues.inches} onValueChange={v => setEditValues({...editValues, inches: v})} triggerClassName="h-8 w-20 text-xs">
                                {TAPE_INCH_OPTIONS.map(o => <SelectItem key={o} value={o}>{`${o}in`}</SelectItem>)}
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Output</Label>
                              <TabSelect value={editValues.tape_output} onValueChange={v => setEditValues({...editValues, tape_output: v})} triggerClassName="h-8 w-24 text-xs">
                                <SelectItem value="300lm (3.0w/ft)" disabled={editValues.cct === 'Warm Dim (30k-18k)'} className={editValues.cct === 'Warm Dim (30k-18k)' ? 'text-foreground/40' : ''}>300lm (3.0w/ft)</SelectItem>
                                <SelectItem value="360lm (3.6w/ft)">360lm (3.6w/ft)</SelectItem>
                                <SelectItem value="600lm (6.0w/ft)" disabled={editValues.cct === 'Warm Dim (30k-18k)'} className={editValues.cct === 'Warm Dim (30k-18k)' ? 'text-foreground/40' : ''}>600lm (6.0w/ft)</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CCT</Label>
                              <TabSelect value={editValues.cct} onValueChange={v => setEditValues({...editValues, cct: v, tape_output: v === 'Warm Dim (30k-18k)' ? '360lm (3.6w/ft)' : editValues.tape_output})} triggerClassName="h-8 w-36 text-xs" displayMap={{"Warm Dim (30k-18k)": "WD", "Tunable White (18k-40k)": "TW"}}>
                                <SelectItem value="2400k">2400k</SelectItem>
                                <SelectItem value="2700k">2700k</SelectItem>
                                <SelectItem value="3000k">3000k</SelectItem>
                                <SelectItem value="3500k">3500k</SelectItem>
                                <SelectItem value="Warm Dim (30k-18k)">Warm Dim (30k-18k)</SelectItem>
                                <SelectItem value="Tunable White (18k-40k)" disabled className="text-foreground/40">Tunable White (18k-40k)</SelectItem>
                                </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Housing</Label>
                              <TabSelect value={editValues.channel_type} onValueChange={v => setEditValues({...editValues, channel_type: v})} triggerClassName="h-8 w-24 text-xs">
                                <SelectItem value="corner">Corner</SelectItem>
                                <SelectItem value="surface">Surface</SelectItem>
                                <SelectItem value="none">None</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Lens</Label>
                              <TabSelect value={editValues.lens} onValueChange={v => setEditValues({...editValues, lens: v})} triggerClassName="h-8 w-24 text-xs">
                                <SelectItem value="Clear">Clear</SelectItem>
                                <SelectItem value="Frosted">Frosted</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Finish</Label>
                              <TabSelect value={editValues.finish} onValueChange={v => setEditValues({...editValues, finish: v})} triggerClassName="h-8 w-24 text-xs">
                                <SelectItem value="Aluminum">Aluminum</SelectItem>
                                <SelectItem value="Black">Black</SelectItem>
                                <SelectItem value="White">White</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Driver</Label>
                              <TabSelect value={editValues.driver_group} onValueChange={v => setEditValues({...editValues, driver_group: v})} triggerClassName="h-8 w-28 text-xs">
                                {(drivers || []).map(d => (
                                  <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                ))}
                              </TabSelect>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-primary hover:text-primary/80" aria-label="Save run edit" data-testid="tape-run-save" onClick={() => {
                              onUpdate(run.id, {
                                run_name: editValues.run_name,
                                location: editValues.location,
                                length_feet: getSnappedFeet(editValues.feet, editValues.inches),
                                tape_output: editValues.tape_output,
                                product_type: editValues.product_type,
                                cct: editValues.cct,
                                channel_type: editValues.channel_type,
                                lens: editValues.lens,
                                finish: editValues.finish,
                                notes: editValues.notes,
                                driver_group: editValues.driver_group
                              });
                              setEditingId(null);
                            }}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-foreground/40 hover:text-foreground/70" aria-label="Cancel run edit" data-testid="tape-run-cancel" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                        <div className="flex items-center gap-2 overflow-x-auto">
                          <div
                            {...provided.dragHandleProps}
                            role="button"
                            aria-roledescription="Drag handle. Use the up and down buttons on the right for keyboard or agent-driven reordering."
                            aria-label={`Drag run ${index + 1}`}
                            className="w-6 shrink-0 cursor-grab active:cursor-grabbing text-foreground/40 hover:text-foreground/70"
                          >
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Type</div>
                            <div className="text-sm font-medium truncate">{run.run_name || 'Unnamed'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Location</div>
                            <div className="text-sm truncate">{run.location || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Product</div>
                            <div className="text-sm truncate">{run.product_type || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Length</div>
                            <div className="text-sm whitespace-nowrap">
                              {run.product_type === 'Tape'
                                ? formatSnapped(run.length_feet * 12)
                                : formatFeetInches(run.length_feet)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">CCT</div>
                            <div className="text-sm truncate">{run.cct === 'Warm Dim (30k-18k)' ? 'WD' : run.cct === 'Tunable White (18k-40k)' ? 'TW' : run.cct || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Output</div>
                            <div className="text-sm whitespace-nowrap">
                               {run.tape_output === '300lm (3.0w/ft)' ? '300lm' : run.tape_output === '360lm (3.6w/ft)' ? '360lm' : run.tape_output === '600lm (6.0w/ft)' ? '600lm' : run.tape_output || '—'}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Housing</div>
                            <div className="text-sm truncate">{formatChannelType(run.channel_type)}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Lens</div>
                            <div className="text-sm truncate">{run.lens || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Finish</div>
                            <div className="text-sm truncate">{run.finish || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Driver</div>
                            <div className="text-sm truncate">{run.driver_group || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <div className="text-xs text-foreground/60">Cost</div>
                            <div className="text-sm font-semibold whitespace-nowrap">${calculateRunFullCost(run, runs, drivers).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                          <div className="flex shrink-0 gap-0 items-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit run"
                              data-testid="tape-run-edit"
                              onClick={() => {
                                setEditingId(run.id);
                                setEditValues({
                                  run_name: run.run_name || '',
                                  location: run.location || '',
                                  feet: Math.floor(run.length_feet),
                                  inches: extractInchesOption(run.length_feet),
                                  tape_output: run.tape_output,
                                  product_type: run.product_type || '',
                                  cct: run.cct,
                                  channel_type: run.channel_type,
                                  lens: run.lens || '',
                                  finish: run.finish || '',
                                  notes: run.notes || '',
                                  driver_group: run.driver_group || ''
                                });
                              }}
                              className="h-8 w-8 text-foreground/40 hover:text-foreground/70"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                               variant="ghost"
                               size="icon"
                               aria-label="Duplicate run"
                               data-testid="tape-run-duplicate"
                               onClick={() => onDuplicate && onDuplicate(run)}
                               className="h-8 w-8 text-foreground/40 hover:text-foreground/70"
                             >
                               <Copy className="h-4 w-4" />
                             </Button>
                            <Button
                               variant="ghost"
                               size="icon"
                               aria-label="Delete run"
                               data-testid="tape-run-delete"
                               onClick={() => setDeleteConfirmId(run.id)}
                               className="h-8 w-8 text-foreground/40 hover:text-destructive"
                             >
                               <Trash2 className="h-4 w-4" />
                             </Button>
                          </div>
                        </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </DragDropContext>
        );
      })()}
      </section>
      )}

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tape run?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The tape run will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction
            onClick={() => {
              onDelete(deleteConfirmId);
              setDeleteConfirmId(null);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}