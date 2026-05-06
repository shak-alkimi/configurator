import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Ruler, GripVertical, AlertCircle, Pencil, Check, X } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { TAPE_SPECS, CHANNEL_SPECS } from "@/components/calculator/constants";
import { calculateRunCost, calculateDriverGroups } from "@/components/calculator/calculations";
import DriverManager from "@/components/calculator/DriverManager";

export default function TapeRunList({ runs, drivers, onDriversChange, onAdd, onUpdate, onDelete, onReorder }) {
  const [localRuns, setLocalRuns] = useState(runs);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [newRun, setNewRun] = useState({
    run_name: '',
    feet: '',
    inches: '',
    tape_type: '',
    location: '',
    cct: '',
    channel_type: '',
    lens: '',
    finish: '',
    notes: '',
    driver_group: ''
  });

  useEffect(() => {
    setLocalRuns(runs);
  }, [runs]);

  const handleAdd = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = feet + (inches / 12);
    
    // Validation: all required fields must be filled
    if (!newRun.cct || !newRun.tape_type || !newRun.channel_type || totalFeet <= 0) {
      return;
    }
    
    onAdd({ 
      run_name: newRun.run_name,
      length_feet: totalFeet,
      tape_type: newRun.tape_type,
      location: newRun.location,
      cct: newRun.cct,
      channel_type: newRun.channel_type,
      lens: newRun.lens,
      finish: newRun.finish,
      notes: newRun.notes,
      driver_group: newRun.driver_group
    });
    setNewRun({
      run_name: '',
      feet: '',
      inches: '',
      tape_type: '',
      location: '',
      cct: '',
      channel_type: '',
      lens: '',
      finish: '',
      notes: '',
      driver_group: ''
    });
  };

  const formatTapeType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatChannelType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };



  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    
    const reorderedRuns = Array.from(localRuns);
    const [movedRun] = reorderedRuns.splice(result.source.index, 1);
    reorderedRuns.splice(result.destination.index, 0, movedRun);

    setLocalRuns(reorderedRuns);
    setTimeout(() => onReorder(reorderedRuns), 0);
  };

  // Check if form is valid (all required fields filled)
  const isFormValid = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = feet + (inches / 12);
    return totalFeet > 0 && newRun.cct && newRun.tape_type && newRun.channel_type;
  };

  const driverGroupData = calculateDriverGroups(localRuns, drivers);
  const driverGroupMap = Object.fromEntries(driverGroupData.map(g => [g.name, g]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-6">
        <h3 className="text-sm font-semibold" style={{ color: '#35790B' }}>Configure</h3>
        <span className="text-xs text-slate-500">
          Total: {(() => {
            const totalFeet = localRuns.reduce((sum, r) => sum + r.length_feet, 0);
            return `${Math.floor(totalFeet)}' ${Math.round((totalFeet % 1) * 12)}"`;
          })()}
        </span>
      </div>

      <DriverManager drivers={drivers || []} runs={localRuns} onDriversChange={onDriversChange} />

      {/* Add New Run */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          {/* Column headers */}
          <div className="flex items-center gap-3 w-full mb-1.5 px-0">
            <div className="w-6 shrink-0" />
            <div className="flex-1 min-w-0 text-xs text-slate-500">Type</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Location</div>
            <div className="w-32 shrink-0 text-xs text-slate-500">Length</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Output</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">CCT</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Housing</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Lens</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Finish</div>
            <div className="flex-1 min-w-0 text-xs text-slate-500">Driver</div>
          </div>
          {/* Input row */}
          <div className="flex items-center gap-3 w-full">
            <div className="w-6 shrink-0" />
            <div className="flex-1 min-w-0">
              <Input value={newRun.run_name} onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })} className="h-9 w-full" />
            </div>
            <div className="flex-1 min-w-0">
              <Input value={newRun.location} onChange={e => setNewRun({ ...newRun, location: e.target.value })} className="h-9 w-full" />
            </div>
            <div className="w-32 shrink-0 flex">
              <Input type="number" min="0" placeholder="ft" value={newRun.feet} onChange={(e) => setNewRun({ ...newRun, feet: e.target.value })} className="h-9 flex-1 min-w-0" />
              <Input type="number" min="0" max="11" step="0.5" placeholder="in" value={newRun.inches} onChange={(e) => setNewRun({ ...newRun, inches: e.target.value })} className="h-9 flex-1 min-w-0" />
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.tape_type} onValueChange={(value) => setNewRun({ ...newRun, tape_type: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2w">2w/ft (200lm/ft)</SelectItem>
                  <SelectItem value="4w">4w/ft (400lm/ft)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.cct} onValueChange={(value) => setNewRun({ ...newRun, cct: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="2400k">2400k</SelectItem>
                  <SelectItem value="2700k">2700k</SelectItem>
                  <SelectItem value="3000k">3000k</SelectItem>
                  <SelectItem value="3500k">3500k</SelectItem>
                  <SelectItem value="Warm Dim (22-30k)">Warm Dim (22-30k)</SelectItem>
                  <SelectItem value="Tunable White (18-40k)">Tunable White (18-40k)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.channel_type} onValueChange={(value) => setNewRun({ ...newRun, channel_type: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="recessed">Recessed Flange</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.lens} onValueChange={(value) => setNewRun({ ...newRun, lens: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Clear">Clear</SelectItem>
                  <SelectItem value="Frosted">Frosted</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.finish} onValueChange={(value) => setNewRun({ ...newRun, finish: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aluminum">Aluminum</SelectItem>
                  <SelectItem value="Black">Black</SelectItem>
                  <SelectItem value="White">White</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-0">
              <Select value={newRun.driver_group} onValueChange={(value) => setNewRun({ ...newRun, driver_group: value })}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(drivers || []).map(d => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Add + placeholder to match [edit][delete] */}
            <div className="flex items-center shrink-0">
              <Button onClick={handleAdd} size="icon" variant="ghost" className="h-8 w-8" disabled={!isFormValid()}>
                <Plus className="h-4 w-4" />
              </Button>
              <div className="h-8 w-8" />
            </div>
          </div>
          {!isFormValid() && (newRun.feet || newRun.inches || newRun.tape_type || newRun.cct || newRun.channel_type) && (
            <div className="flex items-center gap-2 text-xs text-amber-600 mt-2">
              <AlertCircle className="h-4 w-4" />
              <span>Please fill in all required fields (length, output, CCT, housing)</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing Runs */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="runs">
          {(provided) => (
            <div 
              className="space-y-2"
              {...provided.droppableProps}
              ref={provided.innerRef}
            >
              {localRuns.map((run, index) => (
                <Draggable key={String(run.id)} draggableId={String(run.id)} index={index}>
                  {(provided, snapshot) => (
                    <Card 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="border-slate-200" 
                      style={{ 
                        backgroundColor: editingId === run.id ? '#ffffff' : (snapshot.isDragging ? '#ffffff' : '#eeeeee'),
                        ...provided.draggableProps.style 
                      }}
                    >
                      <CardContent className="py-3">
                        {editingId === run.id ? (
                          <div className="flex flex-wrap gap-2 items-end bg-white">
                            <div className="space-y-1">
                              <Label className="text-xs">Type</Label>
                              <Input value={editValues.run_name} onChange={e => setEditValues({...editValues, run_name: e.target.value})} className="h-8 w-16 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Location</Label>
                              <Input value={editValues.location} onChange={e => setEditValues({...editValues, location: e.target.value})} className="h-8 w-20 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Feet</Label>
                              <Input type="number" min="0" value={editValues.feet} onChange={e => setEditValues({...editValues, feet: e.target.value})} className="h-8 w-14 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Inches</Label>
                              <Input type="number" min="0" max="11" step="0.5" value={editValues.inches} onChange={e => setEditValues({...editValues, inches: e.target.value})} className="h-8 w-14 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Output</Label>
                              <Select value={editValues.tape_type} onValueChange={v => setEditValues({...editValues, tape_type: v})}>
                                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="2w">2w/ft (200lm/ft)</SelectItem>
                                  <SelectItem value="4w">4w/ft (400lm/ft)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CCT</Label>
                              <Select value={editValues.cct} onValueChange={v => setEditValues({...editValues, cct: v})}>
                                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="2400k">2400k</SelectItem>
                                  <SelectItem value="2700k">2700k</SelectItem>
                                  <SelectItem value="3000k">3000k</SelectItem>
                                  <SelectItem value="3500k">3500k</SelectItem>
                                  <SelectItem value="Warm Dim (22-30k)">Warm Dim (22-30k)</SelectItem>
                                  <SelectItem value="Tunable White (18-40k)">Tunable White (18-40k)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Housing</Label>
                              <Select value={editValues.channel_type} onValueChange={v => setEditValues({...editValues, channel_type: v})}>
                                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="corner">Corner</SelectItem>
                                  <SelectItem value="recessed">Recessed Flange</SelectItem>
                                  <SelectItem value="surface">Surface</SelectItem>
                                  <SelectItem value="none">None</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Lens</Label>
                              <Select value={editValues.lens} onValueChange={v => setEditValues({...editValues, lens: v})}>
                                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Clear">Clear</SelectItem>
                                  <SelectItem value="Frosted">Frosted</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Finish</Label>
                              <Select value={editValues.finish} onValueChange={v => setEditValues({...editValues, finish: v})}>
                                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Aluminum">Aluminum</SelectItem>
                                  <SelectItem value="Black">Black</SelectItem>
                                  <SelectItem value="White">White</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Driver</Label>
                              <Select value={editValues.driver_group} onValueChange={v => setEditValues({...editValues, driver_group: v})}>
                                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(drivers || []).map(d => (
                                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => {
                              onUpdate(run.id, {
                                run_name: editValues.run_name,
                                location: editValues.location,
                                length_feet: (parseFloat(editValues.feet) || 0) + (parseFloat(editValues.inches) || 0) / 12,
                                tape_type: editValues.tape_type,
                                cct: editValues.cct,
                                channel_type: editValues.channel_type,
                                lens: editValues.lens,
                                finish: editValues.finish,
                                driver_group: editValues.driver_group
                              });
                              setEditingId(null);
                            }}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-slate-600" onClick={() => setEditingId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                        <div className="flex items-center gap-3 w-full">
                          <div 
                            {...provided.dragHandleProps}
                            className="w-6 shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
                          >
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Type</div>
                            <div className="text-sm font-medium truncate">{run.run_name || 'Unnamed'}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Location</div>
                            <div className="text-sm truncate">{run.location || '—'}</div>
                          </div>
                          <div className="w-32 shrink-0">
                            <div className="text-xs text-slate-500">Length</div>
                            <div className="text-sm whitespace-nowrap">
                              {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Output</div>
                            <div className="text-sm whitespace-nowrap">
                              {(() => {
                                const specs = TAPE_SPECS[run.tape_type];
                                if (!specs) return '—';
                                return `${specs.watts_per_foot}w/ft`;
                              })()}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">CCT</div>
                            <div className="text-sm truncate">{run.cct || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Housing</div>
                            <div className="text-sm truncate">{formatChannelType(run.channel_type)}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Lens</div>
                            <div className="text-sm truncate">{run.lens || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Finish</div>
                            <div className="text-sm truncate">{run.finish || '—'}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-500">Driver</div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm">{run.driver_group || '—'}</span>
                              {run.driver_group && driverGroupMap[run.driver_group]?.overloaded && (
                                <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                              )}
                            </div>
                          </div>
                          <div className="w-14 shrink-0 text-right">
                            <div className="text-xs text-slate-500">Cost</div>
                            <div className="text-sm font-semibold whitespace-nowrap">${calculateRunCost(run).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                          <div className="flex shrink-0 gap-0 items-center w-16">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingId(run.id);
                                setEditValues({
                                  run_name: run.run_name || '',
                                  location: run.location || '',
                                  feet: Math.floor(run.length_feet),
                                  inches: Math.round((run.length_feet % 1) * 12),
                                  tape_type: run.tape_type,
                                  cct: run.cct,
                                  channel_type: run.channel_type,
                                  lens: run.lens || '',
                                  finish: run.finish || '',
                                  driver_group: run.driver_group || ''
                                });
                              }}
                              className="h-8 w-8 text-slate-400 hover:text-slate-600"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => onDelete(run.id)}
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
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
      </DragDropContext>
    </div>
  );
}