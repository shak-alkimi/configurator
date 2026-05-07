import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, AlertTriangle, Plus } from "lucide-react";
import { calculateDriverGroups } from "@/components/calculator/calculations";

export default function DriverManager({ drivers, runs, onDriversChange, previewDriverGroup, previewWatts }) {
  const groupMap = Object.fromEntries(
    calculateDriverGroups(runs, drivers).map(g => [g.name, g])
  );

  const updateDriver = (id, field, value) => {
    onDriversChange(drivers.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const removeDriver = (id) => {
    onDriversChange(drivers.filter(d => d.id !== id));
  };

  const addDriver = () => {
    const nextN = drivers.length + 1;
    onDriversChange([...drivers, { id: String(Date.now()), name: `Driver ${nextN}`, maxWatts: 96 }]);
  };

  return (
    <div className="space-y-2">

      {drivers.map((driver, index) => {
        const group = groupMap[driver.name];
        const effectiveCapacity = driver.maxWatts * 0.8;
        const usedWatts = group?.totalWatts ?? 0;
        const loadPercent = group?.loadPercent ?? 0;
        const overloaded = group?.overloaded ?? false;
        const barColor = loadPercent > 90 ? 'bg-red-500' : loadPercent > 70 ? 'bg-yellow-400' : 'bg-green-500';

        // Preview segment for this driver
        const isPreviewDriver = previewDriverGroup && driver.name === previewDriverGroup && previewWatts > 0;
        const previewPercent = isPreviewDriver ? Math.min((previewWatts / effectiveCapacity) * 100, 100 - Math.min(loadPercent, 100)) : 0;
        const wouldOverload = isPreviewDriver && (usedWatts + previewWatts) > effectiveCapacity;

        return (
          <div key={driver.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
            {/* Name */}
            <span className="text-xs font-medium w-24 shrink-0">{driver.name}</span>
            {/* Max Watts */}
            <div className="flex items-center gap-1 shrink-0">
              <Select value={String(driver.maxWatts)} onValueChange={v => updateDriver(driver.id, 'maxWatts', parseFloat(v))}>
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60W</SelectItem>
                  <SelectItem value="96">96W</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Load text */}
            <span className="text-xs text-slate-600 shrink-0 w-28">
              {usedWatts.toFixed(1)}W / {effectiveCapacity.toFixed(1)}W
            </span>
            {/* Progress bar */}
            <div className="flex-1 min-w-0">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className={`h-full transition-all ${barColor}`}
                  style={{ width: `${Math.min(loadPercent, 100)}%` }}
                />
                {isPreviewDriver && previewPercent > 0 && (
                  <div
                    className={`h-full transition-all ${wouldOverload ? 'bg-red-400' : 'bg-yellow-300'} opacity-70`}
                    style={{ width: `${previewPercent}%` }}
                  />
                )}
              </div>
            </div>
            {/* Percent */}
            <span className={`text-xs shrink-0 w-9 text-right font-medium ${overloaded || wouldOverload ? 'text-red-600' : 'text-slate-500'}`}>
              {isPreviewDriver
                ? `${Math.round(Math.min(((usedWatts + previewWatts) / effectiveCapacity) * 100, 100))}%`
                : `${Math.round(loadPercent)}%`
              }
            </span>
            {/* Overload warning */}
            {overloaded && (
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            {/* Remove */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-400 hover:text-red-600 shrink-0"
              onClick={() => removeDriver(driver.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            {/* Add Driver — shown on the last row */}
            {index === drivers.length - 1 && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={addDriver}>
                <Plus className="h-3 w-3" /> Driver
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}