import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Ruler } from "lucide-react";

export default function TapeRunList({ runs, onAdd, onUpdate, onDelete }) {
  const [newRun, setNewRun] = useState({
    run_name: '',
    feet: '',
    inches: '',
    tape_type: '2400k',
    channel_type: 'corner',
    notes: ''
  });

  const handleAdd = () => {
    const feet = parseFloat(newRun.feet) || 0;
    const inches = parseFloat(newRun.inches) || 0;
    const totalFeet = feet + (inches / 12);
    
    if (totalFeet > 0) {
      onAdd({ 
        run_name: newRun.run_name,
        length_feet: totalFeet,
        tape_type: newRun.tape_type,
        channel_type: newRun.channel_type,
        notes: newRun.notes
      });
      setNewRun({
        run_name: '',
        feet: '',
        inches: '',
        tape_type: '2400k',
        channel_type: 'corner',
        notes: ''
      });
    }
  };

  const formatTapeType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatChannelType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-4">
      <div></div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Runs</h3>
        <span className="text-xs text-slate-500">
          Total: {runs.reduce((sum, r) => sum + r.length_feet, 0).toFixed(1)} ft
        </span>
      </div>

      {/* Add New Run */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-3 space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Input
                value={newRun.run_name}
                onChange={(e) => setNewRun({ ...newRun, run_name: e.target.value })}
                placeholder="Under Cabinet"
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
                placeholder="10"
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
                placeholder="6"
                className="h-9"
              />
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label className="text-xs">Tape Type</Label>
              <Select
                value={newRun.tape_type}
                onValueChange={(value) => setNewRun({ ...newRun, tape_type: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2400k">2400K</SelectItem>
                  <SelectItem value="2700k">2700K</SelectItem>
                  <SelectItem value="3000k">3000K</SelectItem>
                  <SelectItem value="warm_dim">Warm Dim (2200K - 3000K)</SelectItem>
                  <SelectItem value="tunable_white">Tunable White (2200K - 3500K)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3 space-y-1.5">
              <Label className="text-xs">Housing</Label>
              <Select
                value={newRun.channel_type}
                onValueChange={(value) => setNewRun({ ...newRun, channel_type: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="recessed">Recessed</SelectItem>
                  <SelectItem value="surface">Surface</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1">
              <Button onClick={handleAdd} size="sm" className="h-9 w-full">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Runs */}
      <div className="space-y-2">
        {runs.map((run) => (
          <Card key={run.id} className="border-slate-200" style={{ backgroundColor: '#EEEEEE' }}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                   <div className="flex-1 grid grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm font-medium">{run.run_name || 'Unnamed Run'}</div>
                      <div className="text-xs text-slate-500">
                        {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Tape Type</div>
                      <div className="text-sm">{formatTapeType(run.tape_type)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Housing</div>
                      <div className="text-sm">{formatChannelType(run.channel_type)}</div>
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
        ))}
      </div>


    </div>
  );
}