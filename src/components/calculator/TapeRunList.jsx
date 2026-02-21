import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Ruler, GripVertical } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const TAPE_SPECS = {
  "2w": { price_per_foot: 10, watts_per_foot: 2.0, lumens_per_foot: 200 },
  "4w": { price_per_foot: 12, watts_per_foot: 4.0, lumens_per_foot: 400 }
};

const CHANNEL_SPECS = {
  corner: { price_per_foot: 10 },
  recessed: { price_per_foot: 12 },
  surface: { price_per_foot: 8 },
  none: { price_per_foot: 0 }
};

export default function TapeRunList({ runs, onAdd, onUpdate, onDelete, onReorder }) {
  const [newRun, setNewRun] = useState({
    run_name: '',
    location: '',
    feet: '',
    inches: '',
    tape_type: '',
    cct: '',
    channel_type: '',
    notes: ''
  });

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
      location: newRun.location,
      length_feet: totalFeet,
      tape_type: newRun.tape_type,
      cct: newRun.cct,
      channel_type: newRun.channel_type,
      notes: newRun.notes
    });
    setNewRun({
      run_name: '',
      location: '',
      feet: '',
      inches: '',
      tape_type: '',
      cct: '',
      channel_type: '',
      notes: ''
    });
  };

  const formatTapeType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatChannelType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const calculateRunCost = (run) => {
    const tapeSpec = TAPE_SPECS[run.tape_type];
    const channelSpec = CHANNEL_SPECS[run.channel_type];
    
    if (!tapeSpec || !channelSpec) return 0;
    
    const tapeCost = run.length_feet * tapeSpec.price_per_foot;
    const channelCost = run.length_feet * channelSpec.price_per_foot;
    return tapeCost + channelCost;
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;
    
    const reorderedRuns = Array.from(runs);
    const [movedRun] = reorderedRuns.splice(result.source.index, 1);
    reorderedRuns.splice(result.destination.index, 0, movedRun);
    
    onReorder(reorderedRuns);
  };

  // Check if form is valid (all required fields filled)
  const isFormValid = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = feet + (inches / 12);
    return totalFeet > 0 && newRun.cct && newRun.tape_type && newRun.channel_type;
  };

  return (
    <div className="space-y-4">
      <div></div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: '#D4AF37' }}>ALKILINE</h3>
        <span className="text-xs text-slate-500">
          Total: {(() => {
            const totalFeet = runs.reduce((sum, r) => sum + r.length_feet, 0);
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
               <Label className="text-xs">Location</Label>
               <Input
                 value={newRun.location}
                 onChange={(e) => setNewRun({ ...newRun, location: e.target.value })}
                 className="h-9"
                 placeholder="e.g., Kitchen"
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
            <div className="col-span-1">
              <Button onClick={handleAdd} size="sm" className="h-9 w-full" disabled={!isFormValid()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
              {runs.map((run, index) => (
                <Draggable key={run.id} draggableId={run.id} index={index}>
                  {(provided, snapshot) => (
                    <Card 
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className="border-slate-200" 
                      style={{ 
                        backgroundColor: '#eeeeee',
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
                            <div className="flex-1 grid grid-cols-12 gap-4">
                              <div className="col-span-1">
                                <div className="text-xs text-slate-500">Type</div>
                                <div className="text-sm font-medium">{run.run_name || 'Unnamed Run'}</div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-xs text-slate-500">Location</div>
                                <div className="text-sm">{run.location || '—'}</div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-xs text-slate-500">Length</div>
                                <div className="text-sm">
                                  {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                                </div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-xs text-slate-500">Output</div>
                                <div className="text-sm">
                                  {(() => {
                                    const specs = TAPE_SPECS[run.tape_type];
                                    if (!specs) return '—';
                                    return `${specs.watts_per_foot}w/ft (${specs.lumens_per_foot}lm/ft)`;
                                  })()}
                                </div>
                              </div>
                              <div className="col-span-3">
                                <div className="text-xs text-slate-500">CCT</div>
                                <div className="text-sm">{run.cct || '—'}</div>
                              </div>
                              <div className="col-span-2">
                                <div className="text-xs text-slate-500">Housing</div>
                                <div className="text-sm">{formatChannelType(run.channel_type)}</div>
                              </div>
                              <div className="col-span-1 text-right">
                                <div className="text-xs text-slate-500">Cost</div>
                                <div className="text-sm font-semibold">${calculateRunCost(run).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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