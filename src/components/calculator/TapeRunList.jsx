import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Pencil, Check, X } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { TAPE_SPECS } from "@/components/calculator/constants";
import { calculateRunCost } from "@/components/calculator/calculations";
import DriverManager from "@/components/calculator/DriverManager";

// Shared class for native select elements to match the app's input styling
const selectCls = "h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const selectClsSm = "h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function TapeRunList({ runs, drivers, onDriversChange, onAdd, onUpdate, onDelete, onReorder }) {
  const [localRuns, setLocalRuns] = useState(runs);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [newRun, setNewRun] = useState({
    run_name: '', feet: '', inches: '', tape_type: '',
    location: '', cct: '', channel_type: '', lens: '', finish: '', notes: '', driver_group: ''
  });

  useEffect(() => { setLocalRuns(runs); }, [runs]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isFormValid()) handleAdd();
  };

  const handleAdd = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = Math.round((feet + (inches / 12)) * 100) / 100;
    if (!newRun.cct || !newRun.tape_type || !newRun.channel_type || totalFeet <= 0) return;
    onAdd({
      run_name: newRun.run_name, length_feet: totalFeet, tape_type: newRun.tape_type,
      location: newRun.location, cct: newRun.cct, channel_type: newRun.channel_type,
      lens: newRun.lens, finish: newRun.finish, notes: newRun.notes, driver_group: newRun.driver_group
    });
    setNewRun({ run_name: '', feet: '', inches: '', tape_type: '', location: '', cct: '', channel_type: '', lens: '', finish: '', notes: '', driver_group: '' });
  };

  const formatChannelType = (type) => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const handleDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reorderedRuns = Array.from(localRuns);
    const [movedRun] = reorderedRuns.splice(result.source.index, 1);
    reorderedRuns.splice(result.destination.index, 0, movedRun);
    setLocalRuns(reorderedRuns);
    setTimeout(() => onReorder(reorderedRuns), 0);
  };

  const isFormValid = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    return (feet + inches / 12) > 0 && newRun.cct && newRun.tape_type && newRun.channel_type;
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

      <DriverManager drivers={drivers || []} runs={localRuns} onDriversChange={onDriversChange} />

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
                <div className="w-32 shrink-0 text-xs text-slate-500">Length</div>
                <div className="w-28 shrink-0 text-xs text-slate-500">Output</div>
                <div className="w-28 shrink-0 text-xs text-slate-500">CCT</div>
                <div className="w-24 shrink-0 text-xs text-slate-500">Housing</div>
                <div className="w-24 shrink-0 text-xs text-slate-500">Lens</div>
                <div className="w-28 shrink-0 text-xs text-slate-500">Finish</div>
                <div className="w-24 shrink-0 text-xs text-slate-500">Driver</div>
                <div className="w-9 shrink-0" />
              </div>

              {/* Input row */}
              <div className="flex items-center gap-2">
                <div className="w-6 shrink-0" />

                {/* Type */}
                <div className="w-16 shrink-0">
                  <Input value={newRun.run_name} onChange={e => setNewRun({ ...newRun, run_name: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
                </div>

                {/* Location */}
                <div className="w-28 shrink-0">
                  <Input value={newRun.location} onChange={e => setNewRun({ ...newRun, location: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-full" />
                </div>

                {/* Length */}
                <div className="w-32 shrink-0 flex gap-1">
                  <Input type="number" min="0" placeholder="ft" value={newRun.feet} onChange={e => setNewRun({ ...newRun, feet: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-0 flex-1" />
                  <Input type="number" min="0" max="11" step="0.5" placeholder="in" value={newRun.inches} onChange={e => setNewRun({ ...newRun, inches: e.target.value })} onKeyDown={handleKeyDown} className="h-9 w-0 flex-1" />
                </div>

                {/* Output */}
                <div className="w-28 shrink-0">
                  <select value={newRun.tape_type} onChange={e => setNewRun({ ...newRun, tape_type: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    <option value="2w">2w/ft (200lm/ft)</option>
                    <option value="4w">4w/ft (400lm/ft)</option>
                  </select>
                </div>

                {/* CCT */}
                <div className="w-28 shrink-0">
                  <select value={newRun.cct} onChange={e => setNewRun({ ...newRun, cct: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    <option value="2400k">2400k</option>
                    <option value="2700k">2700k</option>
                    <option value="3000k">3000k</option>
                    <option value="3500k">3500k</option>
                    <option value="Warm Dim (22-30k)">Warm Dim (22-30k)</option>
                    <option value="Tunable White (18-40k)">Tunable White (18-40k)</option>
                  </select>
                </div>

                {/* Housing */}
                <div className="w-24 shrink-0">
                  <select value={newRun.channel_type} onChange={e => setNewRun({ ...newRun, channel_type: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    <option value="corner">Corner</option>
                    <option value="surface">Surface</option>
                    <option value="none">None</option>
                  </select>
                </div>

                {/* Lens */}
                <div className="w-24 shrink-0">
                  <select value={newRun.lens} onChange={e => setNewRun({ ...newRun, lens: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    <option value="Clear">Clear</option>
                    <option value="Frosted">Frosted</option>
                  </select>
                </div>

                {/* Finish */}
                <div className="w-28 shrink-0">
                  <select value={newRun.finish} onChange={e => setNewRun({ ...newRun, finish: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    <option value="Aluminum">Aluminum</option>
                    <option value="Black">Black</option>
                    <option value="White">White</option>
                  </select>
                </div>

                {/* Driver */}
                <div className="w-24 shrink-0">
                  <select value={newRun.driver_group} onChange={e => setNewRun({ ...newRun, driver_group: e.target.value })} className={selectCls}>
                    <option value="">—</option>
                    {(drivers || []).map(d => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Add button */}
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
            <div className="space-y-2" {...provided.droppableProps} ref={provided.innerRef}>
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
                              <Input value={editValues.run_name} onChange={e => setEditValues({ ...editValues, run_name: e.target.value })} className="h-8 w-16 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Location</Label>
                              <Input value={editValues.location} onChange={e => setEditValues({ ...editValues, location: e.target.value })} className="h-8 w-20 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Feet</Label>
                              <Input type="number" min="0" value={editValues.feet} onChange={e => setEditValues({ ...editValues, feet: e.target.value })} className="h-8 w-14 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Inches</Label>
                              <Input type="number" min="0" max="11" step="0.5" value={editValues.inches} onChange={e => setEditValues({ ...editValues, inches: e.target.value })} className="h-8 w-14 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Output</Label>
                              <select value={editValues.tape_type} onChange={e => setEditValues({ ...editValues, tape_type: e.target.value })} className={selectClsSm + " w-24"}>
                                <option value="">—</option>
                                <option value="2w">2w/ft (200lm/ft)</option>
                                <option value="4w">4w/ft (400lm/ft)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">CCT</Label>
                              <select value={editValues.cct} onChange={e => setEditValues({ ...editValues, cct: e.target.value })} className={selectClsSm + " w-36"}>
                                <option value="">—</option>
                                <option value="2400k">2400k</option>
                                <option value="2700k">2700k</option>
                                <option value="3000k">3000k</option>
                                <option value="3500k">3500k</option>
                                <option value="Warm Dim (22-30k)">Warm Dim (22-30k)</option>
                                <option value="Tunable White (18-40k)">Tunable White (18-40k)</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Housing</Label>
                              <select value={editValues.channel_type} onChange={e => setEditValues({ ...editValues, channel_type: e.target.value })} className={selectClsSm + " w-24"}>
                                <option value="">—</option>
                                <option value="corner">Corner</option>
                                <option value="surface">Surface</option>
                                <option value="none">None</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Lens</Label>
                              <select value={editValues.lens} onChange={e => setEditValues({ ...editValues, lens: e.target.value })} className={selectClsSm + " w-24"}>
                                <option value="">—</option>
                                <option value="Clear">Clear</option>
                                <option value="Frosted">Frosted</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Finish</Label>
                              <select value={editValues.finish} onChange={e => setEditValues({ ...editValues, finish: e.target.value })} className={selectClsSm + " w-24"}>
                                <option value="">—</option>
                                <option value="Aluminum">Aluminum</option>
                                <option value="Black">Black</option>
                                <option value="White">White</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Driver</Label>
                              <select value={editValues.driver_group} onChange={e => setEditValues({ ...editValues, driver_group: e.target.value })} className={selectClsSm + " w-28"}>
                                <option value="">—</option>
                                {(drivers || []).map(d => (
                                  <option key={d.id} value={d.name}>{d.name}</option>
                                ))}
                              </select>
                            </div>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700" onClick={() => {
                              onUpdate(run.id, {
                                run_name: editValues.run_name,
                                location: editValues.location,
                                length_feet: Math.round(((parseFloat(editValues.feet) || 0) + (parseFloat(editValues.inches) || 0) / 12) * 100) / 100,
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
                          <div className="flex items-center gap-2 overflow-x-auto">
                            <div {...provided.dragHandleProps} className="w-6 shrink-0 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600">
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
                            <div className="w-32 shrink-0">
                              <div className="text-xs text-slate-500">Length</div>
                              <div className="text-sm whitespace-nowrap">
                                {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                              </div>
                            </div>
                            <div className="w-28 shrink-0">
                              <div className="text-xs text-slate-500">Output</div>
                              <div className="text-sm whitespace-nowrap">
                                {(() => { const specs = TAPE_SPECS[run.tape_type]; return specs ? `${specs.watts_per_foot}w/ft` : '—'; })()}
                              </div>
                            </div>
                            <div className="w-28 shrink-0">
                              <div className="text-xs text-slate-500">CCT</div>
                              <div className="text-sm truncate">{run.cct || '—'}</div>
                            </div>
                            <div className="w-24 shrink-0">
                              <div className="text-xs text-slate-500">Housing</div>
                              <div className="text-sm truncate">{formatChannelType(run.channel_type)}</div>
                            </div>
                            <div className="w-24 shrink-0">
                              <div className="text-xs text-slate-500">Lens</div>
                              <div className="text-sm truncate">{run.lens || '—'}</div>
                            </div>
                            <div className="w-28 shrink-0">
                              <div className="text-xs text-slate-500">Finish</div>
                              <div className="text-sm truncate">{run.finish || '—'}</div>
                            </div>
                            <div className="w-24 shrink-0">
                              <div className="text-xs text-slate-500">Driver</div>
                              <div className="text-sm">{run.driver_group || '—'}</div>
                            </div>
                            <div className="w-14 shrink-0 text-right">
                              <div className="text-xs text-slate-500">Cost</div>
                              <div className="text-sm font-semibold whitespace-nowrap">${calculateRunCost(run).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                            <div className="flex shrink-0 gap-0 items-center w-16">
                              <Button variant="ghost" size="icon" onClick={() => {
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
                              }} className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => onDelete(run.id)} className="h-8 w-8 text-slate-400 hover:text-red-600">
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