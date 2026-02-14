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
    length_feet: '',
    length_inches: '',
    tape_type: '3000k',
    channel_type: 'surface_mount',
    optic: 'frosted',
    output: '2w',
    notes: ''
  });

  const handleAdd = () => {
    const feet = parseFloat(newRun.length_feet) || 0;
    const inches = parseFloat(newRun.length_inches) || 0;
    const totalFeet = feet + (inches / 12);
    
    if (totalFeet > 0) {
      onAdd({ ...newRun, length_feet: totalFeet });
      setNewRun({
        run_name: '',
        length_feet: '',
        length_inches: '',
        tape_type: '3000k',
        channel_type: 'surface_mount',
        optic: 'frosted',
        output: '2w',
        notes: ''
      });
    }
  };

  const formatTapeType = (type) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatChannelType = (type) => {
    if (type === 'surface_mount') return 'Surface';
    if (type === 'recessed') return 'Recessed Flange';
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatOptic = (type) => {
    if (type === '25_degree_asymmetric') return '25° Asymmetric';
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatOutput = (type) => {
    if (type === '2w') return '2W/ft, 200lm/ft';
    if (type === '4w') return '4W/ft, 400lm/ft';
    return type;
  };

  const formatUSD = (amount) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const calculateRunCost = (run) => {
    const TAPE_SPECS = {
      '2700k': { price_per_foot: 12 },
      '3000k': { price_per_foot: 12 },
      '3500k': { price_per_foot: 12 },
      'warm_dim': { price_per_foot: 18 },
      'tunable_white': { price_per_foot: 24 },
      // Legacy values
      'standard_white': { price_per_foot: 12 },
      'standard_warm': { price_per_foot: 12 },
      'rgb': { price_per_foot: 18 },
      'rgbw': { price_per_foot: 24 },
      'high_output': { price_per_foot: 18 }
    };

    const CHANNEL_SPECS = {
      surface_mount: { price_per_foot: 8 },
      recessed: { price_per_foot: 12 },
      corner: { price_per_foot: 10 },
      none: { price_per_foot: 0 }
    };

    const tapeCost = run.length_feet * (TAPE_SPECS[run.tape_type]?.price_per_foot || 12);
    const channelCost = run.length_feet * (CHANNEL_SPECS[run.channel_type]?.price_per_foot || 0);
    return tapeCost + channelCost;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Tape Runs</h3>
        <span className="text-xs text-slate-500">
          Total: {runs.reduce((sum, r) => sum + r.length_feet, 0).toFixed(1)} ft
        </span>
      </div>

      {/* Add New Run */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Run Name</Label>
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
                step="1"
                min="0"
                value={newRun.length_feet}
                onChange={(e) => setNewRun({ ...newRun, length_feet: e.target.value })}
                placeholder="10"
                className="h-9"
              />
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Inches</Label>
              <Input
                type="number"
                step="2"
                min="0"
                max="11"
                value={newRun.length_inches}
                onChange={(e) => setNewRun({ ...newRun, length_inches: e.target.value })}
                placeholder="0"
                className="h-9"
              />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Color Temperature</Label>
              <Select
                value={newRun.tape_type}
                onValueChange={(value) => setNewRun({ ...newRun, tape_type: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2700k">2700K</SelectItem>
                  <SelectItem value="3000k">3000K</SelectItem>
                  <SelectItem value="3500k">3500K</SelectItem>
                  <SelectItem value="warm_dim">Warm Dim (2200K-3000K)</SelectItem>
                  <SelectItem value="tunable_white">Tunable White (2200K-3500K)</SelectItem>
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
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="surface_mount">Surface</SelectItem>
                  <SelectItem value="recessed">Recessed Flange</SelectItem>
                  <SelectItem value="corner">Corner</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Optic</Label>
              <Select
                value={newRun.optic}
                onValueChange={(value) => setNewRun({ ...newRun, optic: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="frosted">Frosted</SelectItem>
                  <SelectItem value="milky">Milky</SelectItem>
                  <SelectItem value="25_degree_asymmetric">25 Degree Asymmetric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1 space-y-1.5">
              <Label className="text-xs">Output</Label>
              <Select
                value={newRun.output}
                onValueChange={(value) => setNewRun({ ...newRun, output: value })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2w">2w/ft (200lm/ft)</SelectItem>
                  <SelectItem value="4w">4w/ft (400lm/ft)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-1">
              <Button onClick={handleAdd} size="sm" className="h-9 w-full hover:opacity-90" style={{ backgroundColor: '#e9ff64', color: '#000' }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Runs */}
      <div className="space-y-2">
        {runs.map((run) => (
          <Card key={run.id} className="border-slate-200">
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                 <Ruler className="h-4 w-4 text-slate-400" />
                 <div className="flex-1 grid grid-cols-7 gap-4">
                  <div>
                   <div className="text-xs text-slate-500">Run Name</div>
                   <div className="text-sm font-medium">{run.run_name || 'Unnamed Run'}</div>
                 </div>
                  <div>
                    <div className="text-xs text-slate-500">Length</div>
                    <div className="text-sm">
                      {Math.floor(run.length_feet)}' {Math.round((run.length_feet % 1) * 12)}"
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Color Temp</div>
                    <div className="text-sm">{formatTapeType(run.tape_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Housing</div>
                    <div className="text-sm">{formatChannelType(run.channel_type)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Optic</div>
                    <div className="text-sm">{formatOptic(run.optic || 'frosted')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Output</div>
                    <div className="text-sm">{formatOutput(run.output || '2w')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Cost</div>
                    <div className="text-sm font-medium">${formatUSD(calculateRunCost(run))}</div>
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

      {runs.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          No tape runs added yet. Add your first run above.
        </div>
      )}
    </div>
  );
}