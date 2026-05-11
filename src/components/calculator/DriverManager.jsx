import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

const WATTS_PER_FOOT = { "300lm (3.0w/ft)": 3.0, "360lm (3.6w/ft)": 3.6, "600lm (6.0w/ft)": 6.0 };

function getDriverWatts(driver, runs) {
  let total = 0;
  const assignedIds = new Set(driver.assigned_runs || []);
  for (const run of (runs || [])) {
    if (!assignedIds.has(run.id)) continue;
    if (!run.tape_output || !run.length_feet) continue;
    const wpf = WATTS_PER_FOOT[run.tape_output];
    if (wpf == null) continue;
    total += run.length_feet * wpf;
  }
  return total;
}

function DriverRow({ driver, index, isLast, runs, onUpdate, onRemove, onAdd }) {
  const usedWatts = getDriverWatts(driver, runs);
  const pct = driver.max_watts > 0 ? (usedWatts / driver.max_watts) * 100 : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-500';
  const barWidth = Math.min(pct, 100);

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex items-center gap-3">
         <span className="text-xs font-medium w-24 shrink-0">{driver.name} — {Math.round(usedWatts)}W / {driver.max_watts}W</span>
        <Select value={String(driver.max_watts)} onValueChange={v => onUpdate(index, 'max_watts', parseFloat(v))}>
          <SelectTrigger className="h-7 w-20 text-xs shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">60W</SelectItem>
            <SelectItem value="96">96W</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0" onClick={() => onRemove(index)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        {isLast && (
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={onAdd}>
            <Plus className="h-3 w-3" /> Driver
          </Button>
        )}
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function DriverManager({ drivers, runs, onDriversChange }) {
  const updateDriver = (index, field, value) => {
    onDriversChange(drivers.map((d, i) => i === index ? { ...d, [field]: value } : d));
  };

  const removeDriver = (index) => {
    onDriversChange(drivers.filter((_, i) => i !== index));
  };

  const addDriver = () => {
    const nextN = drivers.length + 1;
    onDriversChange([...drivers, { name: `Driver ${nextN}`, max_watts: 96 }]);
  };

  if (drivers.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addDriver}>
          <Plus className="h-3 w-3" /> Driver
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {drivers.map((driver, index) => (
        <DriverRow
          key={driver.id ?? `local-${index}`}
          driver={driver}
          index={index}
          isLast={index === drivers.length - 1}
          runs={runs}
          onUpdate={updateDriver}
          onRemove={removeDriver}
          onAdd={addDriver}
        />
      ))}
    </div>
  );
}