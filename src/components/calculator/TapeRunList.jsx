import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Ruler, GripVertical, AlertCircle } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { TAPE_SPECS, CHANNEL_SPECS } from "@/components/calculator/constants";
import { calculateRunCost, calculateDriverGroups } from "@/components/calculator/calculations";

export default function TapeRunList({ runs, onAdd, onUpdate, onDelete, onReorder }) {
  const [localRuns, setLocalRuns] = useState(runs);
  const [newRun, setNewRun] = useState({
    run_name: '',
    feet: '',
    inches: '',
    tape_type: '',
    location: '',
    cct: '',
    channel_type: '',
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

  const driverGroupData = calculateDriverGroups(localRuns);
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

      {/* Add New Run */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Input
                value={newRun.run_name}
                onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Feet</Label>
              <Input
                type="number"
                min="0"
                value={newRun.feet}
                onChange={(e) => setNewRun({ ...newRun, feet: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Inches</Label>
              <Input
                type="number"
                min="0"
                max="11"
                step="0.5"
                value={newRun.inches}
                onChange={(e) => setNewRun({ ...newRun, inches: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Output</Label>
              <Select
                value={newRun.tape_type}
                onValueChange={(value) => setNewRun({ ...newRun, tape_type: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2w">2w/ft (200lm/ft)</SelectItem>
                  <SelectItem value="4w">4w/ft (400lm/ft)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Location</Label>
              <input
                placeholder="Location"
                value={newRun.location}
                onChange={e => setNewRun({ ...newRun, location: e.target.value })}
                className="w-full text-xs border border-input rounded px-2 py-0.5 bg-background h-9"
              />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label className="text-xs">CCT</Label>
              <Select
                value={newRun.cct}
                onValueChange={(value) => setNewRun({ ...newRun, cct: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="" />
                </SelectTrigger>
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
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Housing</Label>
              <Select
                value={newRun.channel_type}
                onValueChange={(value) => setNewRun({ ...newRun, channel_type: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="recessed">Recessed Flange</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Driver</Label>
              <Input
                value={newRun.driver_group}
                onChange={(e) => setNewRun({ ...newRun, driver_group: e.target.value })}
                placeholder="Driver 1"
                className="w-16 text-xs h-9"
              />
            </div>
            <div className="col-span-1">
              <Button onClick={handleAdd} size="sm" className="h-9 w-full" disabled={!isFormValid()}>
                <Plus className="h-4 w-4" />
              </Button>
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
                        backgroundColor: snapshot.isDragging ? '#ffffff' : '#eeeeee',
                        ...provided.draggableProps.style 
                      }}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <div 
                              {...provided.dragHandleProps}
                              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
                            >
                              <GripVertical className="h-5 w-5" />
                            </div>
                            <div className="flex-1 flex items-start gap-3 min-w-0 flex-nowrap">
                              <div className="min-w-0 w-16 shrink-0">
                                <div className="text-xs text-slate-500">Type</div>
                                <div className="text-sm font-medium truncate">{run.run_name || 'Unnamed'}</div>
                              </div>
                              <div className="w-14 shrink-0">
                                <div className="text-xs text-slate-500">Length</div>
                                <div className="text-sm whitespace-nowrap">
                                  {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                                </div>
                              </div>
                              <div className="w-24 shrink-0">
                                <div className="text-xs text-slate-500">Output</div>
                                <div className="text-sm whitespace-nowrap">
                                  {(() => {
                                    const specs = TAPE_SPECS[run.tape_type];
                                    if (!specs) return '—';
                                    return `${specs.watts_per_foot}w/ft`;
                                  })()}
                                </div>
                              </div>
                              <div className="w-20 shrink-0">
                                <div className="text-xs text-slate-500">Location</div>
                                <input
                                  defaultValue={run.location || ''}
                                  key={run.id + '-' + run.location}
                                  onBlur={(e) => onUpdate(run.id, { location: e.target.value })}
                                  className="shrink-0 w-20 text-xs border border-input rounded px-1 py-0.5 bg-background"
                                />
                              </div>
                              <div className="w-24 shrink-0">
                                <div className="text-xs text-slate-500">CCT</div>
                                <div className="text-sm whitespace-nowrap">{run.cct || '—'}</div>
                              </div>
                              <div className="w-20 shrink-0">
                                <div className="text-xs text-slate-500">Housing</div>
                                <div className="text-sm whitespace-nowrap">{formatChannelType(run.channel_type)}</div>
                              </div>
                              <div className="w-20 shrink-0">
                                <div className="text-xs text-slate-500">Driver</div>
                                <div className="flex items-center gap-1">
                                  <input
                                    defaultValue={run.driver_group || ''}
                                    key={run.id + '-' + run.driver_group}
                                    onBlur={(e) => {
                                      if (e.target.value !== (run.driver_group || '')) {
                                        onUpdate(run.id, { driver_group: e.target.value });
                                      }
                                    }}
                                    placeholder="Driver 1"
                                    className="w-14 text-xs border border-input rounded px-1 py-0.5 bg-background"
                                  />
                                  {run.driver_group && driverGroupMap[run.driver_group]?.overloaded && (
                                    <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-xs text-slate-500">Cost</div>
                                <div className="text-sm font-semibold whitespace-nowrap">${calculateRunCost(run).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onDelete(run.id)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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