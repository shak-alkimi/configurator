import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const WATTS_PER_FOOT = {
  "300lm (3.0w/ft)": 3.0,
  "360lm (3.6w/ft)": 3.6,
  "600lm (6.0w/ft)": 6.0
};

function getDriverWatts(driver, runs) {
  try {
    let total = 0;
    for (const run of (runs || [])) {
      try {
        if (!run.driver_group || !run.tape_type || !run.length_feet) continue;
        if (run.driver_group !== driver.name) continue;
        const wpf = WATTS_PER_FOOT[run.tape_type];
        if (wpf == null) continue;
        total += run.length_feet * wpf;
      } catch { /* skip bad run */ }
    }
    return total;
  } catch { return 0; }
}

function DriverRow({ driver, index, isLast, runs, onUpdate, onRemove, onAdd }) {
  const usedWatts = getDriverWatts(driver, runs);
  const pct = driver.maxWatts > 0 ? (usedWatts / driver.maxWatts) * 100 : 0;
  const barColor = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-500';
  const barWidth = Math.min(pct, 100);
  const runCount = (runs || []).filter(r => r.driver_group === driver.name).length;

  return (
    <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-medium">{driver.name}</span>
        <span className="inline-flex items-center justify-center h-5 px-1.5 text-xs font-semibold bg-slate-200 text-slate-700 rounded-full">
          {runCount}
        </span>
      </div>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
      <span className="text-xs text-slate-500 shrink-0 w-20 text-right whitespace-nowrap">
        {usedWatts.toFixed(1)}W / {driver.maxWatts}W
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <Select value={String(driver.maxWatts)} onValueChange={v => onUpdate(driver.id, 'maxWatts', parseFloat(v))}>
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">60W</SelectItem>
            <SelectItem value="96">96W</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0" onClick={() => onRemove(driver.id)}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

    </div>
  );
}

export default function DriverManager({ drivers, runs, onDriversChange }) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  const updateDriver = (id, field, value) => {
    onDriversChange(drivers.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDriver = (id) => {
    onDriversChange(drivers.filter(d => d.id !== id));
  };

  const addDriver = (maxWatts) => {
    const nextN = drivers.length + 1;
    onDriversChange([...drivers, { id: String(Date.now()), name: `Driver ${nextN}`, maxWatts }]);
    setShowAddMenu(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Drivers</span>
        <DropdownMenu open={showAddMenu} onOpenChange={setShowAddMenu}>
          <DropdownMenuTrigger asChild>
            <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => addDriver(60)}>60W Driver</DropdownMenuItem>
            <DropdownMenuItem onClick={() => addDriver(96)}>96W Driver</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}