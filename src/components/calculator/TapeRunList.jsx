import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectItem } from "@/components/ui/select";
import TabSelect from "@/components/calculator/TabSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { TAPE_SPECS, CHANNEL_SPECS } from "@/components/calculator/constants";
import { calculateRunCost } from "@/components/calculator/calculations";
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
    product_type: '',
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isFormValid()) {
      handleAdd();
    }
  };

  const handleAdd = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = Math.round((feet + (inches / 12)) * 100) / 100;
    
    if (!newRun.cct || !newRun.tape_type || !newRun.channel_type || totalFeet <= 0) {
      return;
    }
    
    onAdd({ 
      run_name: newRun.run_name,
      length_feet: totalFeet,
      tape_type: newRun.tape_type,
      product_type: newRun.product_type,
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
      product_type: '',
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

  const isFormValid = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = feet + (inches / 12);
    return totalFeet > 0 && newRun.cct && newRun.tape_type && newRun.channel_type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-6">
        <h3 className="text-sm font-semibold" style={{ color: '#252320' }}>Alkiline</h3>
        <span className="text-xs text-slate-500">
          Total: {(() => {
            const totalFeet = localRuns.reduce((sum, r) => sum + r.length_feet, 0);
            return `${Math.floor(totalFeet)}' ${Math.round((totalFeet % 1) * 12)}"`;
          })()}
        </span>
      </div>

      <DriverManager
        drivers={drivers || []}
        runs={localRuns}
        onDriversChange={onDriversChange}
      />

      {/* Add New Run */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4 overflow-x-auto">
          <div className="flex justify-center">
          <div className="min-w-max">
            {/* Column headers */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-6 shrink-0" />
              <div className="w-16 shrink-0 text-xs text-slate-500">Type</div>
              <div className="w-28 shrink-0 text-xs text-slate-500">Location</div>
              <div className="w-24 shrink-0 text-xs text-slate-500">Product</div>
              <div className="w-32 shrink-0 text-xs text-slate-500">Length</div>
              <div className="w-20 shrink-0 text-xs text-slate-500">CCT</div>
              <div className="w-20 shrink-0 text-xs text-slate-500">Output</div>
              <div className="w-20 shrink-0 text-xs text-slate-500">Housing</div>
              <div className="w-16 shrink-0 text-xs text-slate-500">Lens</div>
              <div className="w-20 shrink-0 text-xs text-slate-500">Finish</div>
              <div className="w-20 shrink-0 text-xs text-slate-500">Driver</div>
              <div className="w-9 shrink-0" />
            </div>
            {/* Input row */}
            <div className="flex items-center gap-2">
              <div className="w-6 shrink-0" />
              <div className="w-16 shrink-0">
                <Input value={newRun.run_name} onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
              </div>
              <div className="w-28 shrink-0">
                <Input value={newRun.location} onChange={e => setNewRun({ ...newRun, location: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
              </div>
              <div className="w-24 shrink-0">
                <TabSelect value={newRun.product_type} onValueChange={(value) => setNewRun({ ...newRun, product_type: value, tape_type: '' })} triggerClassName="h-9 w-full">
                  <SelectItem value="Flex">Flex</SelectItem>
                  <SelectItem value="Tape">Tape</SelectItem>
                </TabSelect>
              </div>
              <div className="w-32 shrink-0 flex gap-1">
                <Input type="number" min="0" placeholder="ft" value={newRun.feet} onChange={(e) => setNewRun({ ...newRun, feet: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-0 flex-1" />
                <Input type="number" min="0" max="11" step="0.5" placeholder="in" value={newRun.inches} onChange={(e) => setNewRun({ ...newRun, inches: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-0 flex-1" />
              </div>
              <div className="w-20 shrink-0">
                <TabSelect value={newRun.cct} onValueChange={(value) => setNewRun({ ...newRun, cct: value })} triggerClassName="h-9 w-full" displayMap={{"Warm Dim (30k-18k)": "WD", "Tunable White (18k-40k)": "TW"}}>
                  <SelectItem value="2400k">2400k</SelectItem>
                  <SelectItem value="2700k">2700k</SelectItem>
                  <SelectItem value="3000k">3000k</SelectItem>
                  <SelectItem value="3500k">3500k</SelectItem>
                  <SelectItem value="Warm Dim (30k-18k)">Warm Dim (30k-18k)</SelectItem>
                  <SelectItem value="Tunable White (18k-40k)" disabled className="text-slate-400">Tunable White (18k-40k)</SelectItem>
                </TabSelect>
              </div>
              <div className="w-20 shrink-0">
                <TabSelect value={newRun.tape_type} onValueChange={(value) => setNewRun({ ...newRun, tape_type: value })} triggerClassName="h-9 w-full" displayMap={{"300lm (3w/ft)": "300lm", "360lm (3.6w/ft)": "360lm", "600lm (6w/ft)": "600lm"}}>
                  <SelectItem value="300lm (3w/ft)">300lm (3w/ft)</SelectItem>
                  <SelectItem value="360lm (3.6w/ft)">360lm (3.6w/ft)</SelectItem>
                  <SelectItem value="600lm (6w/ft)">600lm (6w/ft)</SelectItem>
                </TabSelect>
              </div>
              <div className="w-20 shrink-0">
                <TabSelect value={newRun.channel_type} onValueChange={(value) => setNewRun({ ...newRun, channel_type: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </TabSelect>
              </div>
              <div className="w-16 shrink-0">
                <TabSelect value={newRun.lens} onValueChange={(value) => setNewRun({ ...newRun, lens: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="Clear">Clear</SelectItem>
                  <SelectItem value="Frosted">Frosted</SelectItem>
                </TabSelect>
              </div>
              <div className="w-20 shrink-0">
                <TabSelect value={newRun.finish} onValueChange={(value) => setNewRun({ ...newRun, finish: value })} triggerClassName="h-9 w-full">
                  <SelectItem value="Aluminum">Aluminum</SelectItem>
                  <SelectItem value="Black">Black</SelectItem>
                  <SelectItem value="White">White</SelectItem>
                </TabSelect>
              </div>
              <div className="w-20 shrink-0">
                <TabSelect value={newRun.driver_group} onValueChange={(value) => setNewRun({ ...newRun, driver_group: value })} triggerClassName="h-9 w-full">
                  {(drivers || []).map(d => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </TabSelect>
              </div>
              <div className="shrink-0">
                <Button
                  onClick={handleAdd}
                  size="icon"
                  className={`h-9 w-9 rounded ${!isFormValid() ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#3A5F3A] text-white hover:bg-[#2d4a2d]'}`}
                  disabled={!isFormValid()}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
                              <Label className="text-xs">Product</Label>
                              <TabSelect value={editValues.product_type} onValueChange={v => setEditValues({...editValues, product_type: v})} triggerClassName="h-8 w-20 text-xs">
                                <SelectItem value="Flex">Flex</SelectItem>
                                <SelectItem value="Tape">Tape</SelectItem>
                              </TabSelect>
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
                              <TabSelect value={editValues.tape_type} onValueChange={v => setEditValues({...editValues, tape_type: v})} triggerClassName="h-8 w-24 text-xs">
                                <SelectItem value="300lm (3w/ft)">300lm (3w/ft)</SelectItem>
                                <SelectItem value="360lm (3.6w/ft)">360lm (3.6w/ft)</SelectItem>
                                <SelectItem value="600lm (6w/ft)">600lm (6w/ft)</SelectItem>
                              </TabSelect>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CCT</Label>
                              <TabSelect value={editValues.cct} onValueChange={v => setEditValues({...editValues, cct: v})} triggerClassName="h-8 w-36 text-xs" displayMap={{"Warm Dim (30k-18k)": "WD", "Tunable White (18k-40k)": "TW"}}>
                                <SelectItem value="2400k">2400k</SelectItem>
                                <SelectItem value="2700k">2700k</SelectItem>
                                <SelectItem value="3000k">3000k</SelectItem>
                                <SelectItem value="3500k">3500k</SelectItem>
                                <SelectItem value="Warm Dim (30k-18k)">Warm Dim (30k-18k)</SelectItem>
                                <SelectItem value="Tunable White (18k-40k)" disabled className="text-slate-400">Tunable White (18k-40k)</SelectItem>
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
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => {
                              onUpdate(run.id, {
                                run_name: editValues.run_name,
                                location: editValues.location,
                                length_feet: Math.round(((parseFloat(editValues.feet) || 0) + (parseFloat(editValues.inches) || 0) / 12) * 100) / 100,
                                tape_type: editValues.tape_type,
                                product_type: editValues.product_type,
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
                        <div className="flex items-center gap-2 overflow-x-auto">
                          <div 
                            {...provided.dragHandleProps}
                            className="w-6 shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
                          >
                            <GripVertical className="h-5 w-5" />
                          </div>
                          <div className="w-16 shrink-0">
                            <div className="text-xs text-slate-500">Type</div>
                            <div className="text-sm font-medium truncate">{run.run_name || 'Unnamed'}</div>
                          </div>
                          <div className="w-28 shrink-0">
                            <div className="text-xs text-slate-500">Location</div>
                            <div className="text-sm truncate">{run.location || '—'}</div>
                          </div>
                          <div className="w-24 shrink-0">
                            <div className="text-xs text-slate-500">Product</div>
                            <div className="text-sm truncate">{run.product_type || '—'}</div>
                          </div>
                          <div className="w-32 shrink-0">
                            <div className="text-xs text-slate-500">Length</div>
                            <div className="text-sm whitespace-nowrap">
                              {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                            </div>
                          </div>
                          <div className="w-20 shrink-0">
                            <div className="text-xs text-slate-500">CCT</div>
                            <div className="text-sm truncate">{run.cct === 'Warm Dim (30k-18k)' ? 'WD' : run.cct === 'Tunable White (18k-40k)' ? 'TW' : run.cct || '—'}</div>
                          </div>
                          <div className="w-20 shrink-0">
                            <div className="text-xs text-slate-500">Output</div>
                            <div className="text-sm whitespace-nowrap">
                               {run.tape_type === '300lm (3w/ft)' ? '300lm' : run.tape_type === '360lm (3.6w/ft)' ? '360lm' : run.tape_type === '600lm (6w/ft)' ? '600lm' : run.tape_type || '—'}
                            </div>
                          </div>
                          <div className="w-20 shrink-0">
                            <div className="text-xs text-slate-500">Housing</div>
                            <div className="text-sm truncate">{formatChannelType(run.channel_type)}</div>
                          </div>
                          <div className="w-16 shrink-0">
                            <div className="text-xs text-slate-500">Lens</div>
                            <div className="text-sm truncate">{run.lens || '—'}</div>
                          </div>
                          <div className="w-20 shrink-0">
                            <div className="text-xs text-slate-500">Finish</div>
                            <div className="text-sm truncate">{run.finish || '—'}</div>
                          </div>
                          <div className="w-20 shrink-0">
                            <div className="text-xs text-slate-500">Driver</div>
                            <div className="text-sm">{run.driver_group || '—'}</div>
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
                                  product_type: run.product_type || '',
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